import io
import dlib
import numpy as np
from deepface import DeepFace
from PIL import Image
import logging

# Setup logger
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

class FaceRecognition:
    def __init__(self):
        self.detector = dlib.get_frontal_face_detector()
        self.shape_predictor = dlib.shape_predictor('/home/pridhvi/Desktop/integrate/Backend/pkg/recognition/shape_predictor_68_face_landmarks.dat')

    def recognize_face(self, face_image: io.BytesIO) -> np.ndarray:
        try:
            # Convert IOBytes object to bytes
            image_bytes = face_image.read()
            face_image.seek(0)  # Reset the buffer

            # Convert bytes to a PIL Image and then to a numpy array
            pil_image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
            image = np.array(pil_image)

            # Detect faces
            faces = self.detector(image, 0)
            
            if len(faces) > 1:
                raise ValueError('More than one face has been detected')
            elif len(faces) == 0:
                raise ValueError('No Face has been detected')
            
            # Extract the single face
            face = faces[0]
            face_shape = self.shape_predictor(image, face)
            face_chip = dlib.get_face_chip(image, face_shape)
            
            # Convert to PIL Image and extract embedding
            face_image = Image.fromarray(face_chip)
            face_embedding = self.extract_face_embedding(np.array(face_image))
            
            logger.info("Face embedding has been calculated successfully")
            return face_embedding
        
        except ValueError as ve:
            logger.error(f"Error in Extracting the Face image {ve}")
            raise
        except Exception as e:
            logger.error(f"Error in Extracting the Face image {e}")
            raise

    def extract_face_embedding(self, image):
        try:
            # Extract the face embedding using VGG-Face
            face_embedding = DeepFace.represent(image, model_name="VGG-Face")[0]["embedding"]
            
            logger.info("Successfully extracted vector embeddings from the face image")
            return np.array(face_embedding)
        
        except Exception as e:
            logger.error(f"Error in Extracting Face Embedding {e}")
            raise
