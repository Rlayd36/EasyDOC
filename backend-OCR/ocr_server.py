from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
import boto3
import os
import sys
from urllib.parse import unquote
from ocr_logic import EasyDocOCR
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from pathlib import Path  

# --- DB 공유를 위한 경로 설정 ---
current_file_path = Path(__file__).resolve()
root_dir = current_file_path.parent.parent

if str(root_dir) not in sys.path:
    sys.path.append(str(root_dir))
# ---------------------------------------------

from database_document.database import get_db, Document  

load_dotenv()

app = FastAPI()

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 설정 및 연결
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "vision-key.json" # Google Cloud 인증 키 위치 지정   
ocr_engine = EasyDocOCR()

# .env 파일에서 AWS 설정값 불러오기
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_DEFAULT_REGION", "ap-northeast-2")
BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "easydoc-s3")

# 가져온 키를 사용하여 AWS S3 연결 설정
s3_client = boto3.client(
    's3',
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    region_name=AWS_REGION
)

# 프론트에서 직접 S3 업로드할 수 있도록 presigned URL 발급
@app.get("/s3/upload-url")
def get_upload_url(
    fileName: str = Query(..., min_length=1),
    fileType: str = Query("application/octet-stream"),
):
    try:
        upload_url = s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": BUCKET_NAME,
                "Key": fileName,
                "ContentType": fileType,
            },
            ExpiresIn=60,
        )
        return {"uploadUrl": upload_url, "key": fileName, "bucket": BUCKET_NAME, "region": AWS_REGION}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# db: Session = Depends(get_db)를 추가하여 API가 호출될 때마다 DB와 통신할 수 있는 세션 할당
@app.get("/ocr/s3/{filename}")
def run_ocr(filename: str, user_email: str = "", db: Session = Depends(get_db)):
    # URL에 포함된 암호화된 파일명(예: %ED%95...)을 정상적인 글자로 변환
    decoded_filename = unquote(filename)

    pure_filename = os.path.basename(decoded_filename)

    # 로컬에 다운로드할 임시 경로
    local_path = f"temp_{pure_filename}"

    filename_without_ext = pure_filename.rsplit('.', 1)[0] if '.' in pure_filename else pure_filename
    pdf_filename = f"{filename_without_ext}_OCR.pdf"
    local_pdf_path = f"temp_{pdf_filename}"

    try:
        print(f"S3에서 다운로드 시작: {decoded_filename}")
        # S3에 있는 파일을 FastAPI 서버로 다운로드
        s3_client.download_file(BUCKET_NAME, decoded_filename, local_path)

        print("OCR 분석 시작...")
        # 다운받은 파일로 OCR 수행
        text_result = ocr_engine.extract_text_and_make_pdf(local_path, local_pdf_path)
        print(f"분석 완료: {text_result[:30]}...")

        print("생성된 PDF를 S3에 업로드 중...")
        # 생성된 PDF를 S3에 업로드
        s3_pdf_key = f"ocr_pdfs/{pdf_filename}" 
        s3_client.upload_file(local_pdf_path, BUCKET_NAME, s3_pdf_key, ExtraArgs={'ContentType': 'application/pdf'})
        s3_pdf_url = f"https://{BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com/{s3_pdf_key}"
        signed_pdf_url = s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": BUCKET_NAME, "Key": s3_pdf_key},
            ExpiresIn=3600,
        )

        # ================= DB 저장 로직 =================
        file_size_bytes = os.path.getsize(local_pdf_path)
        size_kb = file_size_bytes / 1024
        file_size_str = f"{size_kb:.1f} KB"

        total_pages = 1 
        # OCR은 촬영하거나 기기에 있는 이미지 하나를 업로드 하므로 총 페이지 수를 계산할 필요 없이 1로 고정

        file_extension = pure_filename.split('.')[-1].lower() if '.' in pure_filename else "unknown"
        
        # DB에 넣을 데이터 포장 (INSERT 문과 동일한 역할)
        new_doc = Document(
            file_name = pure_filename,
            file_type = file_extension,
            s3_url = s3_pdf_url,
            extracted_text=text_result,
            file_size = file_size_str,
            page_count = total_pages,
            user_email = user_email
        )

        # DB에 추가하고 저장
        db.add(new_doc)
        db.commit()
        db.refresh(new_doc) #MySQL이 방금 발급해준 고유 ID 번호를 가져온다

        print(f"DB 저장 성공! (문서 번호: {new_doc.id}, PDF URL: {s3_pdf_url})")
        # ===================================================

        # 프론트엔드에 추출 텍스트와 함께 부여된 문서 번호와 새 PDF 주소 반환
        return {
            "id": new_doc.id,
            "text": text_result,
            "pdf_url": signed_pdf_url 
        }

    except Exception as e:
        print(f"에러 발생: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        # 임시 파일 삭제
        if os.path.exists(local_path):
            os.remove(local_path)
        if os.path.exists(local_pdf_path):
            os.remove(local_pdf_path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)