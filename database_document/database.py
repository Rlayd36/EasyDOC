from sqlalchemy import create_engine, Column, Integer, String, Text, TIMESTAMP, JSON
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.dialects.mysql import LONGTEXT
from datetime import datetime
import os
from pathlib import Path
from dotenv import load_dotenv

"""_search = Path(__file__).resolve().parent
_env_files = []
for _ in range(5):  # 최대 5단계 상위 폴더까지 탐색
    _candidate = _search / ".env"
    if _candidate.exists():
        _env_files.append(_candidate)
    _search = _search.parent

for _ef in _env_files:
    load_dotenv(dotenv_path=_ef, override=True)

if _env_files:
    print(f"✓ database.py: .env 로드 완료 ({[str(f) for f in _env_files]})")"""

# DB 정보 가져오기
DB_USER = "root"
DB_PASSWORD = "root"
DB_HOST = "localhost"
DB_PORT = "3306"
DB_NAME = "easydoc"

# MySQL 연결 주소 만들기 (pymysql)
SQLALCHEMY_DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4"

# DB 엔진 및 세션 생성
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# 테이블 구조 정의 (MySQL과 1:1 매칭)
class Document(Base):
    __tablename__ = "docsinfos"

    id = Column(Integer, primary_key=True, index=True)
    file_name = Column(String(255), nullable=False)
    file_type = Column(String(50))
    s3_url = Column(String(1000))
    extracted_text = Column(LONGTEXT)
    difficult_words = Column(JSON)
    created_at = Column(TIMESTAMP, default=datetime.utcnow)
    page_count = Column(Integer, default=0)
    file_size = Column(String(50))
    user_email = Column(String(255), index=True)

# DB 연결 세션을 가져오는 함수 (FastAPI에서 사용)
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()