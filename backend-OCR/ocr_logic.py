from google.cloud import vision
import io 
import os
from pathlib import Path
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.cidfonts import UnicodeCIDFont

def _try_register_ttf(font_name: str, font_path: Path) -> bool:
    try:
        if font_path.is_file():
            pdfmetrics.registerFont(TTFont(font_name, str(font_path)))
            print(f"[OCR] TTF 폰트 등록: {font_name} ({font_path})")
            return True
    except Exception as e:
        print(f"[OCR] TTF 폰트 등록 실패: {font_name} ({font_path}) · {e}")
    return False


def _select_font_name() -> str:
    """
    macOS/Windows 모두에서 한글 선택(드래그/복사) 시 깨지지 않도록
    가능한 한 유니코드 폰트를 등록해서 사용한다.
    우선순위:
      1) repo 동봉 fonts/NotoSansCJKkr-Regular.otf
      2) repo 동봉 malgun.ttf
      3) OS 설치 폰트(Windows/Mac)
      4) ReportLab 내장 CJK CID 폰트(HYGothic-Medium)
      5) 최후: Helvetica
    """
    base_dir = Path(__file__).resolve().parent

    # 1) 프로젝트 동봉 오픈 라이선스 한글 폰트
    if _try_register_ttf("NotoSansCJKkr", base_dir / "fonts" / "NotoSansCJKkr-Regular.otf"):
        return "NotoSansCJKkr"

    # 2) repo 동봉(있으면 제일 안정적)
    if _try_register_ttf("Malgun", base_dir / "malgun.ttf"):
        return "Malgun"

    # 3) Windows 기본 폰트 경로
    windir = os.getenv("WINDIR") or os.getenv("SystemRoot")
    if windir:
        win_font = Path(windir) / "Fonts" / "malgun.ttf"
        if _try_register_ttf("Malgun", win_font):
            return "Malgun"

    # 4) macOS 기본 한글 폰트(환경별 편차가 있어 후보를 여러 개 둠)
    mac_candidates = [
        Path("/System/Library/Fonts/AppleGothic.ttf"),
        Path("/System/Library/Fonts/Supplemental/AppleGothic.ttf"),
        Path("/Library/Fonts/AppleGothic.ttf"),
        Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
        Path("/Library/Fonts/Arial Unicode.ttf"),
    ]
    for p in mac_candidates:
        if _try_register_ttf("AppleGothic", p):
            return "AppleGothic"

    # 5) ReportLab 내장 CID 폰트 (외부 파일 없이도 CJK 유니코드 매핑을 제공)
    try:
        cid_name = "HYGothic-Medium"
        pdfmetrics.registerFont(UnicodeCIDFont(cid_name))
        print(f"[OCR] CID 폰트 등록: {cid_name}")
        return cid_name
    except Exception as e:
        print(f"[OCR] CID 폰트 등록 실패 · {e}")

    print("[OCR] 한글 폰트 없음, Helvetica 사용(한글 선택/복사 깨질 수 있음)")
    return "Helvetica"


FONT_NAME = _select_font_name()

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
                text_obj.setFont(FONT_NAME, font_size)
                text_obj.setTextOrigin(pdf_x, pdf_y)
                text_obj.textOut(word_text)

                c.drawText(text_obj)

            c.save()

            return full_text

        except Exception as e:
            print(f"OCR 처리 중 오류 발생: {e}")
            return f"오류 발생: {str(e)}"