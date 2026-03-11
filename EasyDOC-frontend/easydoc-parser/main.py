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
from konlpy.tag import Okt
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

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

# 형태소 분석기
okt = Okt()

# 단어 난이도 사전 로드
word_df = pd.read_csv("word_difficulty_dataset.csv", encoding='utf-8')
word_dict = dict(zip(word_df['단어'], word_df['난이도']))
easy_dict = dict(zip(word_df['단어'], word_df['쉬운표현']))

# 어려운 단어로 판정하지 않을 제외 사전 로드
_exclusion_path = "word_exclusion_list.csv"
if os.path.exists(_exclusion_path):
    exclusion_df = pd.read_csv(_exclusion_path, encoding='utf-8')
    exclusion_set = set(exclusion_df['단어'].dropna().tolist())
    print(f"✓ 제외 사전 로드 완료: {len(exclusion_set)}개 단어")
    print(f"  예시: {list(exclusion_set)[:5]}")
else:
    exclusion_set = set()
    print("⚠ 제외 사전 파일을 찾을 수 없습니다.")

# 난이도 분류 모델 로드
MODEL_PATH = "word_difficulty_model"
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
diff_model = AutoModelForSequenceClassification.from_pretrained(MODEL_PATH)
diff_model.to(device)
diff_model.eval()

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
    min_level = data.get("min_level", 3)  # 기본값: 3단계 이상만 (추후 사용자 DB 연동 예정)
    
    # 명사 추출
    nouns = okt.nouns(text)
    
    # 중복 제거
    unique_nouns = list(set(nouns))
    
    result = []
    excluded_words = []
    for noun in unique_nouns:
        if len(noun) < 2:  # 한 글자는 스킵
            continue

        # 제외 사전에 있으면 어려운 단어로 판정하지 않음
        if noun in exclusion_set:
            excluded_words.append(noun)
            print(f"  [제외됨] {noun}")
            continue
            
        # 데이터셋에 있으면 저장된 난이도 사용
        if noun in word_dict:
            level = word_dict[noun]
            easy = easy_dict.get(noun, "")
            source = "dictionary"
            # 데이터셋에 있는 단어는 난이도 상관없이 무조건 포함
            result.append({
                "word": noun,
                "level": int(level),
                "easy_expression": easy if pd.notna(easy) else "",
                "source": source
            })
        else:
            # 없으면 모델로 예측
            level = predict_difficulty(noun)
            easy = ""
            source = "model"
            
            # 모델 예측 단어는 지정 난이도 이상만 반환
            if level >= min_level:
                result.append({
                    "word": noun,
                    "level": int(level),
                    "easy_expression": easy if pd.notna(easy) else "",
                    "source": source
                })
    
    # 난이도 높은 순 정렬
    result.sort(key=lambda x: x["level"], reverse=True)
    
    # 제외된 단어들도 정렬
    excluded_words.sort()
    
    print(f"[분석 완료] 전체 명사: {len(unique_nouns)}, 제외됨: {len(excluded_words)}, 어려운 단어: {len(result)}")
    
    return {
        "total_nouns": len(unique_nouns),
        "excluded_count": len(excluded_words),
        "excluded_words": excluded_words,
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


@app.post("/analyze-with-gemini")
async def analyze_with_gemini(data: dict):
    """Gemini가 텍스트를 받아 어려운 단어 추출 + 설명을 한 번에 처리 (캐시 우선)"""
    text = data.get("text", "")
    
    if not text:
        return {"difficult_words": [], "token_usage": {}}
    
    if gemini_model is None:
        return {"difficult_words": [], "error": "Gemini API 키가 설정되지 않았습니다."}
    
    # 텍스트가 너무 길면 앞부분만 사용 (Gemini 입력 제한)
    max_chars = 15000
    truncated = text[:max_chars] if len(text) > max_chars else text
    
    # 1단계: 캐시에서 이미 아는 단어 찾기
    cached_words = []
    for word, info in gemini_cache.items():
        if word in truncated and info["level"] >= 3:
            cached_words.append({
                "word": word,
                "level": info["level"],
                "easy_expression": info["explanation"],
                "source": "cache"
            })
    
    cached_word_set = {w["word"] for w in cached_words}
    print(f"[캐시 히트] {len(cached_words)}개 단어 캐시에서 발견")
    
    # 2단계: Gemini에게 문서 분석 요청 (캐시된 단어 제외 지시)
    cache_exclude_hint = ""
    if cached_word_set:
        cache_exclude_hint = f"\n\n## 이미 설명된 단어 (제외하세요)\n{', '.join(cached_word_set)}"
    
    prompt = f"""## 역할
당신은 행정/법률 문서를 쉽게 풀어주는 전문가입니다.

## 작업
아래 문서에서 일반인이 이해하기 어려운 행정/법률 용어를 찾아 초등학생도 이해할 수 있게 설명해주세요.

## 규칙
- 너무 쉽거나 일상적인 단어(예: 신청, 제출, 서류, 주소, 이름, 전화, 번호, 금액, 기간, 변경, 등록, 확인 등)는 **제외**하세요.
- 한 글자 단어는 제외하세요.
- 아래 난이도 기준에 따라 각 단어를 평가해주세요:
  - 1단계: 일상 용어 (신청, 제출, 확인 등) → 제외
  - 2단계: 기본 행정 용어 (증명서, 민원, 위임장 등) → 제외
  - 3단계: 전문 행정 용어 (시행령, 행정심판, 사업타당성 등)
  - 4단계: 고급 법률 용어 (준용, 질권, 의거 처분 등)
- 난이도 3 이상인 단어만 포함하세요.
- 설명은 한 문장으로 짧게 해주세요.{cache_exclude_hint}

## 출력 형식 (반드시 이 형식을 지키세요)
각 줄에 하나씩, 구분자로 `|||`를 사용:
단어|||난이도|||설명

예시:
의거 처분|||4|||법을 어긴 사람에게 벌을 주는 것을 말해요.
존속 기간|||3|||어떤 규칙이 유지되는 기간을 말해요.
사업타당성|||3|||사업을 해도 괜찮은지 돈이나 효과를 미리 따져보는 거예요.

## 문서 내용
{truncated}
"""
    
    total_token_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    new_gemini_words = []
    
    try:
        response = gemini_model.generate_content(prompt)
        response_text = response.text.strip()
        
        # 토큰 사용량 집계
        if hasattr(response, 'usage_metadata'):
            um = response.usage_metadata
            total_token_usage["prompt_tokens"] = getattr(um, 'prompt_token_count', 0) or 0
            total_token_usage["completion_tokens"] = getattr(um, 'candidates_token_count', 0) or 0
            total_token_usage["total_tokens"] = getattr(um, 'total_token_count', 0) or 0
            print(f"[Gemini 토큰] 입력={total_token_usage['prompt_tokens']}, "
                  f"출력={total_token_usage['completion_tokens']}, "
                  f"합계={total_token_usage['total_tokens']}")
        
        # 응답 파싱: "단어|||난이도|||설명" 형식
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
                
                if word and explanation and word not in cached_word_set:
                    new_gemini_words.append({
                        "word": word,
                        "level": level,
                        "easy_expression": explanation,
                        "source": "gemini"
                    })
        
        # 3단계: 새 단어를 CSV 캐시에 저장
        if new_gemini_words:
            save_to_gemini_cache(new_gemini_words)
        
    except Exception as e:
        print(f"[Gemini 분석 오류] {e}")
        return {
            "difficult_words": cached_words,
            "error": str(e),
            "token_usage": total_token_usage
        }
    
    # 캐시 + Gemini 신규 결과 병합
    all_words = cached_words + new_gemini_words
    all_words.sort(key=lambda x: x["level"], reverse=True)
    
    print(f"[Gemini 분석 완료] 캐시={len(cached_words)}개, 신규={len(new_gemini_words)}개, 전체={len(all_words)}개")
    
    return {
        "difficult_words": all_words,
        "total_found": len(all_words),
        "from_cache": len(cached_words),
        "from_gemini": len(new_gemini_words),
        "token_usage": total_token_usage
    }