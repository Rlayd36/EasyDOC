from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import pdfplumber
import io
import tempfile
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    import olefile
    import zlib
    
    contents = await file.read()
    
    try:
        ole = olefile.OleFileIO(io.BytesIO(contents))
        
        # HWP 파일 내부의 텍스트 스트림 읽기
        if ole.exists("PrvText"):
            # 미리보기 텍스트 (가장 쉬운 방법)
            encoded_text = ole.openstream("PrvText").read()
            text = encoded_text.decode("utf-16", errors="ignore")
        elif ole.exists("BodyText/Section0"):
            # 본문에서 추출 시도
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