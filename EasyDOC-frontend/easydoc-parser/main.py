from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import pdfplumber
import olefile
import zlib
import google.generativeai as genai
import io
import boto3
import os
from dotenv import load_dotenv
import pandas as pd
from konlpy.tag import Okt
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

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

# Gemini 설정 (API 키가 없으면 None으로 설정)
gemini_model = None
try:
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key and api_key != "your_gemini_api_key":
        genai.configure(api_key=api_key)
        gemini_model = genai.GenerativeModel('gemini-2.0-flash-lite')
        print("✓ Gemini API 초기화 성공")
    else:
        print("⚠ Gemini API 키가 설정되지 않음 - 사전 기반 설명만 사용")
except Exception as e:
    print(f"⚠ Gemini API 초기화 실패: {e} - 사전 기반 설명만 사용")
    gemini_model = None

# 형태소 분석기
okt = Okt()

# 단어 난이도 사전 로드
word_df = pd.read_csv("word_difficulty_dataset.csv")
word_dict = dict(zip(word_df['단어'], word_df['난이도']))
easy_dict = dict(zip(word_df['단어'], word_df['쉬운표현']))

# 어려운 단어로 판정하지 않을 제외 사전 로드
_exclusion_path = "word_exclusion_list.csv"
if os.path.exists(_exclusion_path):
    exclusion_df = pd.read_csv(_exclusion_path)
    exclusion_set = set(exclusion_df['단어'].dropna().tolist())
else:
    exclusion_set = set()

# 난이도 분류 모델 로드
MODEL_PATH = "word_difficulty_model"
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
diff_model = AutoModelForSequenceClassification.from_pretrained(MODEL_PATH)
diff_model.to(device)
diff_model.eval()


@app.get("/")
def root():
    return {"message": "EasyDOC Parser API 작동 중!"}


@app.get("/debug/s3-list")
async def list_s3_objects():
    """S3 버킷의 모든 객체 목록 확인 (디버깅용)"""
    try:
        response = s3.list_objects_v2(Bucket=BUCKET_NAME)
        objects = []
        if 'Contents' in response:
            for obj in response['Contents']:
                objects.append({
                    'key': obj['Key'],
                    'size': obj['Size'],
                    'last_modified': str(obj['LastModified'])
                })
        return {
            "bucket": BUCKET_NAME,
            "count": len(objects),
            "objects": objects
        }
    except Exception as e:
        return {"error": str(e)}


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
    print(f"[DEBUG] 파싱 요청 받음 - 파일 키: {file_key}")
    print(f"[DEBUG] 버킷: {BUCKET_NAME}")
    try:
        # S3에서 파일 다운로드
        print(f"[DEBUG] S3 GetObject 시도 중...")
        response = s3.get_object(Bucket=BUCKET_NAME, Key=file_key)
        print(f"[DEBUG] S3에서 파일 다운로드 성공!")
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


def predict_difficulty(word):
    """모델로 난이도 예측"""
    inputs = tokenizer(word, return_tensors="pt", padding=True, truncation=True, max_length=32)
    inputs = {k: v.to(device) for k, v in inputs.items()}
    
    with torch.no_grad():
        outputs = diff_model(**inputs)
        pred = torch.argmax(outputs.logits, dim=1).item() + 1
    
    return pred


@app.post("/analyze")
async def analyze_text(data: dict):
    """텍스트에서 어려운 단어 분석"""
    text = data.get("text", "")
    min_level = data.get("min_level", 3)  # 기본값: 3단계 이상만
    
    # 명사 추출
    nouns = okt.nouns(text)
    
    # 중복 제거
    unique_nouns = list(set(nouns))
    
    result = []
    for noun in unique_nouns:
        if len(noun) < 2:  # 한 글자는 스킵
            continue

        # 제외 사전에 있으면 어려운 단어로 판정하지 않음
        if noun in exclusion_set:
            continue
            
        # 데이터셋에 있으면 저장된 난이도 사용
        if noun in word_dict:
            level = word_dict[noun]
            easy = easy_dict.get(noun, "")
            source = "dictionary"
        else:
            # 없으면 모델로 예측
            level = predict_difficulty(noun)
            easy = ""
            source = "model"
        
        # 지정 난이도 이상만 반환
        if level >= min_level:
            result.append({
                "word": noun,
                "level": int(level),
                "easy_expression": easy if pd.notna(easy) else "",
                "source": source
            })
    
    # 난이도 높은 순 정렬
    result.sort(key=lambda x: x["level"], reverse=True)
    
    return {
        "total_nouns": len(unique_nouns),
        "difficult_words": result
    }
@app.post("/explain")
async def explain_word(data: dict):
    """어려운 단어를 쉽게 설명"""
    word = data.get("word", "")
    context = data.get("context", "")  # 문맥 (선택)
    
    # 먼저 데이터셋에서 찾기
    if word in word_dict:
        easy = easy_dict.get(word, "")
        if pd.notna(easy) and easy:
            return {
                "word": word,
                "explanation": easy,
                "source": "dictionary"
            }
    
    # 없으면 Gemini한테 물어보기
    if gemini_model is None:
        return {
            "word": word,
            "explanation": "Gemini API 키 받아오기 실패...",
            "source": "error"
        }

    prompt = f"""다음 행정/법률 용어를 초등학생도 이해할 수 있게 한 문장으로 쉽게 설명해주세요.
    
용어: {word}
{"문맥: " + context if context else ""}

설명:"""
    
    try:
        response = gemini_model.generate_content(prompt)
        explanation = response.text.strip()
        
        return {
            "word": word,
            "explanation": explanation,
            "source": "gemini"
        }
    except Exception as e:
        return {
            "word": word,
            "explanation": "Gemini API 오류...",
            "source": "error"
        }


@app.post("/explain/batch")
async def explain_words_batch(data: dict):
    """여러 어려운 단어를 한꺼번에 Gemini로 설명 생성"""
    words = data.get("words", [])
    
    if not words:
        return {"results": []}
    
    results = []
    
    for word_info in words:
        word = word_info.get("word", "")
        
        # 사전에 설명이 있으면 사전 우선
        if word in word_dict:
            easy = easy_dict.get(word, "")
            if pd.notna(easy) and easy:
                results.append({
                    "word": word,
                    "explanation": easy,
                    "source": "dictionary"
                })
                continue
        
        # 없으면 Gemini에게 요청
        if gemini_model is None:
            results.append({
                "word": word,
                "explanation": "Gemini API 키 받아오기 실패...",
                "source": "error"
            })
            continue

        prompt = f"""다음 행정/법률 용어를 초등학생도 이해할 수 있게 한 문장으로 쉽게 설명해주세요.
용어: {word}
설명:"""
        
        try:
            response = gemini_model.generate_content(prompt)
            explanation = response.text.strip()
            results.append({
                "word": word,
                "explanation": explanation,
                "source": "gemini"
            })
        except Exception as e:
            results.append({
                "word": word,
                "explanation": "Gemini API 오류...",
                "source": "error"
            })
    
    return {"results": results}