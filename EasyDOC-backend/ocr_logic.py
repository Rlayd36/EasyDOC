from google.cloud import vision
import io 
import os

class EasyDocOCR:
    def __init__(self):
        #Google Vision 클라이언트 초기화
        #주의: 실행 시 환경변수 'GOOGLE_APPLICATION_CREDENTIALS'가 설정되어 있어야 함
        self.client = vision.ImageAnnotatorClient()

    def extract_text(self, image_path: str) -> str:
        """
        이미지 파일 경로를 받아 텍스트를 추출하여 반환합니다.
        """
        try:
            #1. 이미지 파일을 메모리로 읽어오기
            with io.open(image_path, 'rb') as image_file:
                content = image_file.read()

            image = vision.Image(content=content)

            #2. Google 서버에 텍스트 감지 요청
            response = self.client.text_detection(image=image)
            texts = response.text_annotations

            if response.error.message:
                raise Exception(f"Google Vision API Error: {response.error.message}")

            if not texts:
                return "텍스트를 찾을 수 없습니다."

            #3. 전체 텍스트 반환 (texts[0]에 전체 내용이 들어있음)
            return texts[0].description

        except Exception as e:
            print(f"OCR 처리 중 오류 발생: {e}")
            return f"오류 발생: {str(e)}"