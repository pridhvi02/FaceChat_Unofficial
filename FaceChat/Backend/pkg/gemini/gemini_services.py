import logging
import google.generativeai as genai
from fastapi import HTTPException


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def generate_gemini_response(prompt_text: str) -> str:
    try:
        model = genai.GenerativeModel('gemini-pro')
        response = model.generate_content(prompt_text,safety_settings=[
            {
              "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              "threshold": "BLOCK_NONE"
            },
            {
              "category": "HARM_CATEGORY_HATE_SPEECH",
              "threshold": "BLOCK_NONE"
            },
            {
              "category": "HARM_CATEGORY_HARASSMENT",
              "threshold": "BLOCK_NONE"            },
            {
              "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
              "threshold": "BLOCK_NONE"
            }
          ])
        
        # Log the entire response to understand its structure
        logger.info(f"Full response from Gemini API: {response}")

        # Check if the response contains text and handle accordingly
        if hasattr(response, 'text'):
            return response.text
        else:
            logger.error(f"Response does not contain 'text': {response}")
            raise HTTPException(status_code=500, detail="Response format error: 'text' not found")
    except Exception as e:
        logger.error(f"Error generating response from Gemini: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error generating response from Gemini: {str(e)}")
    
    

