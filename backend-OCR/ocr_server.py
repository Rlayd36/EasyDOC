from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import boto3
import os
from urllib.parse import unquote
from ocr_logic import EasyDocOCR
from dotenv import load_dotenv

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

# AWS S3 연결 설정
s3_client = boto3.client('s3', region_name='ap-northeast-2')
BUCKET_NAME = "easydoc-upload-list"

# 프론트엔드 요청에 맞게 GET 방식으로 주소 변경
@app.get("/ocr/s3/{filename}")
def run_ocr(filename: str):
    #URL에 포함된 암호화된 파일명(예: %ED%95...)을 정상적인 글자로 변환
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

        #프론트엔드에서 ocrResponse.data.text로 받을 수 있도록 반환형식 수정
        return {"text": text_result}

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