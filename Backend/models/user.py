from sqlalchemy import Column, Integer, String,FLOAT,ARRAY
from database import Base
from sqlalchemy.ext.mutable import MutableList
from pgvector.sqlalchemy import Vector
from database import engine, SessionLocal

class User(Base):
    __tablename__ = 'usersdetails'
    user_id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    age = Column(Integer, nullable=False)
    gender = Column(String(10), nullable=False)
    contact = Column(String(100), nullable=False)
    face_image = Column(ARRAY(FLOAT), nullable=False)
    voice_sample = Column(ARRAY(FLOAT), nullable=False)
    conversations =Column(MutableList.as_mutable(ARRAY(String)),nullable=True)
    conv_embedding = Column(MutableList.as_mutable(ARRAY(FLOAT,dimensions=2)), nullable=True)


# Dependency to get the DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

Base.metadata.create_all(bind=engine)