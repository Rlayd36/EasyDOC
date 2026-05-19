from fastapi import FastAPI, UploadFile, File, Depends, Query
from sqlalchemy.orm import Session
import sys
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import pdfplumber
import zipfile
from xml.etree import ElementTree as ET
import vertexai
from vertexai.generative_models import GenerativeModel, Content, Part
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
    for _enc in ("utf-8", "euc-kr", "cp949", "latin-1"):
        try:
            load_dotenv(dotenv_path=_ef, override=True, encoding=_enc)
            break
        except UnicodeDecodeError:
            continue
if _env_files:
    print(f"✓ .env 로드 완료: {[str(f) for f in _env_files]}")


# GOOGLE_APPLICATION_CREDENTIALS: 상대 경로는 이 파일(easydoc-parser) 기준으로 해석
_parser_dir = Path(__file__).resolve().parent
_gac = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
if _gac:
    _cred_path = Path(_gac)
    if not _cred_path.is_absolute():
        _cred_path = (_parser_dir / _gac).resolve()
    if _cred_path.is_file():
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(_cred_path)
        print(f"✓ 서비스 계정 키: {_cred_path}")
    else:
        print(f"⚠ GOOGLE_APPLICATION_CREDENTIALS 파일 없음: {_cred_path}")

# --- DB 공유를 위한 경로 설정 ---
current_file_path = Path(__file__).resolve()
root_dir = current_file_path.parent.parent.parent

if str(root_dir) not in sys.path:
    sys.path.append(str(root_dir))

from database_document.database import get_db, Document, upsert_document_by_identity
import hashlib
# -----------------------------

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


VERTEX_GEMINI_MODEL = os.getenv("GCP_GEMINI_MODEL", "gemini-2.5-flash")
VERTEX_LOCATION = os.getenv("GCP_VERTEX_LOCATION", "asia-northeast3")


def call_gemini(prompt_text, *, tag: str = ""):
    """Gemini 호출 공통 래퍼 — 어떤 엔드포인트가 어느 모델을 썼는지 콘솔에 기록"""
    label = f"[{tag}] " if tag else ""
    print(f"🔮 {label}Gemini 호출 → model={VERTEX_GEMINI_MODEL}, location={VERTEX_LOCATION}")
    return gemini_model.generate_content(prompt_text)

# Vertex AI (Gemini) 설정
gemini_model = None
try:
    project_id = os.getenv("GCP_PROJECT_ID")
    if project_id:
        vertexai.init(project=project_id, location=VERTEX_LOCATION)
        gemini_model = GenerativeModel(VERTEX_GEMINI_MODEL)
        print(
            f"✓ Vertex AI Gemini 초기화 성공 "
            f"(model={VERTEX_GEMINI_MODEL}, location={VERTEX_LOCATION})"
        )
    else:
        print("⚠ GCP_PROJECT_ID가 설정되지 않음 - 사전 기반 설명만 사용")
except Exception as e:
    print(f"⚠ Vertex AI 초기화 실패: {e} - 사전 기반 설명만 사용")
    gemini_model = None

# Gemini 응답 캐시 (gemini_word.csv)
GEMINI_CACHE_PATH = Path(__file__).resolve().parent / "gemini_word.csv"
def load_gemini_cache():
    if GEMINI_CACHE_PATH.exists():
        df = pd.read_csv(GEMINI_CACHE_PATH, encoding='utf-8')
        cache = {}
        for _, row in df.iterrows():
            # 단어 또는 설명이 비어있으면 건너뜀
            if pd.isna(row.get('단어')) or pd.isna(row.get('설명')):
                continue
            cache[row['단어']] = {
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
            '설명': item['easy_expression'],
            '생성일': today,
        })
    new_df = pd.DataFrame(new_rows)
    if GEMINI_CACHE_PATH.exists():
        existing = pd.read_csv(GEMINI_CACHE_PATH, encoding='utf-8')
        # 레거시 '난이도' 컬럼이 있어도 무시하고 병합
        if '난이도' in existing.columns:
            existing = existing.drop(columns=['난이도'])
        combined = pd.concat([existing, new_df], ignore_index=True)
        combined.drop_duplicates(subset=['단어'], keep='last', inplace=True)
    else:
        combined = new_df
    combined.to_csv(GEMINI_CACHE_PATH, index=False, encoding='utf-8')
    # 메모리 캐시도 업데이트
    for item in words_data:
        gemini_cache[item['word']] = {
            "explanation": item['easy_expression'],
        }
    print(f"[Gemini 캐시 저장] {len(words_data)}개 단어 추가 (전체 {len(gemini_cache)}개)")

