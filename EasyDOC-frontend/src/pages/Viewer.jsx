import React, { useState } from "react";
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

export default function Viewer() {
    // 요약 박스 표시 여부 상태 (기본값: true)
    const [showSummary, setShowSummary] = useState(true);

    // 샘플 데이터
    const recentDocs = [
        {id: 1, title: '행정기본법.pdf', date: '2024.11.14'},
        {id: 2, title: '조세특례제한법.pdf', date: '2024.11.13'},
        {id: 3, title: '도시및주거환경지정비법.pdf', date: '2024.11.13'},
        {id: 4, title: '건축법시행령.pdf', date: '2024.11.12'},
    ];

    // 로컬 PDF 경로 (public 폴더 내에 파일이 있어야 함)
    const pdfUrl = "/sample.pdf";

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
        <button className="btn-upload">
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
          {/* iframe을 통한 PDF 뷰어 */}
          <iframe
            src={pdfUrl}
            className="pdf-frame"
            title="Document Viewer"
          />

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