import React, { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios"; 
import { Upload, Clock, FileText, BookOpen, ChevronRight, Image as ImageIcon, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import PdfHighlightViewer from "./PdfHighlightViewer";
import AgentChat from "./AgentChat";
import "./viewer.css";
import AppBrandLogo from "../components/AppBrandLogo";
import { formatDocumentDateKo } from "../utils/documentDate";

// 텍스트를 하이라이트해주는 컴포넌트
function HighlightedTextView({ text, highlightWord }) {
  if (!text) return null;
  if (!highlightWord) return <pre>{text}</pre>;

  // 단어 분리 시 정규식에 특수문자가 들어갈 것을 대비해 이스케이프 처리
  const escapedWord = highlightWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedWord})`, 'gi');
  const parts = text.split(regex);

  return (
    <div style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", lineHeight: 1.6, padding: "10px" }}>
      {parts.map((part, i) =>
        part.toLowerCase() === highlightWord.toLowerCase() ? (
          <span 
            key={i} 
            className="active-highlight"
            style={{ 
              backgroundColor: "rgba(255, 255, 0, 0.4)", 
              borderBottom: "2px solid #eab308", 
              fontWeight: "bold",
              padding: "0 2px"
            }}
          >
            {part}
          </span>
        ) : (
          part
        )
      )}
    </div>
  );
}

export default function Viewer({ parsedData, ocrData, pdfFileUrl, userEmail, onLogoClick }) {
    // 현재 보고 있는 PDF 경로 상태 (기본값: 샘플)
    const [pdfUrl, setPdfUrl] = useState("/sample.pdf");

    // PDF 원본 렌더링 모드 여부
    const [isPdf, setIsPdf] = useState(false);

    // 최근 문서 목록 상태
    const [recentDocs, setRecentDocs] = useState([]);
    const [selectedDoc, setSelectedDoc] = useState(null); // 현재 선택된 문서 상세 정보
    const viewerDocId = selectedDoc?.id ?? parsedData?.id ?? null;

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
    const [currentDocType, setCurrentDocType] = useState(parsedData?.doc_type || "default");

    // 패널 접기/펼치기 상태
    const [leftCollapsed, setLeftCollapsed] = useState(false);
    const [rightCollapsed, setRightCollapsed] = useState(false);

    // 에이전트 어시스트 ↔ PDF 뷰어 브리지
    const [sharedTableCells, setSharedTableCells] = useState([]);       // PdfHighlightViewer → AgentChat
    const [externalFillSuggestions, setExternalFillSuggestions] = useState(null); // AgentChat → PdfHighlightViewer

    const handleCellsFetched = (pages) => setSharedTableCells(pages);
    const handleAgentFill = (suggestions) => setExternalFillSuggestions([...suggestions]);

    const fetchDocuments = useCallback(async () => {
        try {
            const response = await axios.get(`http://localhost:8002/api/documents?user_email=${userEmail}`);
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
            const response = await axios.get(`http://localhost:8002/api/documents/${id}`);

            const docData = response.data;

            setSelectedDoc(docData); // 선택된 문서 상태 업데이트
            //setPdfUrl(null); // PDF 뷰어에서 텍스트 모드로 전환
            setDocumentName(docData.file_name); // AgentChat용 문서 이름 업데이트
<<<<<<< HEAD
            setCurrentDocType(docData.doc_type || "default");
=======
            setHighlightWord(""); // 문서가 바뀔 때 강조 단어 초기화
>>>>>>> origin/develop

            // 가져온 텍스트를 뷰어 상태에 반영
            setParsedText(docData.text || "");
            setOcrText("");

            if (docData.s3_url) {
              setPdfUrl(docData.s3_url);
              const isPdfFile = docData.file_type?.toLowerCase() === 'pdf' ||
                docData.file_type?.toLowerCase() === 'pdf' ||
                docData.file_name?.toLowerCase().endsWith('.pdf') ||
                docData.s3_url?.toLowerCase().includes('.pdf');
                setIsPdf(isPdfFile);
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
      if (ext === "hwp") {
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
            setOcrText("");  // 파싱 데이터가 있으면 OCR은 비움
            if (parsedData.doc_type) setCurrentDocType(parsedData.doc_type);
        } else if (ocrData) {
            console.log("Viewer가 받은 ocrData:", ocrData);
            setOcrText(ocrData.text || ocrData || "");
            setParsedText("");  // OCR 데이터가 있으면 파싱은 비움
        }

        // Upload에서 전달받은 PDF URL 설정
        if (pdfFileUrl) {
            setPdfUrl(pdfFileUrl);
            setIsPdf(true);
        }
    }, [parsedData, ocrData, pdfFileUrl, selectedDoc]);

    // 버튼 클릭 시 숨겨진 input 실행
    const handleUploadBtnClick = () => {
      console.log("버튼 클릭됨! fileInputRef 상태:", fileInputRef.current); //디버깅용
      fileInputRef.current?.click();
    };

