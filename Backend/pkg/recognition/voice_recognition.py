import logging
import io
import torch
import numpy as np
from pyannote.audio import Model, Inference
from scipy.spatial.distance import cdist
from pyannote.core import Segment

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class VoiceRecognition:
    def __init__(self, hf_token: str):
        # Load the pretrained pyannote.embedding model using the Hugging Face token
        hf_token = "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" 
        self.model = Model.from_pretrained("pyannote/embedding", use_auth_token=hf_token)
        self.inference = Inference(self.model, window="whole")
        logger.info("Pyannote VoiceRecognition model initialized.")

    def recognize_voice(self, voice_sample: io.BytesIO) -> np.ndarray:
        try:
            # Ensure we are reading from the start of the file
            voice_sample.seek(0)
            
            # Save the file temporarily to apply pyannote (since pyannote works on file paths)
            with open("temp.wav", "wb") as f:
                f.write(voice_sample.read())
            
            # Extract the embedding using the pretrained model
            embedding = self.inference("temp.wav")
            logger.info("Voice embedding extracted successfully.")
            
            # Convert PyTorch tensor to NumPy array for compatibility with librosa-like output
            return embedding
        except Exception as e:
            logger.error(f"Error in recognizing voice: {e}")
            raise

    def extract_excerpt(self, voice_sample: io.BytesIO, start: float, end: float) -> np.ndarray:
        try:
            voice_sample.seek(0)
            with open("temp_excerpt.wav", "wb") as f:
                f.write(voice_sample.read())
            
            excerpt = Segment(start, end)
            embedding = self.inference.crop("temp_excerpt.wav", excerpt)
            logger.info(f"Voice embedding extracted from excerpt [{start}, {end}]")
            
            # Convert PyTorch tensor to NumPy array for compatibility with librosa-like output
            return embedding
        except Exception as e:
            logger.error(f"Error in extracting voice excerpt: {e}")
            raise

# Usage Example
hf_token = "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"  # Add your Hugging Face token here
voice_recognition = VoiceRecognition(hf_token)

def extract_voice_features(file: io.BytesIO) -> np.ndarray:
    return voice_recognition.recognize_voice(file)