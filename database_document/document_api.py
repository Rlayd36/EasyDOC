from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
import boto3
import os
import sys
from pathlib import Path
from urllib.parse import urlparse, unquote


def to_utc_iso(dt):
    """DB에 저장된 시각을 UTC로 간주해 ISO 8601 문자열(Z)로 직렬화 (브라우저 로컬 표시용)."""
    if dt is None:
        return None
    if not isinstance(dt, datetime):
        return dt
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")

# --- DB 공유를 위한 경로 설정 ---
current_file_path = Path(__file__).resolve()
root_dir = current_file_path.parent.parent

if str(root_dir) not in sys.path:
    sys.path.append(str(root_dir))

from database_document.database import get_db, Document, engine, Base
# ---------------------------------------------

AWS_REGION = os.getenv("AWS_DEFAULT_REGION", "ap-northeast-2")
BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "easydoc-s3")
s3_client = boto3.client(
    "s3",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    region_name=AWS_REGION,
)


def build_signed_s3_url(raw_url: str | None) -> str | None:
    if not raw_url:
        return raw_url
    try:
        parsed = urlparse(raw_url)
        path = unquote(parsed.path.lstrip("/"))
        if not path:
            return raw_url
        return s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": BUCKET_NAME, "Key": path},
            ExpiresIn=3600,
        )
    except Exception as e:
        print(f"[document_api] presigned URL 생성 실패: {e}")
        return raw_url


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        print(f"[document_api] DB 초기화 실패 (서버는 기동됨): {e}")
    yield


app = FastAPI(title="Document DB Server", lifespan=lifespan)

# * 와 credentials=True 동시 사용 불가 → 브라우저 CORS 오류 방지
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class DifficultWordsUpdate(BaseModel):
    difficult_words: list

# 현재 로그인한 특정 유저의 문서 목록만 조회
@app.get("/api/documents")
def get_document_list(user_email: str = Query(...), db: Session = Depends(get_db)):
    docs = db.query(
        Document.id,
        Document.file_name,
        Document.created_at,
        Document.page_count,
        Document.file_size,
        Document.file_type,
    ).filter(Document.user_email == user_email).order_by(
        Document.created_at.desc(),
        Document.id.desc(),
    ).all()

    result = [
        {
            "id": doc.id,
            "file_name": doc.file_name,
            "created_at": to_utc_iso(doc.created_at),
            "page_count": doc.page_count,
            "file_size": doc.file_size,
            "file_type": doc.file_type,
        }
        for doc in docs
    ]
    return result


@app.get("/api/documents/stats")
def get_document_stats(user_email: str = Query(...), db: Session = Depends(get_db)):
    """사용자 문서 수·페이지 수·doc_type별 건수 (카테고리 집계는 프론트에서 registry 기준)"""
    rows = (
        db.query(Document.doc_type, Document.page_count)
        .filter(Document.user_email == user_email)
        .all()
    )

    total_docs = len(rows)
    total_pages = sum((row.page_count or 1) for row in rows)

    type_counts: dict[str, int] = {}
    for row in rows:
        doc_type = (row.doc_type or "default").strip() or "default"
        type_counts[doc_type] = type_counts.get(doc_type, 0) + 1

    return {
        "documents": total_docs,
        "pages": total_pages,
        "type_counts": type_counts,
    }


# 특정 문서 상세 조회
@app.get("/api/documents/{doc_id}")
def get_document_detail(doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()

    if not doc:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")

    return {
        "id": doc.id,
        "file_name": doc.file_name,
        "text": doc.extracted_text,
        "s3_url": build_signed_s3_url(doc.s3_url),
        "file_type": doc.file_type,
        "difficult_words": doc.difficult_words or [],
        "created_at": to_utc_iso(doc.created_at),
        "doc_type": doc.doc_type or "default",
    }

# 어려운 단어 DB에 저장
@app.put("/api/documents/{doc_id}/words")
def update_difficult_words(doc_id: int, data: DifficultWordsUpdate, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()

    if not doc:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")

    doc.difficult_words = data.difficult_words
    db.commit()

    return {"message": "어려운 단어 업데이트 성공"}

class TextUpdate(BaseModel):
    text: str

# 문서 텍스트 수정 저장
@app.patch("/api/documents/{doc_id}/text")
def update_document_text(doc_id: int, data: TextUpdate, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    doc.extracted_text = data.text
    db.commit()
    return {"message": "텍스트 업데이트 성공"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)