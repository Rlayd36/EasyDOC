# EasyDOC

졸업설계

# OCR 서버 실행 용, 프론트엔드 실행 용 터미널 두 개로 진행합니다.
# 터미널을 열면 첫 위치가 EasyDOC 폴더라는 기준으로 작성하였습니다.
---
OCR 실행 준비물: 
- AWS CLI 설치
- 터미널에서 aws configure 커맨드로 지역 서울(ap-northeast-2)로 설정 
- Google Cloud Vision API 키 (Github에는 업로드되있지 않음)
- Google Cloud Vision API 키를 backend-OCR 폴더 안으로 위치

## 라이브러리 설치 (최초 1회): backend-OCR 폴더에서 가상환경을 만들고 라이브러리 설치
cd backend-OCR
python -m venv venv
.\venv\Scripts\activate (맥은 source venv/bin/activate)
pip install -r requirements.txt
---

## 백엔드(OCR) 서버 실행
1. backend-OCR 폴더로 이동
cd backend-OCR

2. 가상환경 켜기
.\venv\Scripts\activate

3. AWS 로그인
aws login

4. 서버 실행
python ocr_server.py

---
## EasyDOC-frontend 실행법

1. EasyDOC-frontend 폴더로 이동
cd EasyDOC-frontend

2. 서버 실행

```
npm run dev
```

```
o + enter
```
