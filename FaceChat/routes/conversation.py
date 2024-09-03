from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
import logging
import numpy as np
import whisper
import io
import os
import math
from pydub import AudioSegment
import librosa
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv
from database import get_db
from models.user import User
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_google_vertexai import ChatVertexAI
import vertexai


router = APIRouter()

# Load environment variables from .env file
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Initialize Whisper
whisper_model = whisper.load_model("tiny.en")


# Initialize LangChain prompt template
user_template = """

User Details for reference : {user_data}

User's previous five chats with you : {last_5_chats}

User's similar conversations with you : {similar_conv}

User query: {user_input}

Assistant:
"""

system_template='You are a helpful assistant. Your task is to respond to the users queries based on the information you have. Dont include emojis in the response. '

#Intializing the vertexai with the cloud project
project_key = os.getenv("PROJECT_NAME")
google_credential_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS_PATH")

vertexai.init(project=project_key)
os.environ['GOOGLE_APPLICATION_CREDENTIALS']=google_credential_path

llm_model=ChatVertexAI(model='gemini-1.5-flash')

prompt_template=ChatPromptTemplate(
    [('system',system_template),('user',user_template)]
)

parser=StrOutputParser()

#Making a chain which automates the feeding of each component outputs
chain=prompt_template | llm_model | parser



def update_user_conversations(db: Session, user_id: int, new_conversations: str, new_conv_embedding: np.ndarray):
    try:
        # Query the user by ID
        user = db.query(User).filter(User.user_id == user_id).one_or_none()
        if not user:
            logger.error(f"User with ID {user_id} not found")
            return None
        
        # Append the new conversations to the existing ones
        if user.conversations is None:
            user.conversations=[]
        
        user.conversations.append(new_conversations)
        flag_modified(user, "conversations")
        logger.info("Successfully updated text conversations in database")
        
        #  append the new one if the conv embedding already exists
        if user.conv_embedding:
            numpy_embedding=np.array(user.conv_embedding)
            updated_embedding = np.concatenate((numpy_embedding, new_conv_embedding), axis=0)
            updated_embedding=updated_embedding.tolist()
        else:
            updated_embedding = new_conv_embedding.tolist()
        
        #limiting the conv embedding to 1000
        user.conv_embedding = updated_embedding[:1000]
        flag_modified(user, "conv_embedding") 
        
        # Commit the session to the database
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

 #creating conversation embeddings and pushing to database, along with normal conv text
def text_embeddings(db: Session,user_id,user_response,llm_response):
    try:
        model=  SentenceTransformer('all-MiniLM-L6-v2')
        sentences=[]
        sentences.append(user_response)
        sentences.append(llm_response)
    
        #text conversation, both - user response and llm response combined
        combined_text_convo='User Query : '+ user_response +'\n'+ 'Assistant Response : '+ llm_response + '\n'
    
        #conv embedding created
        conv_embedding=model.encode(sentences,normalize_embeddings=True)
        
        logger.info(f"Conversation embedding created successfully,{conv_embedding}")
        
        update_user_conversations(db,user_id,combined_text_convo,conv_embedding)
        logger.info("User conversation pushed to database successfully")
    except Exception as e:
        logger.error(f"creating text embedding failed{e}")
        raise
        
def context_extraction(db : Session,user_id: int,input_text: str):
    try:
        sentence=[]
        conv_context=[]
        total_context=''
        last_5_conv=''
        
        sentence.append(input_text)
        model= SentenceTransformer('all-MiniLM-L6-v2')
        
        input_embedding=model.encode(sentence,normalize_embeddings=True)
        input_embedding=input_embedding.astype(np.float64)
        
        user=db.query(User).filter(User.user_id==user_id).one_or_none()
        if not user:
            logger.error(f"No such user in the database, user_id ;{user_id}")
        
        if user.conversations:
            search_result=model.similarity(np.array(user.conv_embedding).astype(np.float64),input_embedding)
            result=search_result.tolist()
            for index,value in enumerate(result):
                if value[0]>=0.50:
                    if user.conversations[math.floor(index/2)] in conv_context:
                        continue
                    else:
                        conv_context.append(user.conversations[math.floor(index/2)])
        
        
        #total_context stores the similar conv from user's chat history
            for text in conv_context:
                total_context+=text + '\n'
        
        #last_5_conv stores the previous 5 chats of that user
            for conv in user.conversations[-5:]:
                last_5_conv+=conv + '\n'
        
                
        logger.info('Successfully retrieved similar conversations and last 5 conv of the user from his chat history')
        return total_context,last_5_conv
    
    except Exception as e:
        logger.error(f"Error in finding the similar conversations of the user from his chat history{e}")
        raise
        

    

@router.post("/conversation")
async def handle_conversation(request: Request,audio_file: UploadFile = File(...),db: Session = Depends(get_db)):
    
    # Extract user information from the request state
    user_id = request.session.get('user_id')
    if user_id is None:
        raise HTTPException(status_code=401, detail="User not authenticated")
    
    
    #storing the user details for any further uses in conversations
    if request.session.get('registered_user_details'):
        user_details=request.session.get('registered_user_details')
    else:
        user_details=request.session.get('verified_user_details')
        
    
    #voice processing with whisper, converted to text
    try:
        file_bytes = await audio_file.read()
        mp3_file_bytes=convert_webm_to_mp3(file_bytes)
        audio_np, _ = librosa.load(io.BytesIO(mp3_file_bytes), sr=16000)
        audio_transcription = whisper_model.transcribe(audio_np)
        user_message = audio_transcription["text"]
        logger.info(f"Transcribed user message: {user_message}")
    except Exception as e:
        logger.error(f"Error processing audio file: {e}")
        raise HTTPException(status_code=500, detail="Error processing audio file")
    
    
    # Generate a response using the Gemini API
    try:
        user_conv_context=context_extraction(db,user_id,user_message)
        generated_text=chain.invoke({'user_data':user_details,'last_5_chats':user_conv_context[1],
                                     'similar_conv':user_conv_context[0],'user_input':user_message})
        logger.info(f"Generated response: {generated_text}")
    except Exception as e:
        logger.error(f"Error generating response: {e}")
        raise HTTPException(status_code=500, detail="Error generating response")
    
    #function to create and update text embeddings to database
    text_embeddings(db,user_id,user_message,generated_text)

    return {
        "message": generated_text
    }
