from paddleocr import PaddleOCR
import logging

# 로그 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class EasyDocOCR:
    def __init__(self):
        logger.info("PaddleOCR 모델 로딩 중...")
        #모델은 메모리에 한 번만 로딩
        self.ocr = PaddleOCR(use_angle_cls=True, lang='korean')
        logger.info("모델 로딩 완료")

    def extract_text(self, image_path: str) -> str:
        """
        이미지 파일 경로를 받아 텍스트를 추출하여 반환합니다.
        """
        try:
            result = self.ocr.ocr(image_path, cls=True)

            extracted_text = []
            if result and result[0]:
                for line in result[0]:
                    # line[1][0]에 텍스트 내용이 있습니다.
                    extracted_text.append(line[1][0])

            return " ".join(extracted_text)

        except Exception as e:
            logger.error(f"OCR 처리 중 오류 발생: {e}")
            return ""