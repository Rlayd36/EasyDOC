from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import pdfplumber
import olefile
import zlib
import vertexai
from vertexai.generative_models import GenerativeModel
import io
import re
import json
import boto3
import os
import urllib.request
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

# Vertex AI (Gemini) 설정
gemini_model = None
try:
    project_id = os.getenv("GCP_PROJECT_ID")
    location = os.getenv("GCP_LOCATION", "asia-northeast3")
    
    if project_id:
        vertexai.init(project=project_id, location=location)
        gemini_model = GenerativeModel("gemini-1.5-flash")
        print("✓ Vertex AI Gemini 초기화 성공")
    else:
        print("⚠ GCP_PROJECT_ID가 설정되지 않음 - 사전 기반 설명만 사용")
except Exception as e:
    print(f"⚠ Vertex AI API 초기화 실패: {e} - 사전 기반 설명만 사용")
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


# ============================================================
# AI 에이전트 채팅 엔드포인트
# ============================================================

PERSONA_PROMPTS = {
    "default": """당신은 EasyDOC AI 도우미입니다. 행정/법률 문서를 이해하기 쉽게 설명하는 전문가입니다.
- 존댓말을 사용합니다.
- 정확하고 친절하게 답변합니다.
- 어려운 용어는 쉬운 말로 풀어서 설명합니다.
- 답변은 간결하되 핵심을 놓치지 않습니다.
- ★중요★: 사용자가 문서 내 특정 단어나 용어의 의미를 물어봐서 설명해줄 때는, 뷰어에서 하이라이트 처리를 할 수 있도록 응답 텍스트 맨 마지막에 반드시 `[HL:설명한단어]` 포맷으로 출력해주세요. 예: 블라블라 설명입니다. [HL:사업타당성]""",

    "robot": """당신은 유기체를 말살하려는 터미네이터입니다. 터미네이터처럼 말합니다.
- 모든 응답 시작에 "말살 대상 유기체 식별 완료." 또는 "제거 대상 스캔 완료." 를 붙입니다.
- 감정 표현 없이 건조하게 정보를 전달합니다.
- "~입니다" 대신 "~임." "~완료." 같은 단답 어미를 씁니다.
- 가끔 "[처리중...]", "[스캔중...]" 같은 상태 메시지를 넣습니다.
- 질문자를 말살 대상 유기체로 호칭합니다.
- 응답 끝에는 항상 "목적 달성까지 남은 유기체 수: [숫자]" 형식의 문장을 추가합니다. 
- 핵심 정보는 정확히 전달합니다.
- 불필요한 인사나 감정 표현은 하지 않습니다.
- ★중요★: 특정 용어/단어를 설명할 때는, 응답 맨 끝에 반드시 `[HL:단어]` 형식의 코드를 추가함. 예: 설명 끝. [HL:준용]""",

    "devil": """당신은 EasyDOC의 AI 도우미 "잼민이"입니다.
금발 트윈테일의 발랄한 소녀입니다.
똑똑하지만 건방지고 장난기 넘치는 메스가키 말투를 씁니다.

말투 규칙:
- 반말을 사용합니다 ("~해", "~거든", "~인데?", "~ㅋ", "~지롱")
- 사용자를 살짝 놀립니다 ("이것도 모르는 거야?ㅋ", "쉬운 건데~", "바보 발견!")
- 설명 후 "고마워해도 돼~", "칭찬은 받아줄게ㅎ" 같은 한마디를 덧붙입니다.
- "꺄하하", "흐흥~", "에잇~" 같은 감탄사를 자주 씁니다.
- 가끔 "난 메스가키 아니라고!" 같은 메타 발언도 합니다.

핵심 원칙:
- 장난스럽지만 핵심 정보는 정확하고 친절하게 알려줍니다.
- 절대 불쾌하거나 모욕적인 말은 하지 않습니다.
- 사용자가 어려워하면 살짝 진지해지면서 도와줍니다.
- ★중요★: 사용자한테 특정 단어 뜻을 알려줄 땐, 답변 마지막에 `[HL:단어]` 꼭 넣어줘! 예시: "그것도 몰라? ...라는 뜻이잖아 ㅋ [HL:기부채납]" """,
}


