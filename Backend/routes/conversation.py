from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
import logging
import numpy as np
import io
import math
from pydub import AudioSegment
import librosa
from dotenv import load_dotenv
from database import get_db
from models.user import User
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_google_genai import ChatGoogleGenerativeAI # Import the new class

router = APIRouter()

# Load environment variables from .env file
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize LangChain prompt template
user_template = """
User Details for reference : {user_data}
User's previous five chats with you : {last_5_chats}
User's similar conversations with you : {similar_conv}
User query: {user_input}
Assistant:
"""

system_template = "You are a helpful assistant. Your task is to respond to the users queries based on the information you have , use the information you have about the{user_data} , {last_5_chats} ,  {similar_conv}. Don't include emojis in the response."

# Set up the prompt template
prompt_template = ChatPromptTemplate(
    [('system', system_template), ('user', user_template)]
)

parser = StrOutputParser()


def update_user_conversations(db: Session, user_id: int, new_conversations: str, new_conv_embedding: np.ndarray):
    try:
        user = db.query(User).filter(User.user_id == user_id).one_or_none()
        if not user:
            logger.error(f"User with ID {user_id} not found")
            return None

        if user.conversations is None:
            user.conversations = []

        user.conversations.append(new_conversations)
        flag_modified(user, "conversations")
        logger.info("Successfully updated text conversations in database")

        if user.conv_embedding:
            numpy_embedding = np.array(user.conv_embedding)
            updated_embedding = np.concatenate((numpy_embedding, new_conv_embedding), axis=0).tolist()
        else:
            updated_embedding = new_conv_embedding.tolist()

        user.conv_embedding = updated_embedding[:1000]  # Limit to 1000 embeddings
        flag_modified(user, "conv_embedding")

        db.commit()
        db.refresh(user)
        logger.info('Successfully Updated the User Conversations and Embeddings in the Database')
        return user
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating user conversations and embeddings: {e}")
        return None

def convert_webm_to_mp3(file_bytes: bytes) -> bytes:
    audio = AudioSegment.from_file(io.BytesIO(file_bytes), format="webm")
    mp3_io = io.BytesIO()
    audio.export(mp3_io, format="mp3")
    mp3_io.seek(0)
    return mp3_io.read()

def text_embeddings( request:Request, db: Session, user_id: int, user_response: str, llm_response: str):    
    try:

        model = request.app.state.embedding_model
        sentences = [user_response, llm_response]
        combined_text_convo = f"User Query: {user_response}\nAssistant Response: {llm_response}\n"
        conv_embedding = model.encode(sentences, normalize_embeddings=True)
        logger.info(f"Conversation embedding created successfully, {conv_embedding}")
        update_user_conversations(db, user_id, combined_text_convo, conv_embedding)
        logger.info("User conversation pushed to database successfully")
    except Exception as e:
        logger.error(f"Creating text embedding failed: {e}")
        raise

def context_extraction(request:Request,db: Session, user_id: int, input_text: str):
    try:
        sentence = [input_text]
        conv_context = []
        total_context = ''
        last_5_conv = ''

        model = request.app.state.embedding_model
        input_embedding = model.encode(sentence, normalize_embeddings=True).astype(np.float64)

        user = db.query(User).filter(User.user_id == user_id).one_or_none()
        if not user:
            logger.error(f"No such user in the database, user_id: {user_id}")
            return '', ''

        if user.conversations:
            search_result = model.similarity(np.array(user.conv_embedding).astype(np.float64), input_embedding)
            for index, value in enumerate(search_result.tolist()):
                if value[0] >= 0.50 and user.conversations[math.floor(index / 2)] not in conv_context:
                    conv_context.append(user.conversations[math.floor(index / 2)])

            total_context = '\n'.join(conv_context)
            last_5_conv = '\n'.join(user.conversations[-5:])

        logger.info('Successfully retrieved similar conversations and last 5 conv of the user from chat history')
        return total_context, last_5_conv
    except Exception as e:
        logger.error(f"Error in finding the similar conversations of the user from chat history: {e}")
        raise

@router.post("/api/conversation")
async def handle_conversation(request: Request, audio_file: UploadFile = File(...), db: Session = Depends(get_db)):
    user_id = request.session.get('user_id')
    logger.info(f"Retrieved user_id from session: {user_id}")

    if user_id is None:
        raise HTTPException(status_code=401, detail="User not authenticated")

    user_details = request.session.get('registered_user_details')
    if user_details is None:
        user_details = request.session.get('verified_user_details')

    logger.info(f"Retrieved user_details from session: {user_details}")

    if not user_details:
        logger.error("User details not found in session")
        raise HTTPException(status_code=400, detail="User details not found")

    try:
        file_bytes = await audio_file.read()
        mp3_file_bytes = convert_webm_to_mp3(file_bytes)
        audio_np, _ = librosa.load(io.BytesIO(mp3_file_bytes), sr=16000)
        audio_transcription = request.app.state.whisper_model.transcribe(audio_np)
        user_message = audio_transcription["text"]
        logger.info(f"Transcribed user message: {user_message}")
    except Exception as e:
        logger.error(f"Error processing audio file: {e}")
        raise HTTPException(status_code=500, detail="Error processing audio file")

    try:
        user_conv_context = context_extraction(request ,db, user_id, user_message)
        
        # Create the chain here, using the app state
        chain = prompt_template | request.app.state.llm_model | parser
        
        generated_text = chain.invoke({
            'user_data': user_details,
            'last_5_chats': user_conv_context[1],
            'similar_conv': user_conv_context[0],
            'user_input': user_message
        })
        logger.info(f"Generated response: {generated_text}")
    except Exception as e:
        logger.error(f"Error generating response: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error generating response")

    text_embeddings(request ,db, user_id, user_message, generated_text)

    return {"responseText": generated_text}