"""Vertex AI Gemini 디버깅 스크립트"""
from pathlib import Path
from dotenv import load_dotenv
import os

# .env 찾기 - 모든 .env를 로드하되 상위(루트)가 우선
env_path = Path(__file__).resolve().parent
env_files = []
for _ in range(5):
    if (env_path / ".env").exists():
        env_files.append(env_path / ".env")
    env_path = env_path.parent

print(f"[0] 발견된 .env 파일들: {env_files}")
for ef in env_files:
    load_dotenv(dotenv_path=ef, override=True)
    print(f"  로드: {ef}")

# 서비스 계정 키 경로 설정
_parser_dir = Path(__file__).resolve().parent
_gac = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
if _gac:
    _cred_path = Path(_gac)
    if not _cred_path.is_absolute():
        _cred_path = (_parser_dir / _gac).resolve()
    if _cred_path.is_file():
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(_cred_path)
        print(f"[1] ✓ 서비스 계정 키: {_cred_path}")
    else:
        print(f"[1] ⚠ 키 파일 없음: {_cred_path}")
        exit()

project_id = os.getenv("GCP_PROJECT_ID")
location = os.getenv("GCP_VERTEX_LOCATION", "asia-northeast3")
model_name = os.getenv("GCP_GEMINI_MODEL", "gemini-3-pro-preview")
print(f"[2] 프로젝트: {project_id}, 리전: {location}, 모델: {model_name}")

# Vertex AI 실제 호출 테스트
import vertexai
from vertexai.generative_models import GenerativeModel

try:
    vertexai.init(project=project_id, location=location)
    model = GenerativeModel(model_name)
    response = model.generate_content("안녕이라고만 답해줘")
    print(f"[3] ✓ Vertex AI 호출 성공! 응답: {response.text.strip()}")
except Exception as e:
    print(f"[ERROR] {type(e).__name__}: {e}")
