import React, { useState, useRef } from "react";
import axios from "axios"; 
import { Upload, Clock, FileText, Settings, X, User, BookOpen, ChevronRight, Lightbulb } from 'lucide-react';
import "./viewer.css";

// 텍스트 하이라이트 컴포넌트 (나무위키 호버 말풍선)
function HighlightedText({ text, difficultWords }) {
  if (!text) return null;

  const wordMap = new Map();
  difficultWords.forEach(item => {
    wordMap.set(item.word, item);
  });

  const lines = text.split('\n');
  
  return (
    <div className="highlighted-text">
      {lines.map((line, lineIdx) => {
        const parts = [];
        let currentPos = 0;
        const regex = /[\uAC00-\uD7A3]+|[a-zA-Z]+|[0-9]+/g;
        let match;
        
        while ((match = regex.exec(line)) !== null) {
          const word = match[0];
          const startPos = match.index;
          
          if (startPos > currentPos) {
            parts.push(line.substring(currentPos, startPos));
          }
          
          if (wordMap.has(word)) {
            const wordInfo = wordMap.get(word);
            const wordKey = `${lineIdx}-${startPos}`;
            parts.push(
              <span key={wordKey} className={`difficult-word level-${wordInfo.level}`}>
                {word}
                <span className="word-bubble">
                  <strong>{word}</strong>
                  <span className="word-bubble-desc">{wordInfo.easy_expression || `난이도 ${wordInfo.level} 단어`}</span>
                </span>
              </span>
            );
          } else {
            parts.push(word);
          }
          
          currentPos = startPos + word.length;
        }
        
        if (currentPos < line.length) {
          parts.push(line.substring(currentPos));
        }
        
        return (
          <div key={lineIdx}>
            {parts}
          </div>
        );
      })}
    </div>
  );
}

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

