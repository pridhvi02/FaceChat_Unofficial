from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from sqlalchemy.orm import Session
from scipy.spatial.distance import cosine
import numpy as np
import logging
import librosa
import json
import re
from sklearn.metrics.pairwise import cosine_distances
import os
import io
from pydub import AudioSegment
from google.generativeai.types.generation_types import StopCandidateException
import whisper
import google.generativeai as genai
from models.user import User
from pkg.recognition.voice_recognition import extract_voice_features
from database import get_db
from pkg.recognition.face_recognition import FaceRecognition
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


router = APIRouter()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


#Global Variable for image and voice embeddings, 
image_embedding = np.array([[]])
voice_embedding = np.array([[]])


def find_similar_embeddings(db: Session, img_embedding, vce_embedding):
    similarity_threshold = 0.2
    img_embedding = np.array(img_embedding).flatten()
    vce_embedding = np.array(vce_embedding).flatten()

    try:
        logger.info('Searching for the user with the highest similarity')

        # Load users from the database
        users = db.query(
            User.user_id,
            User.name,
            User.age,
            User.gender,
            User.contact,
            User.face_image,
            User.voice_sample
        ).all()

        best_match = None
        best_similarity = float('inf')

        for user in users:
            # Convert user embeddings to numpy arrays
            face_image_embedding = np.array(user.face_image).flatten()
            voice_sample_embedding = np.array(user.voice_sample).flatten()

            # Compute cosine similarities
            image_similarity = cosine_distances([face_image_embedding], [img_embedding])[0][0]
            voice_similarity = cosine_distances([voice_sample_embedding], [vce_embedding])[0][0]

            total_similarity = image_similarity + voice_similarity

            # Log the individual similarities for debugging
            logger.info(f"User {user.user_id} - Image Similarity: {image_similarity}, Voice Similarity: {voice_similarity}, Total Similarity: {total_similarity}")

            if total_similarity < best_similarity and image_similarity < similarity_threshold and voice_similarity < similarity_threshold:
                best_similarity = total_similarity
                best_match = user

        if best_match:
            logger.info(f"Match found: User ID {best_match.user_id} with total similarity {best_similarity}")
            return (best_match.user_id, best_match.name, best_match.age, best_match.gender, best_match.contact)
        else:
            logger.info("No user matched with the provided embeddings based on the threshold.")
            return 'No Match Found'

    except Exception as e:
        logger.error(f"Error in finding similarity of embeddings: {e}")
        return 'Error'

    

def convert_webm_to_mp3(file_bytes: bytes) -> bytes:
    audio = AudioSegment.from_file(io.BytesIO(file_bytes), format="webm")
    mp3_io = io.BytesIO()
    audio.export(mp3_io, format="mp3")
    mp3_io.seek(0)
    return mp3_io.read()

@router.post('/api/verify')
async def verify_user(request: Request,face_image: UploadFile = File(...), voice_audio: UploadFile = File(...), db: Session = Depends(get_db)):
    #function to retrieve image embedding
    async def image():
        logger.info("Received image file for verification")
        try:
            image_bytes=await face_image.read()
            face_object= FaceRecognition()
            pic_embedding= face_object.recognize_face(io.BytesIO(image_bytes))
            logger.info(f"Extracted Image vector successfully: {pic_embedding}")
            return pic_embedding
        
        except Exception as e:
            logger.error(f"Error in extracting the image embedding or similarity search in DB {e}")
            raise
    
    #function to retrieve voice embedding
    async def voice():
        logger.info("Received voice file for verification")
        try:
            file_bytes = await voice_audio.read()
            # mp3_file_bytes = convert_webm_to_mp3(file_bytes)
            mp3_file_bytes = file_bytes
            sound_embedding = extract_voice_features(io.BytesIO(mp3_file_bytes))
            logger.info(f"Extracted voice vector: {sound_embedding}")
            return sound_embedding

        except Exception as e:
            logger.error(f"Error extracting voice vector: {e}")
            raise HTTPException(status_code=500, detail="Error extracting voice vector")

        
    global image_embedding
    image_embedding= await image()
    global voice_embedding
    voice_embedding=await voice()
   
    
    #Handling the result got from the similarity search
    search_result= find_similar_embeddings(db,image_embedding,voice_embedding)
    
    
    #checking if the returned item is a tuple with userid and user name, if yes user_id and name is provided to the prompt
    if search_result and isinstance(search_result,tuple):                        
        logger.info("Matching user found")
        
        user_dict = {
        'user_id': search_result[0],
        'name': search_result[1],
        'age': search_result[2],  
        'gender': search_result[3],
        'contact': search_result[4]
        }       
        
        request.session['user_id']=user_dict['user_id']
        request.session['verified_user_details']= user_dict

        #User Found and Getting response from Gemini
        verified_message=f"Welcome back {user_dict['name']}, what can i help you with today? "
        logger.info(f"Verification done and the verified message with name of the user is sent to frontend: {verified_message}")
        return {'status': 'verified', "responseText": verified_message}
    else:
        logger.info("No matching user found")
        return {'status': 'error', 'responseText':'Seems like You are new here, please register with us , to continue.'}
    


                                                            #END OF VERIFY ENDPOINT
