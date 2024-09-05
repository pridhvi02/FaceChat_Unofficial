import librosa
import numpy as np
import logging
import io

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class VoiceRecognition:
    def __init__(self):
        self.voice_model = None  # Initialize a voice recognition model
        logger.info("VoiceRecognition model initialized.")

    def recognize_voice(self, voice_sample: io.BytesIO) -> np.ndarray:
        try:
            # Load the voice sample using librosa
            voice_sample.seek(0)  # Ensure we are reading from the start of the file
            y, sr = librosa.load(voice_sample, sr=16000)
            
            # Extract the voice features
            voice_features = self.extract_voice_features(y, sr)
            logger.info("Voice features extracted successfully.")
            return voice_features
        except Exception as e:
            logger.error(f"Error in recognizing voice: {e}")
            raise

    def extract_voice_features(self, y: np.ndarray, sr: int) -> np.ndarray:
        try:
            mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
            voice_features = np.mean(mfccs.T, axis=0)
            logger.info(f"Extracted voice features: {voice_features}")
            return voice_features
        except Exception as e:
            logger.error(f"Error in extracting voice features: {e}")
            raise

voice_recognition = VoiceRecognition()

def extract_voice_features(file: io.BytesIO) -> np.ndarray:
    return voice_recognition.recognize_voice(file)