export default function Viewer({ parsedData, ocrData }) {
    // 요약 박스 표시 여부 상태 (기본값: true)
    const [showSummary, setShowSummary] = useState(true);

    // 현재 보고 있는 PDF 경로 상태 (기본값: 샘플)
    const [pdfUrl, setPdfUrl] = useState("/sample.pdf");

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

    // 난이도 분석 관련 상태
    const [difficultWords, setDifficultWords] = useState(parsedData?.difficultWords || []);

    // 버튼 클릭 시 숨겨진 input 실행
    const handleUploadBtnClick = () => {
      console.log("버튼 클릭됨! fileInputRef 상태:", fileInputRef.current); //디버깅용
      fileInputRef.current?.click();
    };
    
    // 파일 선택 시 업로드 로직
const [parsedText, setParsedText] = useState(parsedData?.text || "");
const [ocrText, setOcrText] = useState(ocrData ? (ocrData.text || ocrData) : ""); // OCR
const [isLoading, setIsLoading] = useState(false);

// 난이도 분석 함수
const analyzeText = async (text) => {
  try {
    console.log("난이도 분석 요청 중...");
    const response = await axios.post("http://localhost:8000/analyze", {
      text: text,
      min_level: 3  // 3단계 이상만
    });
    console.log("난이도 분석 완료:", response.data);
    setDifficultWords(response.data.difficult_words || []);
  } catch (error) {
    console.error("난이도 분석 오류:", error);
  }
};


// handleFileChange 수정
const handleFileChange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const objectUrl = URL.createObjectURL(file);
  setPdfUrl(objectUrl);
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

    const {uploadUrl} = response.data;
    console.log("2. URL 발급 완료:", uploadUrl);

    // S3로 파일 업로드
    console.log("3. S3로 파일 전송 중...");
    await axios.put(uploadUrl, file, {
      headers: {
        "Content-Type": file.type,
      },
    });
    console.log("4. 업로드 성공!");

    // 업로드된 파일형에 따라 파싱 혹은 OCR 실행
    if (file.type.startsWith("image/")) {
      // 파일이 이미지일 때 -> OCR 서버 (8001번) 요청
      console.log("5. OCR 서버에 분석 요청...");
      const ocrResponse = await axios.get(
        `http://localhost:8001/ocr/s3/${encodeURIComponent(file.name)}`
      );
      console.log("6. OCR 결과 도착!", ocrResponse.data);
      setOcrText(ocrResponse.data.text || ocrResponse.data);
      setParsedText("");  // 문서 파싱 결과는 비움
    } else {
      // 파일이 문서일 때 -> 파싱 서버 (8000번) 요청
      console.log("5. 파싱 요청 중...");
      const parseResponse = await axios.get(
        `http://localhost:8000/parse/s3/${encodeURIComponent(file.name)}`
      );
      console.log("6. 파싱 완료!", parseResponse.data);
      const extractedText = parseResponse.data.text;
      setParsedText(extractedText);  // 파싱 결과 저장

      // 난이도 분석 추가
      await analyzeText(extractedText);
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

      {/* 2. 메인 콘텐츠 (문서 뷰어) */}
      <main className="main-content">
        {/* 상단 헤더 */}
        <div className="content-header">
          <div className="header-title">
            <BookOpen size={24} color="#3D4B90" />
            <span>문서</span>
          </div>
        </div>

        {/*힌트 배너 */}
        <div className="hint-banner">
          <Lightbulb size={18} className="text-yellow-500" color="#f49e0b" />
          <span>
            <span className="hint-highlight">노란색 단어</span>를 눌러보세요
          </span>
        </div>

        <div className="pdf-container">
          {/* 텍스트가 있으면 표시, 없으면 PDF 표시 */}
          {(ocrText || parsedText) ? (
            <div className="parsed-content">
              {ocrText ? (
                <pre>{ocrText}</pre>
              ) : (
                <HighlightedText 
                  text={parsedText} 
                  difficultWords={difficultWords}
                />
              )}
            </div>
          ) : (
            <iframe
              src={pdfUrl}
              className="pdf-frame"
              title="Document Viewer"
            />
          )}

          {/* 플로팅 요약 박스 */}
          {showSummary && (
            <div className="summary-float-box">
              <div className="summary-header">
                <div className="summary-title-group">
                  <Settings size={20} />
                  <span>요약</span>
                </div>
                <button
                  className="btn-close-summary"
                  onClick={() => setShowSummary(false)}
                >
                  <X size={20} />
                </button>
              </div>
              <p className="summary-text">
                낡은 주택이나 건물을 새로 짓기 위한 재개발, 재건축 등의 절차를 정한 법입니다. 
                도시 환경을 개선하고 주거 생활의 질을 높이는 것을 목적으로 합니다.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* 3. 오른쪽 사이드바 (문서 작업 플로우) */}
      <aside className="sidebar sidebar-right">
        {/* 우측 상단 유저 프로필 */}
        <div className="user-profile-area">
          <div className="user-avatar">
            <User size={24} />
          </div>
        </div>

        {/* 플로우 섹션 */}
        <div className="section-title" style={{ fontSize: '18px', color: '#111827', marginBottom: '24px' }}>
          <FileText size={18} color="#3f4b92" style={{marginRight: '8px'}} />
          <span style={{fontWeight: '700'}}>문서 작업 가이드</span>
        </div>

        <ul className="flow-list">
          <li className="flow-step">
            <div className="flow-step-number">1</div>
            <div className="flow-step-body">
              <span className="flow-step-title">문서 업로드</span>
              <span className="flow-step-desc">PDF 또는 HWP 파일을 업로드하여 문서를 불러옵니다.</span>
            </div>
          </li>
          <li className="flow-connector" />
          <li className="flow-step">
            <div className="flow-step-number">2</div>
            <div className="flow-step-body">
              <span className="flow-step-title">난이도 분석</span>
              <span className="flow-step-desc">텍스트에서 어려운 행정·법률 용어를 AI가 자동으로 찾아냅니다.</span>
            </div>
          </li>
          <li className="flow-connector" />
          <li className="flow-step">
            <div className="flow-step-number">3</div>
            <div className="flow-step-body">
              <span className="flow-step-title">단어 확인</span>
              <span className="flow-step-desc">노란색으로 표시된 단어를 클릭하면 나무위키 각주처럼 설명이 나타납니다.</span>
            </div>
          </li>
          <li className="flow-connector" />
          <li className="flow-step">
            <div className="flow-step-number">4</div>
            <div className="flow-step-body">
              <span className="flow-step-title">요약 확인</span>
              <span className="flow-step-desc">문서 위의 요약 박스에서 핵심 내용을 빠르게 파악할 수 있습니다.</span>
            </div>
          </li>
        </ul>

        {/* 어려운 단어 통계 */}
        {difficultWords.length > 0 && (
          <div className="flow-stats">
            <div className="flow-stats-title">분석 결과</div>
            <div className="flow-stats-row">
              <span>발견된 어려운 단어</span>
              <strong>{difficultWords.length}개</strong>
            </div>
            <div className="flow-stats-row">
              <span>난이도 4 (매우 어려움)</span>
              <strong>{difficultWords.filter(w => w.level >= 4).length}개</strong>
            </div>
            <div className="flow-stats-row">
              <span>난이도 3 (어려움)</span>
              <strong>{difficultWords.filter(w => w.level === 3).length}개</strong>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}