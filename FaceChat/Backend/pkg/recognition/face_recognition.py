import cv2
import numpy as np
import logging
from imgbeddings import imgbeddings
import io
from PIL import Image

logging.basicConfig(level=logging.INFO,)
logger=logging.getLogger(__name__)

class FaceRecognition:
    def __init__(self):
        self.face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

    def recognize_face(self, face_image: io.BytesIO) -> np.ndarray:
        try:
            #converted IOBytes object to bytes
            image_bytes=face_image.read()
        
            #converted bytes to numpy array
            image_array= np.frombuffer(image_bytes,np.uint8)
        
            #converted numpy array in to image
            image=cv2.imdecode(image_array,cv2.IMREAD_COLOR)
        
            #converted the image to grey for face detection
            gray_image=cv2.cvtColor(image,cv2.COLOR_BGR2GRAY)
        
            logger.info('Image is read and converted to Gray-scale for face detection')
        
            faces = self.face_cascade.detectMultiScale(gray_image, scaleFactor=1.1, minNeighbors=2, minSize=(100, 100))
        
            if len(faces)> 1:
                raise ValueError('More than one face have been detected')
            elif len(faces)==0:
                raise ValueError('No Face have been detected')
        
            # Extract the single face
            (x, y, w, h) = faces[0]
            face = image[y:y+h, x:x+w]
        
            # Extract the face embedding
            face_embedding = self.extract_face_embedding(face)
            
            logger.info("Face embedding have been calculated successfully")
            return face_embedding
        
        except ValueError as ve:
            logger.error(f"Error in Extracting the Face image {ve}")
            raise
        except Exception as e:
            logger.error(f"Error in Extracting the Face image {e}")
            raise
            

    def extract_face_embedding(self, image):
        try:
            face_image=Image.fromarray(image)
            imembed=imgbeddings()
            embedding=imembed.to_embeddings(face_image)
            logger.info("Successfully extracted vector embeddings from the face image")
            return embedding
        
        except Exception as e:
            logger.error(f"Error in Extracting Face Embedding {e}")
            raise