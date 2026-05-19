const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "bmp",
  "webp",
]);

export function getDocumentExtension(fileName, fileType) {
  const fromType = (fileType || "").toLowerCase().replace(/^\./, "");
  if (fromType) return fromType;
  if (!fileName || !fileName.includes(".")) return "";
  return fileName.split(".").pop().toLowerCase();
}

export function isImageExtension(ext) {
  return IMAGE_EXTENSIONS.has((ext || "").toLowerCase());
}

/** DB에 저장된 OCR 이미지 문서: 원본은 이미지, s3_url은 OCR로 생성된 PDF */
export function isOcrImageDocument(doc) {
  if (!doc?.s3_url) return false;

  const ext = getDocumentExtension(doc.file_name, doc.file_type);
  if (!isImageExtension(ext)) return false;

  const url = doc.s3_url.toLowerCase();
  return (
    url.includes("ocr_pdfs/") ||
    url.includes(".pdf") ||
    url.includes("content-type=application%2fpdf")
  );
}

export function buildOcrResultFromDocument(doc) {
  return {
    id: doc.id,
    text: doc.text || "",
    pdf_url: doc.s3_url,
    doc_type: doc.doc_type || "default",
  };
}