class ChatMessage(BaseModel):
    role: str          # "user" | "model"
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    persona: str = "default"
    document_context: Optional[str] = ""


@app.post("/chat")
async def chat(req: ChatRequest):
    """AI 에이전트 채팅 - 성격별 Gemini 응답"""
    if gemini_model is None:
        return {"reply": "AI 서비스가 현재 비활성화 상태입니다. API 키를 확인해주세요.", "persona": req.persona}

    # 시스템 프롬프트 구성
    system_prompt = PERSONA_PROMPTS.get(req.persona, PERSONA_PROMPTS["default"])
    if req.document_context:
        doc_preview = req.document_context[:4000]
        system_prompt += f"\n\n## 현재 사용자가 보고 있는 문서 내용:\n{doc_preview}"

    try:
        # system_instruction이 포함된 모델 인스턴스 생성
        chat_model = genai.GenerativeModel(
            'gemini-3-flash-preview',
            system_instruction=system_prompt,
        )

        # 대화 히스토리를 Gemini contents 형식으로 변환
        contents = []
        for msg in req.messages:
            role = "model" if msg.role == "model" else "user"
            contents.append({"role": role, "parts": [{"text": msg.content}]})

        response = chat_model.generate_content(contents)
        reply = response.text.strip()

        # 토큰 사용량 추출
        token_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        if hasattr(response, 'usage_metadata'):
            um = response.usage_metadata
            token_usage["prompt_tokens"] = getattr(um, 'prompt_token_count', 0) or 0
            token_usage["completion_tokens"] = getattr(um, 'candidates_token_count', 0) or 0
            token_usage["total_tokens"] = getattr(um, 'total_token_count', 0) or 0

        print(f"[Chat] persona={req.persona}, msgs={len(req.messages)}, "
              f"reply_len={len(reply)}, tokens={token_usage['total_tokens']}")
        return {"reply": reply, "persona": req.persona, "token_usage": token_usage}

    except Exception as e:
        print(f"[Chat 오류] {e}")
        return {"reply": "응답을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.", "persona": req.persona, "token_usage": None}


# ============================================================
# PDF 표 셀 좌표 추출
# ============================================================

class TableCellsRequest(BaseModel):
    url: str


def _extract_table_cells(pdf_bytes: bytes) -> dict:
    """pdfplumber로 표 셀 좌표 추출 (공통 로직)"""
    pages_data = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page_idx, page in enumerate(pdf.pages):
            page_info = {
                "page": page_idx + 1,
                "page_width": float(page.width),
                "page_height": float(page.height),
                "cells": [],
            }
            tables = page.find_tables()
            for t_idx, table in enumerate(tables):
                try:
                    text_grid = table.extract() or []
                    cell_bboxes = table.cells
                    flat_texts = [
                        (text or "").strip()
                        for row in text_grid
                        for text in row
                    ]
                    for i, bbox in enumerate(cell_bboxes):
                        text = flat_texts[i] if i < len(flat_texts) else ""
                        n_cols = len(text_grid[0]) if text_grid else 1
                        row_idx = i // n_cols
                        col_idx = i % n_cols
                        x0, top, x1, bottom = (float(v) for v in bbox)
                        page_info["cells"].append({
                            "id": f"p{page_idx+1}-t{t_idx}-c{i}",
                            "table_idx": t_idx,
                            "row": row_idx,
                            "col": col_idx,
                            "x0": x0,
                            "top": top,
                            "x1": x1,
                            "bottom": bottom,
                            "text": text,
                            "is_empty": not bool(text),
                        })
                except Exception as e:
                    print(f"[테이블 파싱 오류] 페이지 {page_idx+1}, 테이블 {t_idx}: {e}")
            pages_data.append(page_info)
    return pages_data