// handleFileChange 수정
const handleFileChange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const objectUrl = URL.createObjectURL(file);
  setPdfUrl(objectUrl);
  // PDF 여부에 따라 렌더링 모드 결정
  const fileIsPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  setIsPdf(fileIsPdf);
  setDocumentName(file.name);
  setHighlightWord(""); // 새 파일 업로드 시 강조 단어 초기화
  setIsLoading(true);  // 로딩 시작

  try {
    // URL 발급 (AWS S3) - Presigned URL
    console.log("1. URL 요청 중...");
    const response = await axios.get(API_GATEWAY_URL, {
      params: {
        fileName: file.name,
        fileType: file.type
      }
    });

    const {uploadUrl, key} = response.data;
    console.log("2. URL 발급 완료:", uploadUrl);
    
    // AWS Lambda 응답 key 혹은 임시 파싱한 key
    let s3Key = key || decodeURIComponent(new URL(uploadUrl).pathname.substring(1));
    console.log("3. S3 키:", s3Key);

    // S3 업로드
    console.log("4. S3로 파일 전송 중...");
    await axios.put(uploadUrl, file, {
      headers: { "Content-Type": file.type },
    });
    console.log("5. 업로드 성공!");

    // PDF.js가 로드할 수 있도록 Presigned URL 자체를 pdfUrl로 지정.
    // (S3 객체가 'public-read' 권한이 없을 수도 있어서, 접근 가능한 URL을 써줘야 합니다)
    // 업로드 직후 사용할 수 있도록 뷰어용 URL은 서명된 URL에서 쿼리파라미터를 잠시 제거한 원본이 아닌 GET용 Presigned URL을 새로 받아오거나,
    // S3 버킷 권한 설정에 따라 그냥 s3Url로도 가능할 수 있습니다. 하지만 업로드가 완료된 presigned url을 뷰어에서 다시 fetch로 불러오려 하면 403이 뜰 수 있습니다.
    // 임시로 그냥 로컬 objectUrl을 유지합니다. 서버 파싱이 완료되면 s3 기반으로 넘어가든가 선택하세요.
    setPdfUrl(objectUrl);
    console.log("원본 문서 임시 URL (업로드 뷰):", objectUrl);

    // S3 업로드 완료를 위한 짧은 대기
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 업로드된 파일형에 따라 파싱 혹은 OCR 실행
    if (file.type.startsWith("image/")) {
      // 파일이 이미지일 때 -> OCR 서버 (8001번) 요청
      console.log("6. OCR 서버에 분석 요청...");
      const ocrResponse = await axios.get(
        `http://localhost:8001/ocr/s3/${encodeURIComponent(s3Key)}?user_email=${userEmail}`
      );
      console.log("7. OCR 결과 도착!", ocrResponse.data);
      setOcrText(ocrResponse.data.text || ocrResponse.data);
      setParsedText("");  // 문서 파싱 결과는 비움

      if (ocrResponse.data.pdf_url) {
        setPdfUrl(ocrResponse.data.pdf_url);
        setIsPdf(true);
      }
    } else {
      // 파일이 문서일 때 -> 파싱 서버 (8000번) 요청
      // 사이드바 업로드는 빠른 재업로드 경로이므로 doc_type은 기본값으로 보낸다.
      // 유형 지정이 필요한 경우 메인 업로드 페이지를 사용한다.
      console.log("6. 파싱 요청 중..., S3 키:", s3Key);
      const parseResponse = await axios.get(
        `http://localhost:8000/parse/s3/${encodeURIComponent(s3Key)}?user_email=${userEmail}&doc_type=default`
      );
      console.log("7. 파싱 완료!", parseResponse.data);
      const extractedText = parseResponse.data.text;
      setParsedText(extractedText);  // 파싱 결과 저장
      setCurrentDocType(parseResponse.data.doc_type || "default");

      setOcrText("");  // OCR 결과는 비움
    }

    // 최근 문서 목록 업데이트
   await fetchDocuments();

  } catch (error) {
    console.error("파일 처리 오류:", error);
    alert("파일 처리 중 오류가 발생했습니다.");
  } finally {
    setIsLoading(false);  // 로딩 끝
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }
};

    return (
    <div className="viewer-page">
      
      {/* 1. 왼쪽 사이드바 */}
      <aside className={`sidebar sidebar-left ${leftCollapsed ? "collapsed" : ""}`}>
        {/* 브랜드 로고 */}
        <div className="viewer-brand">
          <AppBrandLogo onClick={onLogoClick} />
        </div>

        {/* 업로드 버튼 */}
        <input
          type = "file"
          ref = {fileInputRef}
          style = {{ display: "none" }}
          accept=".pdf, .hwp, .jpg, .jpeg, .png, .gif, .bmp"
          onChange={handleFileChange}
        />
        <button className="btn-upload" onClick={handleUploadBtnClick} disabled={isLoading}>
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
                    <span className="doc-date">{formatDocumentDateKo(doc.created_at)}</span>
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
          {leftCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
        {/* 오른쪽 패널 토글 */}
        <button
          className="panel-toggle panel-toggle-right"
          onClick={() => setRightCollapsed(!rightCollapsed)}
          title={rightCollapsed ? "AI 패널 펼치기" : "AI 패널 접기"}
        >
          {rightCollapsed ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />}
        </button>
        {/* 상단 헤더 */}
        <div className="content-header">
          <div className="header-title">
            <BookOpen size={24} color="#3D4B90" />
            <span>문서</span>
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
<<<<<<< HEAD
              docType={currentDocType}
=======
              docId={viewerDocId}
              userEmail={userEmail}
>>>>>>> origin/develop
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
      <div className={`sidebar-right-wrapper ${rightCollapsed ? "collapsed" : ""}`}>
        <AgentChat
          parsedText={parsedText}
          documentName={documentName}
          onHighlightWord={setHighlightWord}
          tableCells={sharedTableCells}
          onAgentFill={handleAgentFill}
        />
      </div>

    </div>
  );
}