import React, { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";
import { Upload, Clock, FileText, Settings, X, BookOpen, ChevronRight, Lightbulb, Sparkles, MessageSquare, PanelRightClose, PanelRightOpen } from 'lucide-react';
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

export default function Viewer({ parsedData, ocrData, pdfFileUrl }) {
    // 요약 박스 표시 여부 상태 (기본값: true)
    const [showSummary, setShowSummary] = useState(true);

    // 현재 보고 있는 PDF 경로 상태 (기본값: 샘플)
    const [pdfUrl, setPdfUrl] = useState("/sample.pdf");

    // PDF 원본 렌더링 모드 여부
    const [isPdf, setIsPdf] = useState(false);

    // 최근 문서 목록 상태
    const [recentDocs, setRecentDocs] = useState([
        {id: 1, title: '행정기본법.pdf', date: '2024.11.14'},
        {id: 2, title: '조세특례제한법.pdf', date: '2024.11.13'},
        {id: 3, title: '도시및주거환경지정비법.pdf', date: '2024.11.13'},
        {id: 4, title: '건축법시행령.pdf', date: '2024.11.12'},
    ]);

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

    // 에이전트 패널 접기/펼치기 (디폴트: 접힘)
    const [agentOpen, setAgentOpen] = useState(false);

    // 스크롤 동기화용 ref (PdfHighlightViewer 내부 컨테이너에 연결)
    const leftScrollRef = useRef(null);
    const rightScrollRef = useRef(null);
    const isSyncingScroll = useRef(false);

    // 스크롤 동기화: PdfHighlightViewer 내부 스크롤 이벤트 연결
    useEffect(() => {
      const leftEl = leftScrollRef.current;
      const rightEl = rightScrollRef.current;
      if (!leftEl || !rightEl) return;

      const syncFrom = (source, target) => () => {
        if (isSyncingScroll.current) return;
        isSyncingScroll.current = true;
        const maxScroll = source.scrollHeight - source.clientHeight;
        const ratio = maxScroll > 0 ? source.scrollTop / maxScroll : 0;
        target.scrollTop = ratio * (target.scrollHeight - target.clientHeight);
        requestAnimationFrame(() => { isSyncingScroll.current = false; });
      };

      const syncLeftToRight = syncFrom(leftEl, rightEl);
      const syncRightToLeft = syncFrom(rightEl, leftEl);

      leftEl.addEventListener('scroll', syncLeftToRight);
      rightEl.addEventListener('scroll', syncRightToLeft);
      return () => {
        leftEl.removeEventListener('scroll', syncLeftToRight);
        rightEl.removeEventListener('scroll', syncRightToLeft);
      };
    });

    // 에이전트 어시스트 ↔ PDF 뷰어 브리지
    const [sharedTableCells, setSharedTableCells] = useState([]);       // PdfHighlightViewer → AgentChat
    const [externalFillSuggestions, setExternalFillSuggestions] = useState(null); // AgentChat → PdfHighlightViewer

    // 드래그 선택 → 에이전트 설명 브리지
    const [externalPrompt, setExternalPrompt] = useState(null);
    const [pendingSelectedText, setPendingSelectedText] = useState(null); // 확인 대화상자용

    const handleCellsFetched = (pages) => setSharedTableCells(pages);
    const handleAgentFill = (suggestions) => setExternalFillSuggestions([...suggestions]);
    const handleTextSelected = (text) => {
      setPendingSelectedText(text);
    };
    const confirmSendToAgent = () => {
      if (!pendingSelectedText) return;
      const prompt = `다음 문단을 쉽게 설명해줘:\n\n"${pendingSelectedText}"`;
      setExternalPrompt({ text: prompt, id: Date.now() });
      setPendingSelectedText(null);
      setAgentOpen(true); // 에이전트 패널 자동 열기
    };
    const cancelSendToAgent = () => {
      setPendingSelectedText(null);
    };

    // props로 받은 데이터를 상태에 반영 (Upload에서 넘어올 때)
    useEffect(() => {
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
    }, [parsedData, ocrData, pdfFileUrl]);

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
        `http://localhost:8001/ocr/s3/${encodeURIComponent(s3Key)}`
      );
      console.log("7. OCR 결과 도착!", ocrResponse.data);
      setOcrText(ocrResponse.data.text || ocrResponse.data);
      setParsedText("");  // 문서 파싱 결과는 비움
    } else {
      // 파일이 문서일 때 -> 파싱 서버 (8000번) 요청
      console.log("6. 파싱 요청 중..., S3 키:", s3Key);
      const parseResponse = await axios.get(
        `http://localhost:8000/parse/s3/${encodeURIComponent(s3Key)}`
      );
      console.log("7. 파싱 완료!", parseResponse.data);
      const extractedText = parseResponse.data.text;
      setParsedText(extractedText);  // 파싱 결과 저장

      setOcrText("");  // OCR 결과는 비움
    }

    // 최근 문서 목록 업데이트
    const newDoc = {
      id: Date.now(),
      title: file.name,
      date: new Date().toLocaleDateString("ko-KR", {
        year: "numeric",
        month:"2-digit",
        day: "2-digit",
      })
      .replace(/\. /g, ".")
      .replace(".", "")
    };

    const filteredDocs = recentDocs.filter((doc) => doc.title != file.name);
    setRecentDocs([newDoc, ...filteredDocs].slice(0, 10));

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
              <li key={doc.id} className="doc-item">
                <div className="doc-info">
                  <div className="doc-icon-box">
                    <FileText size={18} />
                  </div>
                  <div className="doc-text">
                    <span className="doc-title">{doc.title}</span>
                    <span className="doc-date">{doc.date}</span>
                  </div>
                </div>
                <ChevronRight size={16} color="#9ca3af" />
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* 2. 메인 콘텐츠 — 원본 + easyDOC 나란히 */}
      <main className="main-content">
        {/* 상단 헤더 */}
        <div className="content-header">
          <div className="header-title">
            <BookOpen size={24} color="#3D4B90" />
            <span>문서</span>
          </div>
          <button
            className="agent-toggle-btn"
            onClick={() => setAgentOpen(prev => !prev)}
            title={agentOpen ? "AI 에이전트 닫기" : "AI 에이전트 열기"}
          >
            {agentOpen ? <PanelRightClose size={20} /> : <PanelRightOpen size={20} />}
            <span>AI</span>
          </button>
        </div>

        {/* 탭 라벨 */}
        <div className="dual-tab-labels">
          <div className="dual-tab-label dual-tab-label--original">원본</div>
          <div className="dual-tab-separator">⋮</div>
          <div className="dual-tab-label dual-tab-label--easy">easyDOC</div>
        </div>

        {/* 양쪽 패널 */}
        <div className="dual-panel-container">
          {/* 왼쪽: 원본 PDF */}
          <div className="dual-panel dual-panel--left">
            {isPdf && pdfUrl && pdfUrl !== "/sample.pdf" ? (
              <PdfHighlightViewer
                pdfUrl={pdfUrl}
                highlightWord={highlightWord}
                parsedText={parsedText || ocrText}
                onCellsFetched={handleCellsFetched}
                externalSuggestions={externalFillSuggestions}
                onTextSelected={handleTextSelected}
                scrollRef={leftScrollRef}
              />
            ) : (
              <div className="no-content">
                <p>파일을 업로드하면 원본 문서가 여기에 표시됩니다.</p>
              </div>
            )}
          </div>

          {/* 구분선 */}
          <div className="dual-panel-divider" />

          {/* 오른쪽: easyDOC (원본과 동일한 PDF 뷰) */}
          <div className="dual-panel dual-panel--right">
            {isPdf && pdfUrl && pdfUrl !== "/sample.pdf" ? (
              <PdfHighlightViewer
                pdfUrl={pdfUrl}
                highlightWord={highlightWord}
                parsedText={parsedText || ocrText}
                scrollRef={rightScrollRef}
              />
            ) : (
              <div className="no-content">
                <p>파일을 업로드하면 easyDOC 문서가 여기에 표시됩니다.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* 3. AI 에이전트 — 접기/펼치기 */}
      <div className={`agent-panel-wrapper ${agentOpen ? 'open' : 'closed'}`}>
        <AgentChat
          parsedText={parsedText}
          documentName={documentName}
          onHighlightWord={setHighlightWord}
          tableCells={sharedTableCells}
          onAgentFill={handleAgentFill}
          externalPrompt={externalPrompt}
        />
      </div>

      {/* 드래그 선택 확인 대화상자 */}
      {pendingSelectedText && (
        <div className="drag-confirm-overlay" onClick={cancelSendToAgent}>
          <div className="drag-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="drag-confirm-header">
              <Lightbulb size={20} color="#3D4B90" />
              <h4 className="drag-confirm-title">선택한 내용을 AI에게 설명 요청할까요?</h4>
            </div>
            <div className="drag-confirm-text-box">
              <p className="drag-confirm-text">{pendingSelectedText}</p>
            </div>
            <div className="drag-confirm-actions">
              <button className="drag-confirm-btn drag-confirm-btn--cancel" onClick={cancelSendToAgent}>
                취소
              </button>
              <button className="drag-confirm-btn drag-confirm-btn--ok" onClick={confirmSendToAgent}>
                <Sparkles size={14} />
                설명 요청
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}