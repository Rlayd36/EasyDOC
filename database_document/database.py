import unicodedata

from sqlalchemy import create_engine, Column, Integer, String, Text, TIMESTAMP, JSON
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from sqlalchemy.dialects.mysql import LONGTEXT
from datetime import datetime
import os
from pathlib import Path
from urllib.parse import quote_plus
from dotenv import load_dotenv

_search = Path(__file__).resolve().parent
for _ in range(8):
    _candidate = _search / ".env"
    if _candidate.exists():
        load_dotenv(dotenv_path=_candidate, override=True)
        break
    _search = _search.parent

DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "root")
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_NAME = os.getenv("DB_NAME", "easydoc")

SQLALCHEMY_DATABASE_URL = (
    f"mysql+pymysql://{quote_plus(DB_USER)}:{quote_plus(DB_PASSWORD)}"
    f"@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4"
)

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True,
    connect_args={"connect_timeout": 15},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# 테이블 구조 정의 (MySQL과 1:1 매칭)
class Document(Base):
    __tablename__ = "docsinfos"

    id = Column(Integer, primary_key=True, index=True)
    file_name = Column(String(255), nullable=False)
    content_hash = Column(String(64), nullable=True, index=True)
    file_type = Column(String(50))
    s3_url = Column(String(1000))
    extracted_text = Column(LONGTEXT)
    difficult_words = Column(JSON)
    created_at = Column(TIMESTAMP, default=datetime.utcnow)
    page_count = Column(Integer, default=0)
    file_size = Column(String(50))
    user_email = Column(String(255), index=True)
    doc_type = Column(String(50), nullable=True, default="default")


def normalize_document_filename(name: str) -> str:
    """경로 제거·유니코드 NFC 정규화로 동일 파일명 비교를 일관되게 한다."""
    base = Path(str(name)).name
    return unicodedata.normalize("NFC", base.strip())


def upsert_document_by_identity(
    db: Session,
    *,
    user_email: str,
    file_name: str,
    content_hash: str,
    fields: dict,
) -> Document:
    """동일 사용자·파일명·내용 해시면 행을 갱신하고 created_at을 최신으로 (최근 목록 상단)."""
    fn = normalize_document_filename(file_name)
    existing = (
        db.query(Document)
        .filter(
            Document.user_email == user_email,
            Document.file_name == fn,
            Document.content_hash == content_hash,
        )
        .first()
    )
    now = datetime.utcnow()
    if existing:
        for key, val in fields.items():
            setattr(existing, key, val)
        existing.created_at = now
        db.commit()
        db.refresh(existing)
        return existing
    doc = Document(
        user_email=user_email,
        file_name=fn,
        content_hash=content_hash,
        **fields,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


# DB 연결 세션을 가져오는 함수 (FastAPI에서 사용)
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()