gemini_cache = load_gemini_cache()


# ============================================================
# 문서 유형(doc_type)별 프롬프트 로더
# ============================================================
PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"


def load_prompts():
    """prompts/registry.json + _base.json + types/**/*.json 를 메모리에 로드.

    types 디렉토리는 카테고리별 하위 폴더(예: types/law-contract/legal.json)로
    구성될 수 있으며, 파일은 `id` 기준으로 평탄하게 인덱싱됩니다.
    """
    registry_path = PROMPTS_DIR / "registry.json"
    base_path = PROMPTS_DIR / "_base.json"
    types_dir = PROMPTS_DIR / "types"

    if not registry_path.exists():
        print(f"⚠ 프롬프트 registry 없음: {registry_path}")
        return {
            "registry": {"types": [], "categories": [], "default_id": "default"},
            "base": {},
            "types": {},
        }

    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    base = json.loads(base_path.read_text(encoding="utf-8")) if base_path.exists() else {}

    # types/**/*.json 을 한 번에 인덱싱 (id → 경로). 동일 id가 두 곳에 있으면 마지막 승리.
    file_index = {}
    if types_dir.exists():
        for path in types_dir.rglob("*.json"):
            file_index[path.stem] = path

    types_data = {}
    for type_meta in registry.get("types", []):
        tid = type_meta["id"]
        type_file = file_index.get(tid)
        if type_file and type_file.exists():
            types_data[tid] = json.loads(type_file.read_text(encoding="utf-8"))
        else:
            print(f"⚠ 프롬프트 파일 없음: {tid}.json (registry에는 있음)")

    print(f"✓ 프롬프트 로드 완료: {len(types_data)}개 유형 ({list(types_data.keys())})")
    return {"registry": registry, "base": base, "types": types_data}


PROMPTS = load_prompts()
DEFAULT_DOC_TYPE = PROMPTS["registry"].get("default_id", "default")


def resolve_doc_type(doc_type: Optional[str]) -> str:
    """알 수 없는 doc_type 은 default 로 폴백"""
    if doc_type and doc_type in PROMPTS["types"]:
        return doc_type
    return DEFAULT_DOC_TYPE


def build_analyze_words_prompt(doc_type: str, chunk: str, idx: int, total: int, exclude: str) -> str:
    """어려운 단어 추출 프롬프트 (유형별)"""
    tid = resolve_doc_type(doc_type)
    type_block = PROMPTS["types"][tid]["analyze_words"]
    base = PROMPTS["base"].get("analyze_words", {})
    audience = PROMPTS["base"].get("audience", "")

    return f"""## 역할
{type_block.get("role", "")}

## 대상 독자
{audience}

## 작업
아래 문서 조각에서 **이 대상 독자가 읽었을 때 이해에 걸림이 될 만한 용어**를 찾아 쉬운 말로 설명해주세요.

{type_block.get("selection_criteria", "")}

## 규칙
{base.get("common_rules", "")}{exclude}

{base.get("output_format", "")}

{type_block.get("examples", "")}

## 문서 조각 ({idx + 1}/{total})
{chunk}
"""


def build_important_pages_prompt(doc_type: str, pages_block: str) -> str:
    """중요 페이지 분석 프롬프트 (유형별)"""
    tid = resolve_doc_type(doc_type)
    type_block = PROMPTS["types"][tid]["analyze_important_pages"]
    base = PROMPTS["base"].get("analyze_important_pages", {})

    return f"""## 역할
{type_block.get("role", "")}

## 작업
아래 문서의 각 페이지를 분석하여, 사용자가 반드시 읽어야 하는 **중요한 페이지**를 찾아주세요.

{type_block.get("criteria", "")}

## 규칙
{base.get("common_rules", "")}

{base.get("output_format", "")}

{type_block.get("examples", "")}

## 문서 내용
{pages_block}
"""


@app.get("/")
def root():
    return {"message": "EasyDOC Parser API 작동 중!"}


