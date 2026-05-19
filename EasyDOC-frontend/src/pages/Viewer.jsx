import React, { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";
import {
  Upload,
  Clock,
  FileText,
  BookOpen,
  ChevronRight,
  Image as ImageIcon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import PdfHighlightViewer from "./PdfHighlightViewer";
import HwpxViewer from "./HwpxViewer";
import MarkdownViewer from "./MarkdownViewer";
import AgentChat from "./AgentChat";
import "./viewer.css";
import AppBrandLogo from "../components/AppBrandLogo";
import DocTypeSelectModal from "../components/DocTypeSelectModal";
import { formatDocumentDateKo } from "../utils/documentDate";
import { isOcrImageDocument } from "../utils/documentViewMode";

// 텍스트를 하이라이트해주는 컴포넌트
function HighlightedTextView({ text, highlightWord }) {
  if (!text) return null;
  if (!highlightWord) return <pre>{text}</pre>;

  // 단어 분리 시 정규식에 특수문자가 들어갈 것을 대비해 이스케이프 처리
  const escapedWord = highlightWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escapedWord})`, "gi");
  const parts = text.split(regex);

  return (
    <div
      style={{
        whiteSpace: "pre-wrap",
        fontFamily: "inherit",
        lineHeight: 1.6,
        padding: "10px",
      }}
    >
      {parts.map((part, i) =>
        part.toLowerCase() === highlightWord.toLowerCase() ? (
          <span
            key={i}
            className="active-highlight"
            style={{
              backgroundColor: "rgba(255, 255, 0, 0.4)",
              borderBottom: "2px solid #eab308",
              fontWeight: "bold",
              padding: "0 2px",
            }}
          >
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </div>
  );
}

export default function Viewer({
  parsedData,
  ocrData,
  pdfFileUrl,
  userEmail,
  onLogoClick,
}) {
  // 현재 보고 있는 PDF 경로 상태 (기본값: 샘플)
  const [pdfUrl, setPdfUrl] = useState("/sample.pdf");

  // PDF 원본 렌더링 모드 여부
  const [isPdf, setIsPdf] = useState(false);
  const [isHwpx, setIsHwpx] = useState(false);
  const [isOcr, setIsOcr] = useState(false);
  const [isMd, setIsMd] = useState(false);
  const [isOle, setIsOle] = useState(false);

  // 최근 문서 목록 상태
  const [recentDocs, setRecentDocs] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null); // 현재 선택된 문서 상세 정보
  const viewerDocId =
    selectedDoc?.id ?? parsedData?.id ?? ocrData?.id ?? null;

  // 파일 선택을 위한 ref
  const fileInputRef = useRef(null);

  // S3 presigned URL 발급 서버 (OCR 서버)
  const API_GATEWAY_URL = "http://localhost:8001/s3/upload-url";

  // S3 URL 구성용 상수
  const S3_BUCKET = "easydoc-s3";
  const S3_REGION = "ap-northeast-2";

  // 분석 관련 상태
  const [parsedText, setParsedText] = useState("");
  const [ocrText, setOcrText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [documentName, setDocumentName] = useState("");

  // 에이전트가 설명한 특정 단어 강조 표시용
  const [highlightWord, setHighlightWord] = useState("");

  // 업로드 모달에서 선택했거나 DB에서 가져온 문서 유형
  const [currentDocType, setCurrentDocType] = useState(
    parsedData?.doc_type || "default",
  );

  // 패널 접기/펼치기 상태
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  /** 사이드바 업로드: 파일만 먼저 고르고, Upload.jsx와 동일하게 문서 유형 모달 후 처리 */
  const [pendingUploadFile, setPendingUploadFile] = useState(null);
  const [showDocTypeModal, setShowDocTypeModal] = useState(false);

  // 에이전트 어시스트 ↔ PDF 뷰어 브리지
  const [sharedTableCells, setSharedTableCells] = useState([]); // PdfHighlightViewer → AgentChat
  const [externalFillSuggestions, setExternalFillSuggestions] = useState(null); // AgentChat → PdfHighlightViewer

  const handleCellsFetched = (pages) => setSharedTableCells(pages);
  const handleAgentFill = (suggestions) =>
    setExternalFillSuggestions([...suggestions]);

  const fetchDocuments = useCallback(async () => {
    try {
      const response = await axios.get(
        `http://localhost:8002/api/documents?user_email=${userEmail}`,
      );
      setRecentDocs(response.data);
    } catch (error) {
      console.error("문서 목록 로딩 실패:", error);
    }
  }, [userEmail]);

  // docsinfos DB에서 최근 문서 목록 가져오기
  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // 사이드바에서 문서 클릭 시 상세 내용 가져오기
  const handleDocClick = async (id) => {
    try {
      const response = await axios.get(
        `http://localhost:8002/api/documents/${id}`,
      );

      const docData = response.data;

      setSelectedDoc(docData); // 선택된 문서 상태 업데이트
      //setPdfUrl(null); // PDF 뷰어에서 텍스트 모드로 전환
      setDocumentName(docData.file_name); // AgentChat용 문서 이름 업데이트
      setCurrentDocType(docData.doc_type || "default");
      setHighlightWord(""); // 문서가 바뀔 때 강조 단어 초기화

      if (docData.s3_url) {
        setPdfUrl(docData.s3_url);
        if (isOcrImageDocument(docData)) {
          setOcrText(docData.text || "");
          setParsedText("");
          setIsOcr(true);
          setIsPdf(true);
          setIsHwpx(false);
          setIsMd(false);
        } else {
          setParsedText(docData.text || "");
          setOcrText("");
          setIsOcr(false);
          const ext =
            docData.file_type?.toLowerCase() ||
            docData.file_name?.split(".").pop().toLowerCase();
          setIsPdf(ext === "pdf");
          setIsHwpx(ext === "hwpx");
          setIsMd(ext === "md");
        }
      } else {
        setParsedText(docData.text || "");
        setOcrText("");
        setIsOcr(false);
      }
    } catch (error) {
      console.error("문서 상세 로딩 실패:", error);
      alert("문서 내용을 불러올 수 없습니다.");
    }
  };

  // 파일명에 따라 아이콘과 색상을 다르게 반환
  const renderFileIcon = (fileName) => {
    if (!fileName) return <FileText size={18} color="#DC2626" />;
    const ext = fileName.split(".").pop().toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "bmp"].includes(ext)) {
      return <ImageIcon size={18} color="#10B981" />;
    }
    if (ext === "hwpx") {
      return <FileText size={18} color="#2563EB" />;
    }
    return <FileText size={18} color="#DC2626" />;
  };
  // props로 받은 데이터를 상태에 반영 (Upload에서 넘어올 때)
  useEffect(() => {
    if (selectedDoc) return;

    if (parsedData) {
      console.log("Viewer가 받은 parsedData:", parsedData);
      setParsedText(parsedData.text || "");
      setOcrText(""); setIsOcr(false);
      setIsOle(!!parsedData.is_ole);
      if (parsedData.doc_type) setCurrentDocType(parsedData.doc_type);
    } else if (ocrData) {
      console.log("Viewer가 받은 ocrData:", ocrData);
      setOcrText(ocrData.text || ocrData || "");
      setIsOcr(true);
      setIsHwpx(false); // 이전 HWPX 상태 초기화
      setParsedText(""); // OCR 데이터가 있으면 파싱은 비움
      if (ocrData.doc_type) setCurrentDocType(ocrData.doc_type);
    }

    // Upload에서 전달받은 파일 URL 설정
    if (pdfFileUrl) {
      setPdfUrl(pdfFileUrl);
      if (ocrData) {
        // OCR 결과 PDF → PdfHighlightViewer로 표시
        setIsPdf(true);
      } else {
        const ext = parsedData?.filename?.split(".").pop().toLowerCase();
        setIsPdf(ext === "pdf");
        setIsHwpx(ext === "hwpx");
        setIsMd(ext === "md");
        setIsOcr(false);
      }
    }
  }, [parsedData, ocrData, pdfFileUrl, selectedDoc]);

  // 버튼 클릭 시 숨겨진 input 실행
  const handleUploadBtnClick = () => {
    console.log("버튼 클릭됨! fileInputRef 상태:", fileInputRef.current); //디버깅용
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPendingUploadFile(file);
    setShowDocTypeModal(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDocTypeCancel = () => {
    setShowDocTypeModal(false);
    setPendingUploadFile(null);
  };

  const handleDocTypeConfirm = async (docType) => {
    setShowDocTypeModal(false);
    const file = pendingUploadFile;
    setPendingUploadFile(null);
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    setPdfUrl(objectUrl);
    const fileExt = file.name.split(".").pop().toLowerCase();
    setIsPdf(fileExt === "pdf");
    setIsHwpx(fileExt === "hwpx");
    setIsMd(fileExt === "md");
    setDocumentName(file.name);
    setHighlightWord("");
    setSelectedDoc(null);
    setCurrentDocType(docType || "default");
    setIsLoading(true);

    try {
      console.log(`1. URL 요청 중... (doc_type=${docType})`);
      const response = await axios.get(API_GATEWAY_URL, {
        params: {
          fileName: file.name,
          fileType: file.type,
        },
      });

      const { uploadUrl, key } = response.data;
      console.log("2. URL 발급 완료:", uploadUrl);

      let s3Key =
        key || decodeURIComponent(new URL(uploadUrl).pathname.substring(1));
      console.log("3. S3 키:", s3Key);

      console.log("4. S3로 파일 전송 중...");
      await axios.put(uploadUrl, file, {
        headers: { "Content-Type": file.type },
      });
      console.log("5. 업로드 성공!");

      setPdfUrl(objectUrl);
      console.log("원본 문서 임시 URL (업로드 뷰):", objectUrl);

      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (file.type.startsWith("image/")) {
        console.log("6. OCR 서버에 분석 요청...");
        const ocrResponse = await axios.get(
          `http://localhost:8001/ocr/s3/${encodeURIComponent(s3Key)}?user_email=${userEmail}`,
        );
        console.log("7. OCR 결과 도착!", ocrResponse.data);
        setOcrText(ocrResponse.data.text || ocrResponse.data);
        setIsOcr(true); setIsHwpx(false);
        setParsedText("");
        setCurrentDocType(docType || "default");

        if (ocrResponse.data.pdf_url) {
          setPdfUrl(ocrResponse.data.pdf_url);
          setIsPdf(true);
        }
      } else {
        console.log("6. 파싱 요청 중..., S3 키:", s3Key);
        const parseResponse = await axios.get(
          `http://localhost:8000/parse/s3/${encodeURIComponent(s3Key)}?user_email=${userEmail}&doc_type=${encodeURIComponent(docType)}`,
        );
        console.log("7. 파싱 완료!", parseResponse.data);
        if (parseResponse.data.error) {
          alert(`파일 처리 실패: ${parseResponse.data.error}`);
          return;
        }
        const extractedText = parseResponse.data.text;
        setParsedText(extractedText);
        setCurrentDocType(parseResponse.data.doc_type || docType || "default");
        setOcrText(""); setIsOcr(false);
      }

      await fetchDocuments();
    } catch (error) {
      console.error("파일 처리 오류:", error);
      alert("파일 처리 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="viewer-page">
      {/* 1. 왼쪽 사이드바 */}
      <aside
        className={`sidebar sidebar-left ${leftCollapsed ? "collapsed" : ""}`}
      >
        {/* 브랜드 로고 */}
        <div className="viewer-brand">
          <AppBrandLogo onClick={onLogoClick} />
        </div>

        {/* 업로드 버튼 */}
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: "none" }}
          accept=".pdf, .hwpx, .jpg, .jpeg, .png, .gif, .bmp"
          onChange={handleFileChange}
        />
        <button
          className="btn-upload"
          onClick={handleUploadBtnClick}
          disabled={isLoading}
        >
          <Upload size={20} />
          <span>{isLoading ? "처리 중..." : "문서 업로드"}</span>
        </button>

        {/* 최근 문서 목록 */}
        <div className="recent-section">
          <div className="section-title">
            <Clock size={16} />
            <span>최근 문서</span>
          </div>
          <ul className="doc-list">
            {recentDocs.map((doc) => (
              <li
                key={doc.id}
                className={`doc-item ${selectedDoc && selectedDoc.id === doc.id ? "active" : ""}`}
                onClick={() => handleDocClick(doc.id)}
              >
                <div className="doc-info">
                  <div className="doc-icon-box">
                    {renderFileIcon(doc.file_name)}
                  </div>
                  <div className="doc-text">
                    <span className="doc-title">{doc.file_name}</span>
                    <span className="doc-date">
                      {formatDocumentDateKo(doc.created_at)}
                    </span>
                  </div>
                </div>
                <ChevronRight size={16} color="#9ca3af" />
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* 2. 메인 콘텐츠 (문서 뷰어) */}
      <main className="main-content">
        {/* 왼쪽 패널 토글 */}
        <button
          className="panel-toggle panel-toggle-left"
          onClick={() => setLeftCollapsed(!leftCollapsed)}
          title={leftCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
        >
          {leftCollapsed ? (
            <PanelLeftOpen size={18} />
          ) : (
            <PanelLeftClose size={18} />
          )}
        </button>
        {/* 오른쪽 패널 토글 */}
        <button
          className="panel-toggle panel-toggle-right"
          onClick={() => setRightCollapsed(!rightCollapsed)}
          title={rightCollapsed ? "AI 패널 펼치기" : "AI 패널 접기"}
        >
          {rightCollapsed ? (
            <PanelRightOpen size={18} />
          ) : (
            <PanelRightClose size={18} />
          )}
        </button>
        {/* 상단 헤더 */}
        <div className="content-header">
          <div className="header-title">
            <BookOpen size={24} color="#3D4B90" />
            <span>문서</span>
            {isMd && (
              <>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#fff", background: "#7C3AED", borderRadius: 4, padding: "2px 6px", marginLeft: 8 }}>
                  Markdown 모드
                </span>
                <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 6 }}>
                  powered by{" "}
                  <a href="https://github.com/remarkjs/react-markdown" target="_blank" rel="noopener noreferrer" style={{ color: "#6b7280", textDecoration: "underline", cursor: "pointer" }}>
                    react-markdown
                  </a>
                </span>
              </>
            )}
            {isOcr && (
              <>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#fff", background: "#059669", borderRadius: 4, padding: "2px 6px", marginLeft: 8 }}>
                  OCR 모드
                </span>
                <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 6 }}>
                  powered by{" "}
                  <a
                    href="https://cloud.google.com/vision"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#6b7280", textDecoration: "underline", cursor: "pointer" }}
                  >
                    Google Cloud Vision
                  </a>
                </span>
              </>
            )}
            {isPdf && !isOcr && !isHwpx && (
              <>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#fff", background: "#DC2626", borderRadius: 4, padding: "2px 6px", marginLeft: 8 }}>
                  PDF 모드
                </span>
                <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 6 }}>
                  powered by{" "}
                  <a
                    href="https://github.com/mozilla/pdf.js"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#6b7280", textDecoration: "underline", cursor: "pointer" }}
                  >
                    PDF.js
                  </a>
                </span>
              </>
            )}
            {isHwpx && !isOle && (
              <>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#fff", background: "#3D4B90", borderRadius: 4, padding: "2px 6px", marginLeft: 8 }}>
                  HWPX 모드
                </span>
                <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 6 }}>
                  powered by{" "}
                  <a href="https://github.com/edwardkim/rhwp" target="_blank" rel="noopener noreferrer" style={{ color: "#6b7280", textDecoration: "underline", cursor: "pointer" }}>
                    rhwp
                  </a>
                </span>
              </>
            )}
            {isHwpx && isOle && (
              <>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#fff", background: "#92400e", borderRadius: 4, padding: "2px 6px", marginLeft: 8 }}>
                  HWP(OLE) 모드
                </span>
                <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 6 }}>
                  powered by{" "}
                  <a href="https://github.com/edwardkim/rhwp" target="_blank" rel="noopener noreferrer" style={{ color: "#6b7280", textDecoration: "underline", cursor: "pointer" }}>rhwp</a>
                  {", "}
                  <a href="https://pypi.org/project/olefile/" target="_blank" rel="noopener noreferrer" style={{ color: "#6b7280", textDecoration: "underline", cursor: "pointer" }}>olefile</a>
                  {", "}
                  <a href="https://cloud.google.com/vision" target="_blank" rel="noopener noreferrer" style={{ color: "#6b7280", textDecoration: "underline", cursor: "pointer" }}>Google Cloud Vision</a>
                </span>
              </>
            )}
          </div>
        </div>

        <div className="pdf-container">
          {isPdf && pdfUrl && pdfUrl !== "/sample.pdf" ? (
            <PdfHighlightViewer
              pdfUrl={pdfUrl}
              highlightWord={highlightWord}
              parsedText={parsedText || ocrText}
              onCellsFetched={handleCellsFetched}
              externalSuggestions={externalFillSuggestions}
              docType={currentDocType}
              docId={viewerDocId}
              userEmail={userEmail}
            />
          ) : isHwpx && pdfUrl ? (
            <HwpxViewer
              fileUrl={pdfUrl}
              highlightWord={highlightWord}
              docType={currentDocType}
              fallbackText={parsedText}
              isOle={isOle}
            />
          ) : isMd && parsedText ? (
            <MarkdownViewer
              text={parsedText}
              highlightWord={highlightWord}
              docId={viewerDocId}
              onTextSaved={(t) => setParsedText(t)}
            />
          ) : (
            <iframe
              src={pdfUrl}
              className="pdf-frame"
              title="Document Viewer"
            />
          )}
        </div>
      </main>

      {/* 3. 오른쪽 사이드바 — AI 에이전트 채팅 */}
      <div
        className={`sidebar-right-wrapper ${rightCollapsed ? "collapsed" : ""}`}
      >
        <AgentChat
          parsedText={parsedText || ocrText}
          documentName={documentName}
          onHighlightWord={setHighlightWord}
          tableCells={sharedTableCells}
          onAgentFill={handleAgentFill}
        />
      </div>

      <DocTypeSelectModal
        open={showDocTypeModal}
        fileName={pendingUploadFile?.name}
        onConfirm={handleDocTypeConfirm}
        onCancel={handleDocTypeCancel}
      />
    </div>
  );
}
