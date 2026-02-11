# EasyDOC

졸업설계 - 어려운 공공문서를 쉬운 말로 변환하는 서비스

## 프로젝트 구조

- `EasyDOC-frontend/` - React + Vite 프론트엔드
- `EasyDOC-frontend/easydoc-parser/` - FastAPI 파싱 서버 (Python)
- `backend-spring/` - Spring Boot 백엔드

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
cd backend-spring
./gradlew bootRun
```

접속 주소: http://localhost:8080

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
- 문서 파싱 및 변환

