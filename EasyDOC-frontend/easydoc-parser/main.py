from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import pdfplumber
import olefile
import zlib
import google.generativeai as genai
import io
import re
import boto3
import os
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv
import pandas as pd

# .env 파일 탐색: 로컬 .env → 상위 .env 순으로 모두 로드 (상위가 우선)
_search = Path(__file__).resolve().parent
_env_files = []
for _ in range(5):
    _candidate = _search / ".env"
    if _candidate.exists():
        _env_files.append(_candidate)
    _search = _search.parent
for _ef in _env_files:
    load_dotenv(dotenv_path=_ef, override=True)
if _env_files:
    print(f"✓ .env 로드 완료: {[str(f) for f in _env_files]}")

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
        gemini_model = genai.GenerativeModel('gemini-3-flash-preview')
        print("✓ Gemini API 초기화 성공")
    else:
        print("⚠ Gemini API 키가 설정되지 않음 - 사전 기반 설명만 사용")
except Exception as e:
    print(f"⚠ Gemini API 초기화 실패: {e} - 사전 기반 설명만 사용")
    gemini_model = None

# Gemini 응답 캐시 (gemini_word.csv)
GEMINI_CACHE_PATH = Path(__file__).resolve().parent / "gemini_word.csv"
def load_gemini_cache():
    if GEMINI_CACHE_PATH.exists():
        df = pd.read_csv(GEMINI_CACHE_PATH, encoding='utf-8')
        cache = {}
        for _, row in df.iterrows():
            cache[row['단어']] = {
                "level": int(row['난이도']),
                "explanation": row['설명'],
            }
        print(f"✓ Gemini 캐시 로드 완료: {len(cache)}개 단어")
        return cache
    return {}

def save_to_gemini_cache(words_data):
    """Gemini 응답을 CSV에 추가 저장"""
    if not words_data:
        return
    today = datetime.now().strftime("%Y-%m-%d")
    new_rows = []
    for item in words_data:
        new_rows.append({
            '단어': item['word'],
            '난이도': item['level'],
            '설명': item['easy_expression'],
            '생성일': today,
        })
    new_df = pd.DataFrame(new_rows)
    if GEMINI_CACHE_PATH.exists():
        existing = pd.read_csv(GEMINI_CACHE_PATH, encoding='utf-8')
        combined = pd.concat([existing, new_df], ignore_index=True)
        combined.drop_duplicates(subset=['단어'], keep='last', inplace=True)
    else:
        combined = new_df
    combined.to_csv(GEMINI_CACHE_PATH, index=False, encoding='utf-8')
    # 메모리 캐시도 업데이트
    for item in words_data:
        gemini_cache[item['word']] = {
            "level": item['level'],
            "explanation": item['easy_expression'],
        }
    print(f"[Gemini 캐시 저장] {len(words_data)}개 단어 추가 (전체 {len(gemini_cache)}개)")

gemini_cache = load_gemini_cache()


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


