from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import pdfplumber
import olefile
import zlib
import io
import boto3
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# S3 클라이언트
s3 = boto3.client(
    "s3",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    region_name=os.getenv("AWS_DEFAULT_REGION"),
)
BUCKET_NAME = os.getenv("S3_BUCKET_NAME")


@app.get("/")
def root():
    return {"message": "EasyDOC Parser API 작동 중!"}


@app.post("/parse/pdf")
async def parse_pdf(file: UploadFile = File(...)):
    """PDF 파일에서 텍스트 추출"""
    contents = await file.read()
    
    text = ""
    with pdfplumber.open(io.BytesIO(contents)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
    
    return {
        "filename": file.filename,
        "pages": len(pdf.pages) if pdf else 0,
        "text": text
    }


@app.post("/parse/hwp")
async def parse_hwp(file: UploadFile = File(...)):
    """HWP 파일에서 텍스트 추출"""
    contents = await file.read()
    
    try:
        ole = olefile.OleFileIO(io.BytesIO(contents))
        
        if ole.exists("PrvText"):
            encoded_text = ole.openstream("PrvText").read()
            text = encoded_text.decode("utf-16", errors="ignore")
        elif ole.exists("BodyText/Section0"):
            data = ole.openstream("BodyText/Section0").read()
            try:
                decompressed = zlib.decompress(data, -15)
                text = decompressed.decode("utf-16", errors="ignore")
            except:
                text = ""
        else:
            text = "텍스트를 추출할 수 없습니다."
        
        ole.close()
        
    except Exception as e:
        return {"filename": file.filename, "error": str(e), "text": ""}
    
    return {
        "filename": file.filename,
        "text": text.strip()
    }


@app.get("/parse/s3/{file_key:path}")
async def parse_from_s3(file_key: str):
    """S3에서 파일 가져와서 파싱"""
    try:
        # S3에서 파일 다운로드
        response = s3.get_object(Bucket=BUCKET_NAME, Key=file_key)
        contents = response["Body"].read()
        filename = file_key.split("/")[-1]
        ext = filename.split(".")[-1].lower()
        
        # 확장자에 따라 파싱
        if ext == "pdf":
            text = ""
            with pdfplumber.open(io.BytesIO(contents)) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n"
            return {"filename": filename, "text": text}
        
        elif ext == "hwp":
            ole = olefile.OleFileIO(io.BytesIO(contents))
            if ole.exists("PrvText"):
                encoded_text = ole.openstream("PrvText").read()
                text = encoded_text.decode("utf-16", errors="ignore")
            else:
                text = "텍스트를 추출할 수 없습니다."
            ole.close()
            return {"filename": filename, "text": text.strip()}
        
        else:
            return {"error": "지원하지 않는 파일 형식입니다."}
    
    except Exception as e:
        return {"error": str(e)}