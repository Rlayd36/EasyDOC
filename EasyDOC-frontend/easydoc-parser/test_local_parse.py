import requests

# 로컬 PDF 파일로 직접 파싱 테스트
pdf_path = input("PDF 파일 경로 입력: ").strip('"')

with open(pdf_path, 'rb') as f:
    files = {'file': f}
    response = requests.post('http://localhost:8000/parse/pdf', files=files)
    
print("응답:", response.json())

if 'text' in response.json():
    text = response.json()['text']
    print(f"\n추출된 텍스트 ({len(text)} 글자):")
    print(text[:500])  # 처음 500자만 출력