@app.get("/document-types")
def document_types():
    """프론트가 업로드 모달에 표시할 문서 유형 목록"""
    return PROMPTS["registry"]


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


def _parse_hwpx_bytes(contents: bytes) -> str:
    """HWPX(ZIP+XML) 바이트에서 텍스트 추출.

    1순위: Preview/PrvText.txt (이미 추출된 텍스트)
    2순위: Contents/section*.xml 의 <*:t> 요소 (네임스페이스 버전 무관)
    """
    with zipfile.ZipFile(io.BytesIO(contents)) as z:
        names = z.namelist()

        # 1순위: PrvText.txt
        prv = next((n for n in names if n.lower() == "preview/prvtext.txt"), None)
        if prv:
            raw = z.read(prv)
            for enc in ("utf-8", "utf-16", "euc-kr", "cp949"):
                try:
                    text = raw.decode(enc).strip()
                    if text:
                        print(f"[HWPX] PrvText.txt 사용 ({enc}), 길이: {len(text)}")
                        return text
                except (UnicodeDecodeError, ValueError):
                    continue

        # 2순위: section XML — 네임스페이스 버전 무관하게 <*:t> 추출
        section_files = sorted(
            n for n in names
            if n.lower().startswith("contents/section") and n.endswith(".xml")
        )
        text_parts = []
        for sf in section_files:
            root = ET.fromstring(z.read(sf))
            for elem in root.iter():
                if (
                    elem.tag.endswith("}t")
                    and "hancom.co.kr/hwpml" in elem.tag
                    and elem.text
                ):
                    text_parts.append(elem.text)
            text_parts.append("")

        result = "\n".join(text_parts).strip()
        print(f"[HWPX] XML 파싱 텍스트 길이: {len(result)}")
        return result


@app.post("/parse/hwpx")
async def parse_hwpx(file: UploadFile = File(...)):
    """HWPX 파일에서 텍스트 추출"""
    contents = await file.read()
    try:
        text = _parse_hwpx_bytes(contents)
    except Exception as e:
        return {"filename": file.filename, "error": str(e), "text": ""}
    return {"filename": file.filename, "text": text}


@app.get("/parse/s3/{file_key:path}")
async def parse_from_s3(
    file_key: str,
    user_email: str = "",
    doc_type: str = Query(default="default"),
    db: Session = Depends(get_db),
):
    """S3에서 파일 가져와서 파싱 및 DB 저장"""
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
        
        elif ext == "hwpx":
            text = _parse_hwpx_bytes(contents)

        elif ext == "md":
            for enc in ("utf-8", "euc-kr", "cp949", "latin-1"):
                try:
                    text = contents.decode(enc)
                    break
                except (UnicodeDecodeError, ValueError):
                    continue
            else:
                text = contents.decode("utf-8", errors="replace")

        else:
            return {"error": "지원하지 않는 파일 형식입니다. (PDF, HWPX, MD, 이미지만 지원)"}

        # ================= DB 저장 로직 =================
        # 파일 크기 계산
        size_kb = len(contents) / 1024
        file_size_str = f"{size_kb:.1f} KB"

        # 페이지 수 계산
        total_pages = 1
        if ext == "pdf":
            try:
                with pdfplumber.open(io.BytesIO(contents)) as pdf:
                    total_pages = len(pdf.pages)
            except:
                total_pages = 1
        
        # S3 URL 조립
        s3_url = f"https://{BUCKET_NAME}.s3.{os.getenv('AWS_DEFAULT_REGION')}.amazonaws.com/{file_key}"

        # DB 모델 생성
        resolved_type = resolve_doc_type(doc_type)
        content_hash = hashlib.sha256(contents).hexdigest()
        new_doc = upsert_document_by_identity(
            db,
            user_email=user_email,
            file_name=filename,
            content_hash=content_hash,
            fields={
                'file_type': ext,
                's3_url': s3_url,
                'extracted_text': text,
                'file_size': file_size_str,
                'page_count': total_pages,
                'doc_type': resolved_type,
            },
        )

        print(f"[DEBUG] DB 저장 성공! (문서 번호: {new_doc.id}, 크기: {file_size_str}, 페이지: {total_pages}, 유형: {resolved_type})")
        # ========================================================

        # 저장된 ID와 함께 프론트엔드로 응답
        return {"id": new_doc.id, "filename": filename, "text": text, "doc_type": resolved_type}
    
    except Exception as e:
        return {"error": str(e)}


