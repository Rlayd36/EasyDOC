import React, { useState, useRef, useEffect } from "react";
import axios from "axios"; 
import { Upload, Clock, FileText, Settings, X, User, BookOpen, ChevronRight, Lightbulb } from 'lucide-react';
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

export default function Viewer({ parsedData, ocrData }) {
    // ================= 상태 관리 =================
    // 1. UI 관련 상태
    const [showSummary, setShowSummary] = useState(true); // 요약 박스 표시 여부 상태 (기본값: true)
    const [pdfUrl, setPdfUrl] = useState("/sample.pdf");  // 현재 보고 있는 PDF 경로 상태 (기본값: 샘플)

    // 2. 데이터 관련 상태 (백엔드 연동)
    const [documents, setDocuments] = useState([]);       // 사이드바 문서 목록
    const [selectedDoc, setSelectedDoc] = useState(null); // 현재 선택된 문서 상세 정보
    const [loading, setIsLoading] = useState(false);        // 로딩 상태

    // 3. 파일 업로드 관련 Refs
    const fileInputRef = useRef(null);
    const API_GATEWAY_URL = "https://28d37e8xg3.execute-api.ap-northeast-2.amazonaws.com/upload-url"; // AWS API Gateway 주소

    // ================= API 연동 =================
    // 1. 화면이 켜지면 DB에서 문서 목록 가져오기
    useEffect(() => {
      fetchDocuments();
    }, []);

    const fetchDocuments = async () => {
        try {
            const response = await axios.get('http://localhost:8001/api/documents');
            setDocuments(response.data);
        } catch (error) {
            console.error("문서 목록 로딩 실패:", error);
        }
    };

    // 2. 사이드바에서 문서 클릭 시 상세 내용 가져오기
    const handleDocClick = async (id) => {
        try {
            setIsLoading(true);
            const response = await axios.get(`http://localhost:8001/api/documents/${id}`);
            setSelectedDoc(response.data); // 선택된 문서 상태 업데이트
            setPdfUrl(null); // 텍스트를 보여주기 위해 PDF 뷰어는 숨김 처리
        } catch (error) {
            console.error("문서 상세 로딩 실패:", error);
            alert("문서 내용을 불러올 수 없습니다.");
        } finally {
            setIsLoading(false);
        }
    };

    // 3. 파일 선택 버튼 핸들러
    const handleUploadBtnClick = () => {
      console.log("버튼 클릭됨! fileInputRef 상태:", fileInputRef.current); //디버깅용
      fileInputRef.current?.click();
    };
    
// 4. 파일 업로드 및 처리 로직
const handleFileChange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const objectUrl = URL.createObjectURL(file);
  setPdfUrl(objectUrl);
  setSelectedDoc(null); // 기존 선택된 텍스트 초기화
  setIsLoading(true);   // 로딩 시작

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
    let resultData = null;
    if (file.type.startsWith("image/")) {
      // 파일이 이미지일 때 -> OCR 서버 (8001번) 요청
      console.log("5. OCR 서버에 분석 요청...");
      const response = await axios.get(
        `http://localhost:8001/ocr/s3/${encodeURIComponent(file.name)}`
      );
      console.log("6. OCR 결과 도착!", response.data);
      resultData = response.data;
      } else {

      // 파일이 문서일 때 -> 파싱 서버 (8000번) 요청
      // 👇 파싱 요청 추가
      console.log("5. 파싱 요청 중...");
      const response = await axios.get(
        `http://localhost:8000/parse/s3/${encodeURIComponent(file.name)}`
      );
      console.log("6. 파싱 완료!", response.data);
      resultData = response.data;
    }

    // 결과 표시
    // 백엔드에서 받은 {id, text} 형식을 selectedDoc 상태에 맞춰서 넣음
    setSelectedDoc({
      id: resultData.id,
      file_name: file.name,
      text: resultData.text
    });

    // 목록 새로고침 (방금 올린 파일을 최근 문서 목록에 등록)
    fetchDocuments();

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

        {/* 최근 문서 목록 (DB 데이터 연동 수정) */}
        <div className="recent-section">
          <div className="section-title">
            <Clock size={16} />
            <span>최근 문서</span>
          </div>
          <ul className="doc-list">
            {documents.map((doc) => (
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

        {/*힌트 배너 */}
        <div className="hint-banner">
          <Lightbulb size={18} className="text-yellow-500" color="#f49e0b" />
          <span>
            <span className="hint-highlight">노란색 단어</span>를 눌러보세요
          </span>
        </div>

         <div className="pdf-container">
          {/* 텍스트가 있으면 표시, 없으면 PDF 표시 */}
          {selectedDoc ? (
            <div className="parsed-content">
              <pre>{selectedDoc.text}</pre>
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

      {/* 3. 오른쪽 사이드바 (설명문) */}
      <aside className="sidebar sidebar-right">
        {/* 우측 상단 유저 프로필 */}
        <div className="user-profile-area">
          <div className="user-avatar">
            <User size={24} />
          </div>
        </div>

        {/* 설명문 섹션 */}
        <div className="section-title" style={{ fontSize: '18px', color: '#111827', marginBottom: '24px' }}>
          <FileText size={18} color="#3f4b92" style={{marginRight: '8px'}} />
          <span style={{fontWeight: '700'}}>설명문</span>
        </div>

        <ul className="explanation-list">
          <li>
            <span className="step-num">1.</span>
            <span>(단계화된 설명) 문서의 주요 정의를 확인하세요.</span>
          </li>
          <li>
            <span className="step-num">2.</span>
            <span>관리처분계획이란 분양 설계 및 권리 배분 계획입니다.</span>
          </li>
          <li>
            <span className="step-num">3.</span>
            <span>조합 설립 인가 절차를 확인해야 합니다.</span>
          </li>
        </ul>
      </aside>
    </div>
  );
}