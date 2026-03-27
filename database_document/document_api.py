from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
import sys
from pathlib import Path

# --- DB 공유를 위한 경로 설정 ---
current_file_path = Path(__file__).resolve()
root_dir = current_file_path.parent.parent 

if str(root_dir) not in sys.path:
    sys.path.append(str(root_dir))

from database_document.database import get_db, Document, engine, Base
# ---------------------------------------------

# 정의된 모델을 바탕으로 docsinfos 테이블이 없으면 자동으로 생성
Base.metadata.create_all(bind=engine)

# 독립적인 FastAPI 앱 생성
app = FastAPI(title="Document DB Server")

# CORS 설정 (프론트엔드 통신 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class DifficultWordsUpdate(BaseModel):
    difficult_words: list

# 현재 로그인한 특정 유저의 문서 목록만 조회
@app.get("/api/documents")
def get_document_list(user_email: str = Query(...), db: Session = Depends(get_db)):
    docs = db.query(Document.id, Document.file_name, Document.created_at, Document.page_count, Document.file_size)\
             .filter(Document.user_email == user_email)\
             .order_by(Document.id.desc())\
             .all()

    result = [
        {
            "id": doc.id, 
            "file_name": doc.file_name, 
            "created_at": doc.created_at,
            "page_count": doc.page_count,  
            "file_size": doc.file_size    
        } 
        for doc in docs
    ]
    return result

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
        "s3_url": doc.s3_url,        # 원본 PDF 조회를 위해 추가
        "file_type": doc.file_type,  # PDF 여부 판단을 위해 추가
        "difficult_words": doc.difficult_words or [] 
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)