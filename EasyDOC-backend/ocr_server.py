from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import boto3
import os
from ocr_logic import EasyDocOCR

app = FastAPI()

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

# AWS S3 연결 설정
s3_client = boto3.client('s3', region_name='ap-northeast-2')
BUCKET_NAME = "easydoc-upload-list"

# 요청 받을 데이터 형식 (파일 이름만 받으면 됨)
class OCRRequest(BaseModel):
    filename: str

@app.post("/ocr")
def run_ocr(req: OCRRequest):
    # 로컬에 다운로드할 임시 경로
    local_path = f"temp_{req.filename}"

    try:
        print(f"S3에서 다운로드 시작: {req.filename}")
        # S3에 있는 파일을 FastAPI 서버로 다운로드
        s3_client.download_file(BUCKET_NAME, req.filename, local_path)

        print("OCR 분석 시작...")
        # 다운받은 파일로 OCR 수행
        text_result = ocr_engine.extract_text(local_path)
        print(f"분석 완료: {text_result[:30]}...")

        return {"status": "success", "text": text_result}

    except Exception as e:
        print(f"에러 발생: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        # 임시 파일 삭제
        if os.path.exists(local_path):
            os.remove(local_path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)