from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from sqlalchemy.orm import Session
import numpy as np
import logging
import librosa
import json
import re
import os
import io
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


#Function for similarity search of voice and image embeddings
def find_similar_embeddings(db: Session, img_embedding, vce_embedding):
    similarity_threshold = 0.5
    img_embedding=img_embedding.tolist()[0]
    vce_embedding=vce_embedding.tolist()
    try:
        logger.info('Searching for Highest similarity among the users')

        # Calculate similarities
        image_similarity = User.face_image.cosine_distance(img_embedding)
        voice_similarity = User.voice_sample.cosine_distance(vce_embedding)
    
        query = (
            db.query(
                User.user_id,  # Assuming the User model has 'id' and 'name' fields
                User.name,
                User.age,
                User.gender,
                User.contact,
                image_similarity.label("image_similarity"),
                voice_similarity.label("voice_similarity"),
            )
            .filter(image_similarity < similarity_threshold)
            .filter(voice_similarity < similarity_threshold)
            .order_by((image_similarity + voice_similarity).asc())
            .limit(1)
            .one_or_none()
        )

        if query:
            matched_user_id = query.user_id
            matched_user_name = query.name
            matched_user_age=query.age
            matched_user_gender=query.gender
            matched_user_contact=query.contact
            logger.info(f"Success,Found matching user{matched_user_id}")
            return matched_user_id, matched_user_name,matched_user_age,matched_user_gender,matched_user_contact
        else:
            logger.info("No Matching user with the provided embeddings")
            return 'No Match Found'
    
    except Exception as e:
        logger.error(f"Error in finding the similarity of embeddings{e}")
    
@router.post('/verify')
async def verify_user(request: Request,file: UploadFile = File(...), db: Session = Depends(get_db)):
    file_name=file.filename
    file_ext=file_name.split('.')[-1].lower()
    
    #function to retrieve image embedding
    async def image():
        logger.info("Received image file for verification")
        try:
            image_bytes=await file.read()
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
            file_bytes = await file.read()
            sound_embedding = extract_voice_features(io.BytesIO(file_bytes))
            logger.info(f"Extracted voice vector: {sound_embedding}")
            return sound_embedding

        except Exception as e:
            logger.error(f"Error extracting voice vector: {e}")
            raise HTTPException(status_code=500, detail="Error extracting voice vector")

        
    #condition to divide the image and voice file
    if file_ext in ['jpg','png','jpeg']:
        global image_embedding
        image_embedding= await image()
    elif file_ext in ['wav','mp3','aiff']:
        global voice_embedding
        voice_embedding=await voice()
    else :
        raise HTTPException(status_code=404, detail="Unsupported File Type")
    
    
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
        return {"user_id": user_dict['user_id'], "message": verified_message}
    else:
        logger.info("No matching user found")
        return {'status': 'error', 'message':'You are new here please register'}
    


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

@router.post("/register")
async def register_user(request: Request, db: Session = Depends(get_db), voice_file: UploadFile = File(...)):
    try:
        # Step 1: Process the audio file
        file_bytes = await voice_file.read()
        audio_np, _ = librosa.load(io.BytesIO(file_bytes), sr=16000)
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
                    return {"message": "User registered successfully", "user_id": new_user.user_id , "details":user_details}
                    
                except json.JSONDecodeError as e:
                    logger.error(f"Error decoding JSON: {e}")
                    raise HTTPException(status_code=500, detail=f"Error decoding JSON: {str(e)}")
            else:
                logger.error("Unable to extract JSON from the LLM response.")
                
    except StopCandidateException as e:
        logger.error(f"Model stopped due to safety concerns: {e}")
        raise HTTPException(status_code=400, detail="The input was flagged by the model's safety checks. Please try again with different input.")
    except Exception as e:
        logger.error(f"Error processing request: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing request: {str(e)}")
