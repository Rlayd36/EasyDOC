import React, { useState, useRef, useEffect } from "react";
import axios from "axios"; 
import { Upload, Clock, FileText, BookOpen, ChevronRight } from 'lucide-react';
import PdfHighlightViewer from "./PdfHighlightViewer";
import AgentChat from "./AgentChat";
import "./viewer.css";

// 로고 아이콘 (Login 페이지의 DocumentIcon 재사용 및 크기 조정)
function LogoIcon() {
  return (
    <svg
      width="55"
      height="55"
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* back sheet */}
      <rect x="16" y="12" width="54" height="68" rx="6" stroke="#000000" strokeWidth="6" />
      {/* front sheet */}
      <rect x="28" y="22" width="54" height="68" rx="6" fill="#FFFFFF" stroke="#000000" strokeWidth="6" />
      {/* small box */}
      <rect x="38" y="34" width="16" height="12" rx="2" stroke="#000000" strokeWidth="6" />
      {/* lines */}
      <line x1="38" y1="54" x2="74" y2="54" stroke="#000000" strokeWidth="6" />
      <line x1="38" y1="62" x2="74" y2="62" stroke="#000000" strokeWidth="6" />
      <line x1="38" y1="70" x2="66" y2="70" stroke="#000000" strokeWidth="6" />
    </svg>
  );
}

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