@app.post("/analyze-with-gemini")
async def analyze_with_gemini(data: dict):
    """Gemini가 텍스트를 받아 어려운 단어 추출 + 설명을 한 번에 처리 (캐시 우선, 청크 분할)"""
    text = data.get("text", "")
    
    if not text:
        return {"difficult_words": [], "token_usage": {}}
    
    if gemini_model is None:
        return {"difficult_words": [], "error": "Gemini API 키가 설정되지 않았습니다."}
    
    # 1단계: 캐시에서 이미 아는 단어 찾기
    cached_words = []
    for word, info in gemini_cache.items():
        if word in text:
            cached_words.append({
                "word": word,
                "level": info["level"],
                "easy_expression": info["explanation"],
                "source": "cache"
            })
    
    cached_word_set = {w["word"] for w in cached_words}
    print(f"[캐시 히트] {len(cached_words)}개 단어 캐시에서 발견")
    
    # 2단계: 텍스트를 청크로 분할 (3000자씩)
    CHUNK_SIZE = 3000
    chunks = []
    for i in range(0, len(text), CHUNK_SIZE):
        chunk = text[i:i + CHUNK_SIZE]
        if chunk.strip():
            chunks.append(chunk)
    
    print(f"[청크 분할] 전체 {len(text)}자 → {len(chunks)}개 청크")
    
    # 캐시 제외 힌트
    cache_exclude_hint = ""
    if cached_word_set:
        cache_exclude_hint = f"\n\n## 이미 설명된 단어 (제외하세요)\n{', '.join(cached_word_set)}"
    
    total_token_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    new_gemini_words = []
    seen_words = set(cached_word_set)  # 중복 방지
    
    # 3단계: 각 청크별로 Gemini 호출
    for idx, chunk in enumerate(chunks):
        # 이미 이 청크 이전에 발견된 단어도 제외
        current_exclude = ""
        if seen_words:
            current_exclude = f"\n\n## 이미 설명된 단어 (제외하세요)\n{', '.join(seen_words)}"
        
        prompt = f"""## 역할
당신은 행정/법률 문서를 쉽게 풀어주는 전문가입니다.

## 작업
아래 문서 조각에서 일반인이 이해하기 어려운 행정/법률 용어를 **빠짐없이 모두** 찾아 설명해주세요.

## 난이도 기준
- 1단계: 일상 용어 (신청, 제출, 확인 등)
- 2단계: 기본 행정 용어 (증명서, 민원, 위임장 등)
- 3단계: 전문 행정 용어 (시행령, 행정심판, 사업타당성 등)
- 4단계: 고급 법률 용어 (준용, 질권, 의거 처분 등)

## 규칙
- 한 글자 단어는 제외하세요.
- 문서에 등장하는 행정/법률 용어를 **빠짐없이 모두** 찾아주세요. 개수 제한 없습니다.
- 난이도 1~4단계 모두 판정해주세요.
- 설명은 한 문장으로 짧게 해주세요.{current_exclude}

## 출력 형식 (반드시 이 형식을 지키세요)
각 줄에 하나씩, 구분자로 `|||`를 사용:
단어|||난이도|||설명

예시:
기부채납|||4|||개인 소유의 토지나 건물을 나라나 지방자치단체에 무상으로 주는 거예요.
사업타당성|||3|||사업을 해도 괜찮은지 돈이나 효과를 미리 따져보는 거예요.
증명서|||2|||어떤 사실이 맞다는 것을 보여주는 공식 문서예요.
접수|||1|||서류나 신청서를 받아들이는 것을 말해요.

## 문서 조각 ({idx + 1}/{len(chunks)})
{chunk}
"""
        
        try:
            response = gemini_model.generate_content(prompt)
            response_text = response.text.strip()
            
            # 토큰 사용량 집계
            if hasattr(response, 'usage_metadata'):
                um = response.usage_metadata
                p_tok = getattr(um, 'prompt_token_count', 0) or 0
                c_tok = getattr(um, 'candidates_token_count', 0) or 0
                t_tok = getattr(um, 'total_token_count', 0) or 0
                total_token_usage["prompt_tokens"] += p_tok
                total_token_usage["completion_tokens"] += c_tok
                total_token_usage["total_tokens"] += t_tok
                print(f"[Gemini 토큰] 청크 {idx + 1}/{len(chunks)}: 입력={p_tok}, 출력={c_tok}, 합계={t_tok}")
            
            # 응답 파싱
            for line in response_text.split("\n"):
                line = line.strip()
                if not line or "|||" not in line:
                    continue
                parts = line.split("|||")
                if len(parts) >= 3:
                    word = parts[0].strip()
                    try:
                        level = int(parts[1].strip())
                    except ValueError:
                        level = 3
                    explanation = parts[2].strip()
                    
                    if word and explanation and word not in seen_words:
                        new_gemini_words.append({
                            "word": word,
                            "level": level,
                            "easy_expression": explanation,
                            "source": "gemini"
                        })
                        seen_words.add(word)
            
        except Exception as e:
            print(f"[Gemini 청크 {idx + 1} 오류] {e}")
    
    # 4단계: 새 단어를 CSV 캐시에 저장
    if new_gemini_words:
        save_to_gemini_cache(new_gemini_words)
    
    # 캐시 + Gemini 신규 결과 병합
    all_words = cached_words + new_gemini_words
    all_words.sort(key=lambda x: x["level"], reverse=True)
    
    print(f"[Gemini 분석 완료] 캐시={len(cached_words)}개, 신규={len(new_gemini_words)}개, "
          f"전체={len(all_words)}개, 청크={len(chunks)}개")
    
    return {
        "difficult_words": all_words,
        "total_found": len(all_words),
        "from_cache": len(cached_words),
        "from_gemini": len(new_gemini_words),
        "chunks_processed": len(chunks),
        "token_usage": total_token_usage
    }