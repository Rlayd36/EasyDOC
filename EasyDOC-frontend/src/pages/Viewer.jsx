import React, { useState, useRef, useEffect } from "react";
import axios from "axios"; 
import { Upload, Clock, FileText, Settings, X, User, BookOpen, ChevronRight, Lightbulb } from 'lucide-react';
import PdfHighlightViewer from "./PdfHighlightViewer";
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

export default function Viewer({ parsedData, ocrData, pdfFileUrl }) {
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

    // 난이도 분석 관련 상태
    const [difficultWords, setDifficultWords] = useState([]);
    const [parsedText, setParsedText] = useState("");
    const [ocrText, setOcrText] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    // docsinfos DB에서 최근 문서 목록 가져오기
    useEffect(() => {
      fetchDocuments();
    }, []);

    const fetchDocuments = async () => {
        try {
            const response = await axios.get('http://localhost:8001/api/documents');
            setRecentDocs(response.data);
        } catch (error) {
            console.error("문서 목록 로딩 실패:", error);
        }
    };

    // 사이드바에서 문서 클릭 시 상세 내용 가져오기
    const handleDocClick = async (id) => {
        try {
            setIsLoading(true);
            const response = await axios.get(`http://localhost:8001/api/documents/${id}`);

            const docData = response.data;

            setSelectedDoc(response.data); // 선택된 문서 상태 업데이트
            setPdfUrl(null); // PDF 뷰어에서 텍스트 모드로 전환

            // 가져온 텍스트를 뷰어 상태에 반영
            setParsedText(docData.text || "");
            setOcrText("");

            // DB에 저장된 difficultWords(어려운 단어 데이터) 호출
            setDifficultWords(docData.difficult_words || []);

            // 추후 DB에 저장된 difficultWords(어려운 단어 데이터)가 있다면 호출
            //setDifficultWords([]); // 현재는 빈 배열로 초기화 (이전 문서의 하이라이트 제거)

        } catch (error) {
            console.error("문서 상세 로딩 실패:", error);
            alert("문서 내용을 불러올 수 없습니다.");
        } finally {
            setIsLoading(false);
        }
    };
    
    // 뷰 모드 상태 ("parsed": 파싱된 문서, "original": 원본 문서)
    const [viewMode, setViewMode] = useState("parsed");

    // props로 받은 데이터를 상태에 반영 (Upload에서 넘어올 때)
    useEffect(() => {
        if (parsedData) {
            console.log("Viewer가 받은 parsedData:", parsedData);
            setParsedText(parsedData.text || "");
            setDifficultWords(parsedData.difficultWords || []);
            setOcrText("");  // 파싱 데이터가 있으면 OCR은 비움
        } else if (ocrData) {
            console.log("Viewer가 받은 ocrData:", ocrData);
            setOcrText(ocrData.text || ocrData || "");
            setParsedText("");  // OCR 데이터가 있으면 파싱은 비움
            setDifficultWords([]);
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
    
// 난이도 분석 함수
const analyzeText = async (text, docId = null) => {
  try {
    console.log("난이도 분석 요청 중...");
    const response = await axios.post("http://localhost:8000/analyze", {
      text: text,
      min_level: 3  // 3단계 이상만
    });
    console.log("난이도 분석 완료:", response.data);
    
    const difficultWords = response.data.difficult_words || [];

    // 모델 예측 단어 중 설명이 없는 단어들을 Gemini로 설명 생성
    const needExplanation = difficultWords.filter(
      w => w.source === "model" || !w.easy_expression
    );

    if (needExplanation.length > 0) {
      console.log("Gemini 설명 생성 요청 중...", needExplanation.length, "개");
      try {
        const explainResponse = await axios.post("http://localhost:8000/explain/batch", {
          words: needExplanation.map(w => ({ word: w.word }))
        });
        // 설명을 단어 목록에 병합
        const explanationMap = new Map();
        (explainResponse.data.results || []).forEach(r => {
          explanationMap.set(r.word, r.explanation);
        });
        difficultWords.forEach(w => {
          if (explanationMap.has(w.word)) {
            w.easy_expression = explanationMap.get(w.word);
          }
        });
        console.log("Gemini 설명 생성 완료!");
      } catch (explainErr) {
        console.error("Gemini 설명 생성 오류:", explainErr);
      }
    }

    setDifficultWords(difficultWords);

    // DB에 분석된 하이라이트 단어들 전송 및 저장
    if (docId) {
      try {
        await axios.put(`http://localhost:8001/api/documents/${docId}/words`, {
          difficult_words: difficultWords
        });
        console.log("DB에 하이라이트 단어 저장 완료!")
      } catch (dbErr) {
        console.error("DB 하이라이트 단어 저장 오류:", dbErr);
      }
    }

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
  setSelectedDoc(null); // 기존 선택된 텍스트 초기화
  // PDF 여부에 따라 렌더링 모드 결정
  const fileIsPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  setIsPdf(fileIsPdf);
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
    let resultData = null;  // 파싱 또는 OCR 결과를 DB에 넣기 위해 저장할 변수
    if (file.type.startsWith("image/")) {
      // 파일이 이미지일 때 -> OCR 서버 (8001번) 요청
      console.log("6. OCR 서버에 분석 요청...");
      const ocrResponse = await axios.get(
        `http://localhost:8001/ocr/s3/${encodeURIComponent(s3Key)}`
      );
      console.log("7. OCR 결과 도착!", ocrResponse.data);
      setOcrText(ocrResponse.data.text || ocrResponse.data);
      setParsedText("");  // 문서 파싱 결과는 비움
      resultData = ocrResponse.data;
    } else {
      // 파일이 문서일 때 -> 파싱 서버 (8000번) 요청
      console.log("6. 파싱 요청 중..., S3 키:", s3Key);
      const parseResponse = await axios.get(
        `http://localhost:8000/parse/s3/${encodeURIComponent(s3Key)}`
      );
      console.log("7. 파싱 완료!", parseResponse.data);
      const extractedText = parseResponse.data.text;
      setParsedText(extractedText);  // 파싱 결과 저장
      resultData = parseResponse.data;

      // 난이도 분석 추가
      await analyzeText(extractedText, resultData.id);
      //await analyzeText(extractedText);
      setOcrText("");  // OCR 결과는 비움
    }

    // 최근 문서 목록 업데이트
    // 백엔드에서 받은 {id, text} 형식을 selectedDoc 상태에 맞춰서 넣음
    setSelectedDoc({
      id: resultData.id,
      file_name: file.name,
      text: resultData.text
    });
    
    // 목록 새로고침 (방금 올린 파일을 최근 문서 목록에 등록)
    fetchDocuments();
    
    /*const newDoc = {
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
    setRecentDocs([newDoc, ...filteredDocs].slice(0, 10));*/

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

    // 날짜 형식 변환 함수 (2024-11-14 -> 2024.11.14)
    const formatDate = (dateString) => {
      if (!dateString) return "";
      return dateString.substring(0, 10).replace(/-/g, '.');
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
          
          {/* 힌트 배너 - 우측 */}
          {viewMode === 'parsed' && (
            <div className="hint-banner-right">
              <Lightbulb size={16} color="#f49e0b" />
              <span>
                <span className="hint-highlight">하이라이트된 단어</span>에 마우스를 대 보세요
              </span>
            </div>
          )}
        </div>

        {/* 색상 범례 - 파싱 모드일 때만 */}
        {viewMode === 'parsed' && (
        <div className="color-legend">
          <span className="legend-item">
            <span className="legend-box" style={{backgroundColor: '#dbeafe', color: '#1e40af'}}>1단계</span>
            <span className="legend-label">청색</span>
          </span>
          <span className="legend-item">
            <span className="legend-box" style={{backgroundColor: '#fef3c7', color: '#92400e'}}>2단계</span>
            <span className="legend-label">노란색</span>
          </span>
          <span className="legend-item">
            <span className="legend-box" style={{backgroundColor: '#fed7aa', color: '#9a3412'}}>3단계</span>
            <span className="legend-label">주황색</span>
          </span>
          <span className="legend-item">
            <span className="legend-box" style={{backgroundColor: '#fecaca', color: '#991b1b'}}>4단계</span>
            <span className="legend-label">적색</span>
          </span>
        </div>
        )}

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
            /* DOC 탭: 파싱된 텍스트 + 하이라이트 */
            <div className="parsed-content">
              {ocrText ? (
                <pre>{ocrText}</pre>
              ) : parsedText ? (
                <HighlightedText 
                  text={parsedText} 
                  difficultWords={difficultWords}
                />
              ) : (
                <div className="no-content">
                  <p>파일을 업로드하면 파싱된 문서가 여기에 표시됩니다.</p>
                </div>
              )}
            </div>
          ) : (
            /* 원본 탭: PDF 원본 이미지 + 하이라이트 오버레이 */
            isPdf && pdfUrl && pdfUrl !== "/sample.pdf" ? (
              <PdfHighlightViewer
                pdfUrl={pdfUrl}
                difficultWords={difficultWords}
              />
            ) : (
              <iframe
                src={pdfUrl}
                className="pdf-frame"
                title="Document Viewer"
              />
            )
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
              <span className="flow-step-desc">하이라이트된 단어에 마우스를 대면 나무위키 각주처럼 설명이 나타납니다.</span>
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