# EasyDOC

졸업설계 - 어려운 공공문서를 쉬운 말로 변환하는 서비스

## 프로젝트 구조

- `EasyDOC-frontend/` - React + Vite 프론트엔드
- `EasyDOC-frontend/easydoc-parser/` - FastAPI 파싱 서버 (Python)
- `EasyDOC-backend/` - Spring Boot 백엔드 (로그인·회원가입·JWT·비밀번호 찾기 등 통합)
- `backend-OCR/` - FastAPI  OCR 서버 (Python, Google Cloud Vision API)
- `database_document/` - FastAPI  DB 서버 (Python, 문서 메타데이터 저장 및 사용자별 최근 문서 목록 관리)

---

## 실행 방법

### 1. 프론트엔드 실행

```bash
cd EasyDOC-frontend
npm install
npm run dev
```

브라우저에서 자동으로 열리지 않으면 `o + Enter` 입력

접속 주소: http://localhost:5173

---

### 2. 파싱 서버 실행 (Python)

```bash
cd EasyDOC-frontend/easydoc-parser
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

접속 주소: http://localhost:8000
API 문서: http://localhost:8000/docs

**필요 사항:**
- Python 3.8 이상
- 프로젝트 최상위 폴더(`EasyDOC`)에 `.env` 파일 필요 (AWS 키 포함)

자세한 내용은 [파싱 서버 README](EasyDOC-frontend/easydoc-parser/README.md) 참고

---

### 3. 백엔드 서버 실행 (Spring Boot)

```bash
cd EasyDOC-backend
export DB_PASSWORD=비밀번호
export JWT_SECRET=32자이상의시크릿문자열
./gradlew bootRun
```

접속 주소: http://localhost:8080

**필요 사항:** MySQL 스키마 `easydoc`, 환경 변수 `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`  
자세한 내용은 [EasyDOC-backend README](EasyDOC-backend/README.md) 참고

---

### 4. OCR 서버 실행 (Python)

```bash
cd backend-OCR
python -m venv venv
.\venv\Scripts\activate (맥은 source venv/bin/activate)
pip install -r requirements.txt
python ocr_server.py
```

접속 주소: http://localhost:8001

**필요 사항:**
- 프로젝트 최상위 폴더(`EasyDOC`)에 `.env` 파일 필요 (AWS 키 포함)
- backend-OCR 폴더 내 `google-key.json` 키 파일 필요

---

### 5. 최근 문서 목록 서버 실행 (Python)

```bash
cd database_document
python -m venv venv
.\venv\Scripts\activate (맥은 source venv/bin/activate)
pip install -r requirements.txt
python document_api.py
```

접속 주소: http://localhost:8002

**필요 사항:**
- 폴더 내의 database.py에 #DB 정보 가져오기 아래에 본인 MySQL DB 정보 입력 (로컬 기본값 채워져 있음)

---

## 환경 변수 설정

프로젝트 최상위 폴더(`EasyDOC`)에 `.env` 파일 생성:

```env
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_DEFAULT_REGION=ap-northeast-2
S3_BUCKET_NAME=your_bucket_name_here
```

> ⚠️ **주의**: `.env` 파일은 Git에 커밋하지 마세요!

---

## 주요 기능

- PDF, HWP 문서 업로드 및 텍스트 추출
- S3를 통한 파일 저장
- 사용자 인증 및 회원가입
- 문서 파싱/OCR 및 변환
- 로그인 사용자별 맞춤형 최근 업로드 문서 목록 제공 및 마이페이지 통계 가능