export default function Viewer({ parsedData, ocrData, pdfFileUrl, userEmail }) {
    // 요약 박스 표시 여부 상태 (기본값: true)
    const [showSummary, setShowSummary] = useState(true);

    // 현재 보고 있는 PDF 경로 상태 (기본값: 샘플)
    const [pdfUrl, setPdfUrl] = useState("/sample.pdf");

    // PDF 원본 렌더링 모드 여부
    const [isPdf, setIsPdf] = useState(false);

    // 최근 문서 목록 상태
    const [recentDocs, setRecentDocs] = useState([]);
    const [selectedDoc, setSelectedDoc] = useState(null); // 현재 선택된 문서 상세 정보

    // 파일 선택을 위한 ref
    const fileInputRef = useRef(null);

    // AWS API Gateway 주소
    const API_GATEWAY_URL = "https://28d37e8xg3.execute-api.ap-northeast-2.amazonaws.com/upload-url";
    
    // S3 URL 구성용 상수
    const S3_BUCKET = "easydoc-upload-list";
    const S3_REGION = "ap-northeast-2";

    // 분석 관련 상태
    const [parsedText, setParsedText] = useState("");
    const [ocrText, setOcrText] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [documentName, setDocumentName] = useState("");
    
    // 에이전트가 설명한 특정 단어 강조 표시용
    const [highlightWord, setHighlightWord] = useState("");

    // 뷰 모드 상태 ("parsed": 파싱된 문서, "original": 원본 문서)
    const [viewMode, setViewMode] = useState("parsed");

    // 에이전트 어시스트 ↔ PDF 뷰어 브리지
    const [sharedTableCells, setSharedTableCells] = useState([]);       // PdfHighlightViewer → AgentChat
    const [externalFillSuggestions, setExternalFillSuggestions] = useState(null); // AgentChat → PdfHighlightViewer

    const handleCellsFetched = (pages) => setSharedTableCells(pages);
    const handleAgentFill = (suggestions) => setExternalFillSuggestions([...suggestions]);

    // docsinfos DB에서 최근 문서 목록 가져오기
    useEffect(() => {
      fetchDocuments();
    }, []);

    const fetchDocuments = async () => {
        try {
            const response = await axios.get(`http://localhost:8002/api/documents?user_email=${userEmail}`);
            setRecentDocs(response.data);
        } catch (error) {
            console.error("문서 목록 로딩 실패:", error);
        }
    };

    // 사이드바에서 문서 클릭 시 상세 내용 가져오기
    const handleDocClick = async (id) => {
        try {
            setIsLoading(true);
            const response = await axios.get(`http://localhost:8002/api/documents/${id}`);

            const docData = response.data;

            setSelectedDoc(docData); // 선택된 문서 상태 업데이트
            //setPdfUrl(null); // PDF 뷰어에서 텍스트 모드로 전환
            setDocumentName(docData.file_name); // AgentChat용 문서 이름 업데이트

            // 가져온 텍스트를 뷰어 상태에 반영
            setParsedText(docData.text || "");
            setOcrText("");

            if (docData.s3_url) {
              setPdfUrl(docData.s3_url);
              const isPdfFile = docData.file_type?.toLowerCase() === 'pdf' ||
                docData.file_name?.toLowerCase().endsWith('.pdf');
                setIsPdf(isPdfFile);
            }
        } catch (error) {
            console.error("문서 상세 로딩 실패:", error);
            alert("문서 내용을 불러올 수 없습니다.");
        } finally {
            setIsLoading(false);
        }
    };

    // 날짜 형식 변환 함수 (2024-11-14 -> 2024.11.14)
    const formatDate = (dateString) => {
      if (!dateString) return "";
      return dateString.substring(0, 10).replace(/-/g, '.');
    };

    // props로 받은 데이터를 상태에 반영 (Upload에서 넘어올 때)
    useEffect(() => {
      if (selectedDoc) return;

        if (parsedData) {
            console.log("Viewer가 받은 parsedData:", parsedData);
            setParsedText(parsedData.text || "");
            setOcrText("");  // 파싱 데이터가 있으면 OCR은 비움
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
  setIsLoading(true);  // 로딩 시작

  try {
    // AWS Lambda에 업로드 URL 요청
    console.log("1. URL 요청 중...");
    const response = await axios.get(API_GATEWAY_URL, {
      params: {
        fileName: file.name,
        fileType: file.type
      }
    });

    const {uploadUrl, key} = response.data;
    console.log("2. URL 발급 완료:", uploadUrl);
    console.log("   Lambda 응답 전체:", response.data);

    // Lambda가 반환한 key를 사용하거나, 없으면 URL에서 추출
    let s3Key;
    if (key) {
      s3Key = key;
      console.log("3. S3 키 (Lambda 제공):", s3Key);
    } else {
      // uploadUrl에서 경로 부분만 추출
      const urlObj = new URL(uploadUrl);
      s3Key = decodeURIComponent(urlObj.pathname.substring(1)); // 맨 앞 '/' 제거 후 디코딩
      console.log("3. S3 키 (URL 추출):", s3Key);
    }

    // S3로 파일 업로드
    console.log("4. S3로 파일 전송 중...");
    await axios.put(uploadUrl, file, {
      headers: {
        "Content-Type": file.type,
      },
    });
    console.log("5. 업로드 성공!");
    
    // S3 공개 URL 생성 및 저장
    const s3Url = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${encodeURIComponent(s3Key)}`;
    setPdfUrl(s3Url);  // S3 URL로 업데이트
    console.log("원본 문서 URL:", s3Url);

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
    } else {
      // 파일이 문서일 때 -> 파싱 서버 (8000번) 요청
      console.log("6. 파싱 요청 중..., S3 키:", s3Key);
      const parseResponse = await axios.get(
        `http://localhost:8000/parse/s3/${encodeURIComponent(s3Key)}?user_email=${userEmail}`
      );
      console.log("7. 파싱 완료!", parseResponse.data);
      const extractedText = parseResponse.data.text;
      setParsedText(extractedText);  // 파싱 결과 저장

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
      <aside className="sidebar sidebar-left">
        {/* 브랜드 로고 */}
        <div className="viewer-brand">
          <LogoIcon />
          <span className="brand-text-easy">Easy</span>
          <span className="brand-text-doc">DOC</span>
        </div>

        {/* 업로드 버튼 */}
        <input
          type = "file"
          ref = {fileInputRef}
          style = {{ display: "none" }}
          accept=".pdf, .hwp, .jpg, .jpeg, .png, .gif, .bmp"
          onChange={handleFileChange}
        />
        <button className="btn-upload" onClick={handleUploadBtnClick}>
          <Upload size={20} />
          <span>문서 업로드</span>
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
                    <FileText size={18} />
                  </div>
                  <div className="doc-text">
                    <span className="doc-title">{doc.file_name}</span>
                    <span className="doc-date">{formatDate(doc.created_at)}</span>
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
        {/* 상단 헤더 */}
        <div className="content-header">
          <div className="header-title">
            <BookOpen size={24} color="#3D4B90" />
            <span>문서</span>
          </div>
        </div>

        {/* 뷰 모드 전환 버튼 */}
        <div className="view-mode-buttons-container">
          <div className="view-mode-buttons">
            <button 
              className={`view-mode-btn ${viewMode === 'parsed' ? 'active' : ''}`}
              onClick={() => setViewMode('parsed')}
            >
              DOC
            </button>
            <button 
              className={`view-mode-btn ${viewMode === 'original' ? 'active' : ''}`}
              onClick={() => setViewMode('original')}
            >
              원본
            </button>
          </div>
        </div>

        <div className="pdf-container">
          {/* 뷰 모드에 따라 문서 표시 */}
          {viewMode === 'parsed' ? (
            /* DOC 탭: 파싱된 텍스트 */
            <div className="parsed-content">
              {ocrText ? (
                <HighlightedTextView text={ocrText} highlightWord={highlightWord} />
              ) : parsedText ? (
                <HighlightedTextView text={parsedText} highlightWord={highlightWord} />
              ) : (
                <div className="no-content">
                  <p>파일을 업로드하면 파싱된 문서가 여기에 표시됩니다.</p>
                </div>
              )}
            </div>
          ) : (
            /* 원본 탭: PDF 원본 이미지 */
            isPdf && pdfUrl && pdfUrl !== "/sample.pdf" ? (
              <PdfHighlightViewer
                pdfUrl={pdfUrl}
                highlightWord={highlightWord}
                parsedText={parsedText || ocrText}
                onCellsFetched={handleCellsFetched}
                externalSuggestions={externalFillSuggestions}
              />
            ) : (
              <iframe
                src={pdfUrl}
                className="pdf-frame"
                title="Document Viewer"
              />
            )
          )}
        </div>
      </main>

      {/* 3. 오른쪽 사이드바 — AI 에이전트 채팅 */}
      <AgentChat
        parsedText={parsedText}
        documentName={documentName}
        onHighlightWord={setHighlightWord}
        tableCells={sharedTableCells}
        onAgentFill={handleAgentFill}
      />

    </div>
  );
}