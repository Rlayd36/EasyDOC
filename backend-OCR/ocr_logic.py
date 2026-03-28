from google.cloud import vision
import io 
import os
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# 윈도우 기본 폰트 '맑은 고딕' 등록 (프론트엔드에서 텍스트 레이어 인식용)
pdfmetrics.registerFont(TTFont('Malgun', 'malgun.ttf'))

class EasyDocOCR:
    def __init__(self):
        #Google Vision 클라이언트 초기화
        #주의: 실행 시 환경변수 'GOOGLE_APPLICATION_CREDENTIALS'가 설정되어 있어야 함
        self.client = vision.ImageAnnotatorClient()

    def extract_text_and_make_pdf(self, image_path: str, pdf_output_path: str) -> str:
        """
        이미지 파일에서 텍스트를 추출하고, 
        투명한 텍스트가 입혀진 '드래그 가능한 PDF'를 생성합니다.
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

            full_text = texts[0].description
            words = texts[1:] 

            #3. PDF 캔버스 생성
            img = Image.open(image_path)
            width, height = img.size
            c = canvas.Canvas(pdf_output_path, pagesize=(width, height))

            #4. 배경으로 원본 이미지 그리기
            c.drawImage(ImageReader(img), 0, 0, width, height)

            #5. 투명 텍스트 레이어 입히기
            for word in words:
                # 단어 좌표 추출
                vertices = word.bounding_poly.vertices
                x_min = min(getattr(v, 'x', 0) for v in vertices)
                y_min = min(getattr(v, 'y', 0) for v in vertices)
                y_max = max(getattr(v, 'y', 0) for v in vertices)

                word_text = word.description
                word_height = y_max - y_min

                pdf_y = height - y_max
                pdf_x = x_min

                font_size = word_height if word_height > 0 else 10

                text_obj = c.beginText()
                text_obj.setTextRenderMode(3)
                text_obj.setFont('Malgun', font_size)
                text_obj.setTextOrigin(pdf_x, pdf_y)
                text_obj.textOut(word_text)

                c.drawText(text_obj)

            c.save()

            return full_text

        except Exception as e:
            print(f"OCR 처리 중 오류 발생: {e}")
            return f"오류 발생: {str(e)}"