@app.post("/analyze-with-gemini")
async def analyze_with_gemini(data: dict):
    """Gemini가 텍스트를 받아 어려운 단어 추출 + 설명을 한 번에 처리 (캐시 우선, 청크 분할)"""
    text = data.get("text", "")
    doc_type = resolve_doc_type(data.get("doc_type"))

    if not text:
        return {"difficult_words": []}
    
    if gemini_model is None:
        return {"difficult_words": [], "error": "Gemini API 키가 설정되지 않았습니다."}
    
    # 1단계: 캐시에서 이미 아는 단어 찾기
    cached_words = []
    for word, info in gemini_cache.items():
        if word in text:
            cached_words.append({
                "word": word,
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
    
    new_gemini_words = []
    seen_words = set(cached_word_set)  # 중복 방지
    
    # 3단계: 각 청크별로 Gemini 호출
    for idx, chunk in enumerate(chunks):
        # 이미 이 청크 이전에 발견된 단어도 제외
        current_exclude = ""
        if seen_words:
            current_exclude = f"\n\n## 이미 설명된 단어 (제외하세요)\n{', '.join(seen_words)}"

        prompt = build_analyze_words_prompt(
            doc_type=doc_type,
            chunk=chunk,
            idx=idx,
            total=len(chunks),
            exclude=current_exclude,
        )

        try:
            response = call_gemini(prompt, tag=f"analyze-with-gemini[{doc_type}] ch{idx+1}/{len(chunks)}")
            response_text = response.text.strip()
            # 응답 파싱 (단어|||설명)
            for line in response_text.split("\n"):
                line = line.strip()
                if not line or "|||" not in line:
                    continue
                parts = line.split("|||")
                if len(parts) >= 2:
                    word = parts[0].strip()
                    # 레거시 호환: 3필드로 오면 마지막을 설명으로 사용
                    explanation = parts[-1].strip()

                    if word and explanation and word not in seen_words:
                        new_gemini_words.append({
                            "word": word,
                            "easy_expression": explanation,
                            "source": "gemini"
                        })
                        seen_words.add(word)

        except Exception as e:
            print(f"[어려운 단어 분석] 청크 {idx + 1} 처리 오류: {e}")

    # 4단계: 새 단어를 CSV 캐시에 저장
    if new_gemini_words:
        save_to_gemini_cache(new_gemini_words)

    # 캐시 + Gemini 신규 결과 병합 (단어 길이 긴 순)
    all_words = cached_words + new_gemini_words
    all_words.sort(key=lambda x: len(x["word"]), reverse=True)
    
    print(
        f"[어려운 단어 분석 완료] 캐시 {len(cached_words)}개 · 신규 {len(new_gemini_words)}개 · "
        f"전체 단어 {len(all_words)}개 · 처리 청크 {len(chunks)}개"
    )
    return {
        "difficult_words": all_words,
        "total_found": len(all_words),
        "from_cache": len(cached_words),
        "from_gemini": len(new_gemini_words),
        "chunks_processed": len(chunks),
    }


# ============================================================
# 중요 페이지 분석 엔드포인트
# ============================================================

@app.post("/analyze-important-pages")
async def analyze_important_pages(data: dict):
    """페이지별 텍스트를 받아 중요 페이지(독소조항, 핵심 약관 등)를 판별"""
    pages = data.get("pages", [])
    doc_type = resolve_doc_type(data.get("doc_type"))

    if not pages:
        return {"important_pages": []}

    if gemini_model is None:
        return {"important_pages": [], "error": "Gemini API가 설정되지 않았습니다."}

    pages_block = ""
    for p in pages:
        page_num = p.get("page", 0)
        text = p.get("text", "").strip()
        if text:
            pages_block += f"\n--- 페이지 {page_num} ---\n{text}\n"

    if not pages_block.strip():
        return {"important_pages": []}

    prompt = build_important_pages_prompt(doc_type=doc_type, pages_block=pages_block)

    try:
        response = call_gemini(prompt, tag=f"analyze-important-pages[{doc_type}]")
        response_text = response.text.strip()

        important_pages = []
        keywords_by_page = {}

        for line in response_text.split("\n"):
            line = line.strip()
            if not line or "|||" not in line:
                continue
            parts = line.split("|||")

            if parts[0].strip() == "PAGE" and len(parts) >= 5:
                try:
                    page_num = int(parts[1].strip())
                    importance = int(parts[2].strip())
                    reason = parts[3].strip()
                    summary = parts[4].strip() if len(parts) > 4 else reason
                    important_pages.append({
                        "page": page_num,
                        "importance": min(max(importance, 1), 3),
                        "reason": reason,
                        "summary": summary,
                    })
                except ValueError:
                    continue

            elif parts[0].strip() == "KEYWORD" and len(parts) >= 4:
                try:
                    page_num = int(parts[1].strip())
                    keyword = parts[2].strip()
                    explanation = parts[3].strip()
                    if page_num not in keywords_by_page:
                        keywords_by_page[page_num] = []
                    keywords_by_page[page_num].append({
                        "keyword": keyword,
                        "explanation": explanation,
                    })
                except ValueError:
                    continue

        # 키워드를 각 페이지에 병합
        for p in important_pages:
            p["keywords"] = keywords_by_page.get(p["page"], [])

        important_pages.sort(key=lambda x: (-x["importance"], x["page"]))
        total_kw = sum(len(v) for v in keywords_by_page.values())
        print(f"[중요 페이지 분석] {len(important_pages)}개 중요 페이지, 키워드 {total_kw}개 발견")
        return {"important_pages": important_pages}

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[중요 페이지 분석 오류] {e}")
        return {"important_pages": [], "error": str(e)}


# ============================================================
# AI 에이전트 채팅 엔드포인트
# ============================================================

PERSONA_PROMPTS = {
    "default": """당신은 EasyDOC AI 도우미입니다. 행정/법률/계약 문서를 이해하기 쉽게 설명하는 전문가입니다.

## 대상 독자
- 만 19~34세 사회초년생 및 청년층
- 일상 대화에는 문제없지만 설명서·계약서·안내문·법령 등 한자식 표현과 전문용어가 섞인 문서는 이해에 어려움을 겪는 집단
- 모든 답변은 이 독자가 한 번에 읽고 이해할 수 있는 수준으로 맞춰주세요.

## 답변 규칙
- 존댓말 사용.
- 어려운 한자어·법률용어는 일상 표현으로 풀어서 설명합니다.
- 정확하고 친절하게, 원문의 의미를 왜곡하지 않습니다.
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
        chat_model = GenerativeModel(
            VERTEX_GEMINI_MODEL,
            system_instruction=system_prompt,
        )

        contents = []
        for msg in req.messages:
            role = "model" if msg.role == "model" else "user"
            contents.append(
                Content(role=role, parts=[Part.from_text(msg.content)])
            )

        print(
            f"🔮 [chat persona={req.persona}] Gemini 호출 → "
            f"model={VERTEX_GEMINI_MODEL}, location={VERTEX_LOCATION}"
        )
        response = chat_model.generate_content(contents)
        reply = response.text.strip()

        print(
            f"[에이전트 채팅] 성격={req.persona}, 대화 {len(req.messages)}턴, 답변 {len(reply)}자"
        )
        return {"reply": reply, "persona": req.persona}

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[에이전트 채팅 오류] {e}")
        return {"reply": f"응답을 생성하지 못했습니다. 오류: {str(e)[:100]}", "persona": req.persona}


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
        response = call_gemini(prompt, tag="chat/fill-cells")
        reply = response.text.strip()

        match = re.search(r'\[FILL_CELLS\](.*?)\[/FILL_CELLS\]', reply, re.DOTALL)
        if match:
            data = json.loads(match.group(1).strip())
            # 빈 value 제거
            data["suggestions"] = [
                s for s in data.get("suggestions", []) if s.get("value")
            ]
            print(f"[표 셀 자동 채우기] 제안 {len(data['suggestions'])}개 반영")
            return data
        else:
            print(f"[표 셀 자동 채우기] JSON 파싱 실패 · 응답 앞부분: {reply[:200]}")
            return {"suggestions": [], "message": "AI 응답 파싱에 실패했습니다."}
    except Exception as e:
        print(f"[표 셀 자동 채우기 오류] {e}")
        return {"error": str(e), "suggestions": []}