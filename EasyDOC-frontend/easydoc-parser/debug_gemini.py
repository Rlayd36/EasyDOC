"""Gemini API 디버깅 스크립트"""
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

key = os.getenv("GEMINI_API_KEY")
print(f"[3] API 키 로드됨: {bool(key)}")
if key:
    print(f"[4] 키 앞 10자: {key[:10]}...")
    print(f"[5] 키 길이: {len(key)}")
else:
    print("[4] 키가 None입니다!")
    exit()

# Gemini 실제 호출 테스트
import google.generativeai as genai

try:
    genai.configure(api_key=key)
    
    # 사용 가능한 모델 목록 확인
    print("[6] 사용 가능한 모델 목록:")
    for m in genai.list_models():
        if hasattr(m, 'supported_generation_methods'):
            methods = m.supported_generation_methods
        else:
            methods = []
        if 'generateContent' in methods:
            print(f"  - {m.name}")
        elif not methods:
            print(f"  - {m.name} (methods unknown)")
    
    model = genai.GenerativeModel('gemini-2.5-flash')
    response = model.generate_content("안녕이라고만 답해줘")
    print(f"[7] API 호출 성공! 응답: {response.text.strip()}")
except Exception as e:
    print(f"[ERROR] {type(e).__name__}: {e}")