#-------------------------------------------------------------------------------------------------------------------------------------------------------#





# Retrieve the API key from environment variables
gemini_api_key = os.getenv("GEMINI_API_KEY")

genai.configure(api_key=gemini_api_key)


# Load the Whisper model
whisper_model = whisper.load_model("tiny.en")

# Initialize the LangChain prompt template
instruction = (
    """
    **IMPORTANT NOTE:** avoid using every emojis like (😊)  in the response

    You are a system that needs to collect specific information from the user. 
    Your goal is to gather the following details:
    
    1. **Name**: The user's full name.
    2. **Age**: The user's age in years (as an integer).
    3. **Gender**: The user's gender.
    4. **Contact Number**: The user's 10-digit phone number. Ensure that you extract only the 10-digit long number, avoiding any punctuations such as commas, periods, or hyphens.

    Please guide the conversation to collect all this information naturally and conversationally. 
    Once all the information is gathered, return it in the following JSON format:

    ```json
    {
      "name": "Name",
      "age": Age,
      "gender": "Gender",
      "contact": "Contact Number"
    }
    ```

    you should say 'completed' as a stop sequence after confirming the information with the user. Avoid including emojis or additional text in the JSON response.
    """
)


# Initialize the Generative Model
model = genai.GenerativeModel(
    "gemini-1.5-flash",
    system_instruction=instruction,
    safety_settings={
        'HATE': 'BLOCK_NONE',
        'HARASSMENT': 'BLOCK_NONE',
        'SEXUAL': 'BLOCK_NONE',
        'DANGEROUS': 'BLOCK_NONE'
    }
)

# Start a chat session
chat = model.start_chat(
    history=[
        {"role": "user", "parts": "Hello"},
        {"role": "model", "parts": "Great to meet you. What would you like to know?"},
    ]
)

# Track user state in a global dictionary (or use session/database)
user_states = {}

@router.post("/api/register")
async def register_user(request: Request, db: Session = Depends(get_db),voice_file: UploadFile = File(...)):
    try:
        # Step 1: Process the audio file
        file_bytes = await voice_file.read()
        # mp3_file_bytes = convert_webm_to_mp3(file_bytes)
        mp3_file_bytes = file_bytes
        audio_np, _ = librosa.load(io.BytesIO(mp3_file_bytes), sr=16000)
        audio_transcription = whisper_model.transcribe(audio_np)
        user_message = audio_transcription["text"]
        logger.info(f"Transcribed user message: {user_message}")
        
        response = chat.send_message(user_message)
        response_text = response.text
        logger.info(f"LLM response: {response_text}")


        json_pattern = re.search(r'```json\s*(\{.*\})\s*```', response_text, re.DOTALL)
        # Step 2: Identify the JSON block in the response
        if "completed" in response.text.lower():
            
            if json_pattern:
                json_str = json_pattern.group(1)
                try:
                    # Step 3: Parse the JSON
                    user_details = json.loads(json_str)
                    logger.info(f"Extracted user details: {user_details}")
                    
                    # Step 4: Store the data in the database
                    new_user = User(
                        name=user_details["name"],
                        age=user_details["age"],
                        gender=user_details["gender"],
                        contact=user_details["contact"],
                        face_image=image_embedding.tolist()[0],
                        voice_sample=voice_embedding.tolist(),  # Ensure correct key names
                    )
                    db.add(new_user)
                    db.commit()
                    logger.info(f"New User id {new_user.user_id} ")
                    request.session['user_id'] = new_user.user_id
                    request.session["registered_user_details"] = user_details
                    return {"status":"registered","responseText": f"OK {new_user.name}, you have registered successfully, so what can i do for you today"}
                    
                except json.JSONDecodeError as e:
                    logger.error(f"Error decoding JSON: {e}")
                    raise HTTPException(status_code=500, detail=f"Error decoding JSON: {str(e)}")
            else:
                logger.error("Unable to extract JSON from the LLM response.")
        else :
            return {"status":"processing","responseText": f"{response_text}"}
                
    except StopCandidateException as e:
        logger.error(f"Model stopped due to safety concerns: {e}")
        raise HTTPException(status_code=400, detail="The input was flagged by the model's safety checks. Please try again with different input.")
    except Exception as e:
        logger.error(f"Error processing request: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing request: {str(e)}")