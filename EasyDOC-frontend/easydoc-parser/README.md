# EasyDOC Parser API

EasyDOC 프로젝트의 문서 파싱 서버입니다. PDF, HWP 파일을 텍스트로 변환합니다.

## 필요한 도구

- Python 3.8 이상
- pip (Python 패키지 매니저)

## 설치 방법

### 1. Python 가상환경 생성 (선택사항이지만 권장)

```bash
cd EasyDOC-frontend/easydoc-parser
python -m venv venv
```

### 2. 가상환경 활성화

**Windows:**
```bash
venv\Scripts\activate
```

**Mac/Linux:**
```bash
source venv/bin/activate
```

### 3. 필요한 패키지 설치

```bash
pip install fastapi uvicorn pdfplumber olefile python-dotenv boto3
```

또는 requirements.txt가 있다면:
```bash
pip install -r requirements.txt
```

### 4. 환경변수 설정 (.env 파일)

프로젝트 최상위 폴더(`EasyDOC`)에 `.env` 파일이 있어야 합니다.
파싱 서버는 자동으로 최상위 폴더의 `.env`를 읽어옵니다.

만약 `.env` 파일이 없다면 `EasyDOC` 폴더에 생성:

```env
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_DEFAULT_REGION=ap-northeast-2
S3_BUCKET_NAME=your_bucket_name_here
```

> ⚠️ **주의**: `.env` 파일은 절대 Git에 커밋하지 마세요! (민감한 정보 포함)

## 서버 실행

```bash
cd EasyDOC-frontend/easydoc-parser
uvicorn main:app --reload --port 8000
```

서버가 정상적으로 실행되면 다음 주소로 접속 가능:
- 서버: http://localhost:8000
- API 문서 (Swagger): http://localhost:8000/docs

## API 엔드포인트

### 1. 서버 상태 확인
```
GET /
```
서버가 정상 작동 중인지 확인

**응답 예시:**
```json
{
  "message": "EasyDOC Parser API 작동 중!"
}
```

---

### 2. PDF 파일 파싱
```
POST /parse/pdf
```
업로드한 PDF 파일의 텍스트 추출

**요청 형식:** `multipart/form-data`
- `file`: PDF 파일

**응답 예시:**
```json
{
  "filename": "example.pdf",
  "pages": 5,
  "text": "추출된 텍스트 내용..."
}
```

---

### 3. HWP 파일 파싱
```
POST /parse/hwp
```
업로드한 HWP 파일의 텍스트 추출

**요청 형식:** `multipart/form-data`
- `file`: HWP 파일

**응답 예시:**
```json
{
  "filename": "example.hwp",
  "text": "추출된 텍스트 내용..."
}
```

---

### 4. S3에서 파일 가져와서 파싱
```
GET /parse/s3/{file_key}
```
S3 버킷에 업로드된 파일을 파싱

**경로 파라미터:**
- `file_key`: S3 버킷 내 파일 경로 (예: `uploads/example.pdf`)

**응답 예시:**
```json
{
  "filename": "example.pdf",
  "text": "추출된 텍스트 내용..."
}
```

**프론트엔드 사용 예시:**
```javascript
const response = await axios.get(
  `http://localhost:8000/parse/s3/${encodeURIComponent(fileName)}`
);
console.log(response.data.text);
```

---

## 테스트 방법

### 1. 브라우저에서 테스트
http://localhost:8000/docs 접속 후 각 API를 직접 테스트

### 2. curl로 테스트

**서버 상태 확인:**
```bash
curl http://localhost:8000/
```

**PDF 파일 업로드:**
```bash
curl -X POST "http://localhost:8000/parse/pdf" \
  -H "accept: application/json" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@your_file.pdf"
```

**S3 파싱:**
```bash
curl "http://localhost:8000/parse/s3/uploads/example.pdf"
```

---

## 문제 해결

### 포트가 이미 사용 중인 경우
다른 포트로 실행:
```bash
uvicorn main:app --reload --port 8001
```

### 패키지 설치 오류
Python 버전 확인:
```bash
python --version
```
Python 3.8 이상이어야 합니다.

### AWS 자격 증명 오류
`.env` 파일의 AWS 키 값이 올바른지 확인하세요.

---

## 주의사항

1. **서버를 종료**하려면 터미널에서 `Ctrl + C` 누르기
2. **가상환경 비활성화**하려면 `deactivate` 입력
3. **프론트엔드와 함께 사용**할 때는 CORS가 이미 설정되어 있어 별도 설정 불필요
4. **프로덕션 환경**에서는 `--reload` 옵션 제거하고 실행

---

## 패키지 목록 (requirements.txt 생성용)

```
fastapi==0.109.0
uvicorn[standard]==0.27.0
pdfplumber==0.10.3
olefile==0.47
python-dotenv==1.0.0
boto3==1.34.34
```
