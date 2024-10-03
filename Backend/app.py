from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import auth, conversation
from starlette.middleware.sessions import SessionMiddleware
import logging
from dotenv import load_dotenv
import os
from sentence_transformers import SentenceTransformer
from sentence_transformers import SentenceTransformer
import whisper
from langchain_google_genai import ChatGoogleGenerativeAI


load_dotenv()

app = FastAPI()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Add the session middleware
app.add_middleware(SessionMiddleware, secret_key="your_secret_key" , session_cookie="session_id")

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

@app.on_event("startup")
async def startup_event():
    # Initialize SentenceTransformer
    app.state.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
    logger.info("SentenceTransformer model loaded successfully")

    # Initialize Whisper
    app.state.whisper_model = whisper.load_model("tiny.en")
    logger.info("Whisper model loaded successfully")

    # Initialize ChatGoogleGenerativeAI
    google_api_key = os.getenv("GEMINI_API_KEY")
    app.state.llm_model = ChatGoogleGenerativeAI(api_key=google_api_key, model='gemini-1.5-flash')
    logger.info("ChatGoogleGenerativeAI model initialized successfully")

@app.get("/")
def read_root():
    return {"message": "FaceChat API"}