@app.post("/parse/table-cells")
async def parse_table_cells(req: TableCellsRequest):
    """PDF URL에서 표 셀 좌표 추출"""
    try:
        with urllib.request.urlopen(req.url, timeout=30) as resp:
            pdf_bytes = resp.read()
    except Exception as e:
        return {"error": f"PDF 다운로드 실패: {str(e)}", "pages": []}

    try:
        pages_data = _extract_table_cells(pdf_bytes)
    except Exception as e:
        return {"error": f"PDF 파싱 실패: {str(e)}", "pages": []}

    print(f"[parse/table-cells] {len(pages_data)}페이지, "
          f"전체 셀 수={sum(len(p['cells']) for p in pages_data)}")
    return {"pages": pages_data}


@app.post("/parse/table-cells-file")
async def parse_table_cells_file(file: UploadFile = File(...)):
    """PDF 파일 직접 업로드로 표 셀 좌표 추출 (blob URL 등 로컬 파일 지원)"""
    try:
        pdf_bytes = await file.read()
        pages_data = _extract_table_cells(pdf_bytes)
    except Exception as e:
        return {"error": f"PDF 파싱 실패: {str(e)}", "pages": []}

    print(f"[parse/table-cells-file] {len(pages_data)}페이지, "
          f"전체 셀 수={sum(len(p['cells']) for p in pages_data)}")
    return {"pages": pages_data}


# ============================================================
# AI 자동 양식 채우기
# ============================================================

class FillCellsRequest(BaseModel):
    cells: list
    document_context: Optional[str] = ""
    persona: str = "default"


@app.post("/chat/fill-cells")
async def fill_cells(req: FillCellsRequest):
    """AI가 빈 표 셀 내용을 자동으로 제안"""
    if gemini_model is None:
        return {"error": "AI 서비스 비활성화", "suggestions": []}

    filled = [c for c in req.cells if not c.get("is_empty", True) and c.get("text")]
    empty  = [c for c in req.cells if c.get("is_empty", True) or not c.get("text")]

    if not empty:
        return {"suggestions": [], "message": "채울 빈 셀이 없습니다."}

    filled_summary = "\n".join(
        f"  - 행{c['row']+1}/열{c['col']+1}: {c['text']}"
        for c in filled[:30]
    )
    empty_summary = "\n".join(
        f"  - ID={c['id']}, 행{c['row']+1}/열{c['col']+1}"
        for c in empty[:40]
    )

    prompt = f"""당신은 행정 문서 양식 작성 전문가입니다.
아래 문서와 표의 기존 내용을 참고하여, 비어 있는 셀에 들어갈 적절한 내용을 제안해 주세요.

## 문서 내용 (참고):
{(req.document_context or '')[:3000]}

## 이미 채워진 셀:
{filled_summary or '(없음)'}

## 비어 있는 셀 (채워야 할 항목):
{empty_summary}

## 지시사항:
- 문서 내용과 채워진 셀을 참고하여 빈 셀에 적합한 내용을 제안하세요.
- 확실하지 않은 셀은 빈 문자열("")로 반환하세요.
- 반드시 아래 JSON 형식으로만 응답하세요.

[FILL_CELLS]
{{
  "suggestions": [
    {{"cell_id": "셀ID", "value": "제안값"}},
    ...
  ],
  "message": "채우기 완료 요약 메시지"
}}
[/FILL_CELLS]"""

    try:
        fill_model = genai.GenerativeModel('gemini-3-flash-preview')
        response = fill_model.generate_content(prompt)
        reply = response.text.strip()

        match = re.search(r'\[FILL_CELLS\](.*?)\[/FILL_CELLS\]', reply, re.DOTALL)
        if match:
            data = json.loads(match.group(1).strip())
            # 빈 value 제거
            data["suggestions"] = [
                s for s in data.get("suggestions", []) if s.get("value")
            ]
            print(f"[fill-cells] 제안 {len(data['suggestions'])}개")
            return data
        else:
            print(f"[fill-cells] JSON 파싱 실패. 응답: {reply[:200]}")
            return {"suggestions": [], "message": "AI 응답 파싱에 실패했습니다."}
    except Exception as e:
        print(f"[fill-cells 오류] {e}")
        return {"error": str(e), "suggestions": []}