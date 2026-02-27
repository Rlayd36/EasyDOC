from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
import boto3
import os
import sys
from urllib.parse import unquote
from ocr_logic import EasyDocOCR
from dotenv import load_dotenv
from sqlalchemy.orm import Session

# 현재 파일의 상위 폴더(EasyDOC)를 경로를 추가하여 database 폴더에 접근 가능하게 함
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.append(parent_dir)

from database_document.database import get_db, Document
from sqlalchemy.orm import Session

load_dotenv()

app = FastAPI()

# Google Cloud 인증 키 위치 지정
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "google-key.json"

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# OCR 엔진 로딩
ocr_engine = EasyDocOCR()

# .env 파일에서 AWS 설정값 불러오기
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_DEFAULT_REGION", "ap-northeast-2")
BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "easydoc-upload-list")

# 가져온 키를 사용하여 AWS S3 연결 설정
s3_client = boto3.client(
    's3',
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    region_name=AWS_REGION
)

# db: Session = Depends(get_db)를 추가하여 API가 호출될 때마다 DB와 통신할 수 있는 세션 할당
@app.get("/ocr/s3/{filename}")
def run_ocr(filename: str, db: Session = Depends(get_db)):
    # URL에 포함된 암호화된 파일명(예: %ED%95...)을 정상적인 글자로 변환
    decoded_filename = unquote(filename)

    # 로컬에 다운로드할 임시 경로
    local_path = f"temp_{decoded_filename}"

    try:
        print(f"S3에서 다운로드 시작: {decoded_filename}")
        # S3에 있는 파일을 FastAPI 서버로 다운로드
        s3_client.download_file(BUCKET_NAME, decoded_filename, local_path)

        print("OCR 분석 시작...")
        # 다운받은 파일로 OCR 수행
        text_result = ocr_engine.extract_text(local_path)
        print(f"분석 완료: {text_result[:30]}...")

        # ================= DB 저장 로직 추가 =================
        # 1. S3 URL 주소 조립
        s3_url = f"https://{BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com/{filename}"

        # 2. 파일명에서 확장자(예: png, jpg) 추출
        file_extension = decoded_filename.split('.')[-1] if '.' in decoded_filename else "unknown"

        # 3. DB에 넣을 데이터 포장 (INSERT 문과 동일한 역할)
        new_doc = Document(
            file_name = decoded_filename,
            file_type = file_extension,
            s3_url = s3_url,
            extracted_text=text_result
        )

        # 4. DB에 추가하고 저장
        db.add(new_doc)
        db.commit()
        db.refresh(new_doc) #MySQL이 방금 발급해준 고유 ID 번호를 가져온다

        print(f"DB 저장 성공! (문서 번호: {new_doc.id})")
        # ===================================================

        # 프론트엔드에 추출 텍스트와 함께 부여된 문서 번호 반환
        return {
            "id": new_doc.id,
            "text": text_result
        }

    except Exception as e:
        print(f"에러 발생: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        # 임시 파일 삭제
        if os.path.exists(local_path):
            os.remove(local_path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)