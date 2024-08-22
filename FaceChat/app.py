from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import auth, conversation
from starlette.middleware.sessions import SessionMiddleware
import logging
from dotenv import load_dotenv
import os


load_dotenv()

app = FastAPI()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Add the session middleware
app.add_middleware(SessionMiddleware, secret_key=os.getenv("SESSION_KEY"))

app.include_router(auth.router, prefix="/auth")
app.include_router(conversation.router, prefix="/conversation")

origins = [
    "http://localhost:8000",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "FaceChat API"}