/**
 * ============================================
 * MyPage.jsx - 마이페이지 통합 컴포넌트
 * ============================================
 * 
 * 사이드바에사 순서대로...
 * 1. 프로필 정보 조회 및 통계 표시
 * 2. 언어 능력 단계 설정 (문서 변환 난이도 조절)
 * 3. 변환 이력 관리 및 검색
 * 4. 계정 설정 (준비 중)
 * 
 * 일단 각 페이지는 컴포넌트별로 따로 관리됨
 * 각 컴포넌트는 이 파일 하단에 정의되어 있음
 * 실제 운영 시에는 백엔드 API에서 사용자 정보 fetch 필요, 언어 레벨도 실시간 저장 필요.
 * 
 */

import React, { useState } from "react";
import "./mypage.css";

/**
 * 문서 아이콘 - 로고 및 문서 표시용
 */
function DocumentIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="16" y="12" width="54" height="68" rx="6" stroke="#111827" strokeWidth="3" />
      <rect x="28" y="22" width="54" height="68" rx="6" fill="#FFFFFF" stroke="#111827" strokeWidth="3" />
      <rect x="38" y="34" width="16" height="12" rx="2" stroke="#111827" strokeWidth="3" />
      <line x1="38" y1="54" x2="74" y2="54" stroke="#111827" strokeWidth="3" />
      <line x1="38" y1="62" x2="74" y2="62" stroke="#111827" strokeWidth="3" />
      <line x1="38" y1="70" x2="66" y2="70" stroke="#111827" strokeWidth="3" />
    </svg>
  );
}

// ============================================
// 사이드바 네비게이션 아이콘들
// ============================================
// active prop에 따라 색상이 동적으로 변경됨
// 활성화 시: #3b82f6 (파란색), 비활성화 시: #6b7280 (회색)

/**
 * 프로필 아이콘
 * 메뉴: 프로필 정보
 */
function ProfileIcon({ active }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "#3b82f6" : "#6b7280"} strokeWidth="1.5">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" strokeLinecap="round" />
    </svg>
  );
}

/**
 * 언어/번역 아이콘
 * 메뉴: 언어 능력 설정
 */
function LanguageIcon({ active }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "#3b82f6" : "#6b7280"} strokeWidth="1.5">
      <path d="M12 3v3M8 6l1 3M16 6l-1 3" strokeLinecap="round" />
      <path d="M5 9h14" strokeLinecap="round" />
      <path d="M7 9l3 12M17 9l-3 12" strokeLinecap="round" />
      <path d="M9 21h6" strokeLinecap="round" />
    </svg>
  );
}

/**
 * 히스토리/시계 아이콘
 * 메뉴: 변환 이력
 */
function HistoryIcon({ active }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "#3b82f6" : "#6b7280"} strokeWidth="1.5">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * 설정 아이콘
 * 메뉴: 계정 설정 (준비 중)
 */
function SettingsIcon({ active }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "#3b82f6" : "#6b7280"} strokeWidth="1.5">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" strokeLinecap="round" />
    </svg>
  );
}
// ============================================

/**
 * 문서 통계 아이콘
 * 표시 정보: 총 변환한 문서 개수
 */
function DocStatsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <line x1="8" y1="6" x2="16" y2="6" />
      <line x1="8" y1="10" x2="16" y2="10" />
      <line x1="8" y1="14" x2="12" y2="14" />
    </svg>
  );
}

/**
 * 페이지 통계 아이콘
 * 표시 정보: 누적 변환 페이지 수 (천 단위 구분 쉼표 적용)
 */
function PageStatsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="7" y1="8" x2="17" y2="8" />
      <line x1="7" y1="12" x2="17" y2="12" />
      <line x1="7" y1="16" x2="13" y2="16" />
    </svg>
  );
}

/**
 * 단어 학습 통계 아이콘
 * 표시 정보: 사용자가 학습한 전문 용어 개수
 */
function WordStatsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.5">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8M12 8v8" strokeLinecap="round" />
    </svg>
  );
}

// ============================================
// 프로필 정보 컴포넌트
// ============================================
/**
 * ProfileContent - 사용자 프로필 및 통계 정보 표시
 * 
 * @param {Object} userData - 사용자 정보 객체
 * @param {string} userData.name - 사용자 이름
 * @param {string} userData.email - 이메일 주소
 * @param {string} userData.joinDate - 가입 날짜
 * @param {Object} userData.stats - 통계 정보
 * @param {number} userData.stats.documents - 변환한 문서 수
 * @param {number} userData.stats.pages - 변환한 페이지 수
 * @param {number} userData.stats.words - 학습한 용어 수
 * 
 * 차후 편집 가능 기능 추가해야 함
 */
function ProfileContent({ userData }) {
  return (
    <>
      {/* 통계 카드 행 - 3개의 카드를 그리드화 */}
      <div className="stats-row">
        <div className="stat-card">
          <DocStatsIcon />
          <div className="stat-info">
            <span className="stat-label">변환한 문서</span>
            <span className="stat-value">{userData.stats.documents}</span>
          </div>
        </div>
        <div className="stat-card">
          <PageStatsIcon />
          <div className="stat-info">
            <span className="stat-label">변환한 페이지</span>
            <span className="stat-value">{userData.stats.pages.toLocaleString()}</span>
          </div>
        </div>
        <div className="stat-card">
          <WordStatsIcon />
          <div className="stat-info">
            <span className="stat-label">용어 학습</span>
            <span className="stat-value">{userData.stats.words}</span>
          </div>
        </div>
      </div>

      {/* 프로필 정보 섹션 */}
      <section className="profile-section">
        <h2 className="section-title">프로필 정보</h2>

        <div className="profile-form">
          <div className="form-group">
            <label className="form-label">이름</label>
            <div className="form-value">{userData.name}</div>
          </div>

          <div className="form-group">
            <label className="form-label">이메일</label>
            <div className="form-value">{userData.email}</div>
          </div>

          <div className="form-group">
            <label className="form-label">가입일</label>
            <div className="form-value">{userData.joinDate}</div>
          </div>
        </div>
      </section>
    </>
  );
}

// ============================================
// 언어 능력 설정 컴포넌트
// ============================================
/**
 * LanguageSettingsContent - 사용자 언어 난이도 레벨 설정
 * 
 * 【핵심 기능】
 * 문서 변환 시 사용할 언어 난이도를 4단계로 조절
 * - 1단계: 초등학생 수준 (가장 쉬운 단어)
 * - 2단계: 중학생 수준 (쉬운 단어)
 * - 3단계: 고등학생 수준 (보통 단어) - 기본값
 * - 4단계: 대학생 이상 (매우 어려운 단어만 변환)
 * 
 * 【상태 관리】
 * - selectedLevel: 현재 선택된 레벨 (1~4)
 * - 초기값: 3단계 (고등학생 수준)
 * 
 */
function LanguageSettingsContent() {
  // 현재 선택된 언어 난이도 레벨 (1~4)
  const [selectedLevel, setSelectedLevel] = useState(3);

  // 언어 난이도 레벨 정의

  const levels = [
    {
      id: 1,
      title: "1단계",
      subtitle: "가장 쉬운 단어",
      description: "초등학생 수준 - 모든 어려운 단어를 쉬운 말로 변환",
    },
    {
      id: 2,
      title: "2단계",
      subtitle: "쉬운 단어",
      description: "중학생 수준 - 대부분의 어려운 단어를 쉬운 말로 변환",
    },
    {
      id: 3,
      title: "3단계",
      subtitle: "보통 단어",
      description: "고등학생 수준 - 어려운 전문 용어와 한자어 중심 변환",
    },
    {
      id: 4,
      title: "4단계",
      subtitle: "매우 어려운 단어만",
      description: "대학생 이상 수준 - 정말 어려운 전문 용어만 변환",
    },
  ];

  // 현재 선택된 레벨 객체 찾기
  const currentLevel = levels.find((l) => l.id === selectedLevel);

  // 변환 예시 단어. 일단 픽스함.
  // 차후: 선택된 레벨에 따라 다른 예시 표시하도록 개선
  // 예시는 차후 회의때 한 번 생각해봐야 할 듯?
  const exampleWords = [
    { original: "불가항력", converted: "어쩔 수 없는 사정" },
    { original: "준용", converted: "비슷하게 적용" },
    { original: "소급", converted: "과거로 거슬러 적용" },
  ];
  // 나중에 백엔드에서 동적 예시도 갖고와야 하남..?
  return (
    <>
      {/* 현재 설정된 단계 */}
      <section className="current-level-card">
        <div className="current-level-left">
          <div className="current-level-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2">
              <path d="M12 3v3M8 6l1 3M16 6l-1 3" strokeLinecap="round" />
              <path d="M5 9h14" strokeLinecap="round" />
              <path d="M7 9l3 12M17 9l-3 12" strokeLinecap="round" />
              <path d="M9 21h6" strokeLinecap="round" />
            </svg>
          </div>
          <div className="current-level-info">
            <div className="current-level-header">
              <span className="current-level-label">현재 설정된 단계</span>
            </div>
            <div className="current-level-title">
              <span className="level-number">{selectedLevel}단계</span>
              <span className="level-dot">·</span>
              <span className="level-name">{currentLevel?.subtitle}</span>
            </div>
            <p className="current-level-desc">{currentLevel?.description}</p>
          </div>
        </div>

        <div className="current-level-right">
          <div className="example-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>변환 예시</span>
          </div>
          <div className="example-list">
            {exampleWords.map((word, idx) => (
              <div className="example-row" key={idx}>
                <span className="example-original">{word.original}</span>
                <span className="example-arrow">→</span>
                <span className="example-converted">{word.converted}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 언어 능력 단계 선택 */}
      <section className="level-selection-section">
        <h2 className="section-title">언어 능력 단계 선택</h2>
        <p className="section-subtitle">나에게 맞는 난이도를 선택해주세요</p>

        <div className="level-options">
          {levels.map((level) => (
            <button
              key={level.id}
              className={`level-option ${selectedLevel === level.id ? "level-option--active" : ""}`}
              onClick={() => setSelectedLevel(level.id)}
            >
              <div className={`level-badge ${selectedLevel === level.id ? "level-badge--active" : ""}`}>
                {level.id}
              </div>
              <div className="level-content">
                <div className="level-title-row">
                  <span className={`level-title ${selectedLevel === level.id ? "level-title--active" : ""}`}>
                    {level.title}
                  </span>
                  <span className="level-subtitle">{level.subtitle}</span>
                </div>
                <p className="level-description">{level.description}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* 도움말 */}
      <section className="help-section">
        <div className="help-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" strokeLinecap="round" />
            <circle cx="12" cy="17" r="0.5" fill="#f59e0b" />
          </svg>
        </div>
        <div className="help-content">
          <h3 className="help-title">어떤 단계를 선택해야 할까요?</h3>
          <ul className="help-list">
            <li><span className="help-highlight">1-2단계</span>는 일반 시민을 위한 공공문서나 복지 안내문에 적합해요</li>
            <li><span className="help-highlight">3단계</span>는 일부 전문 용어를 유지해야 하는 행정문서에 좋아요</li>
            <li><span className="help-highlight">4단계</span>는 법률 전문가나 학술 자료에 필요한 수준이에요</li>
          </ul>
        </div>
      </section>
    </>
  );
}

// ============================================
// 변환 이력 컴포넌트
// ============================================
/**
 * 과거 변환한 문서 이력 관리
 * 
 * 1. 문서 목록 표시 (이름, 레벨, 카테고리, 날짜, 페이지, 크기)
 * 2. 실시간 검색 필터링
 * 3. 문서 보기/다운로드 액션 버튼
 * 
 * 【상태 관리】
 * - searchQuery: 검색어 입력값
 * - documents: 문서 목록 (현재는 더미 데이터)
 * 
 * 
 *  백엔드 API 연동 후에 무한 스크롤, 일괄 작업, 정렬, 고급 필터링, 시각화, 미리보기...
 *  그 정도 생각할 수 있을 듯.
 */

function HistoryContent() {
  // 문서 검색어 상태
  const [searchQuery, setSearchQuery] = useState("");

  // ===== 더미 문서 데이터 =====
  // 실제 운영에서는 백엔드 API에서 fetch
  // 형식: { id, name, level, category, date, pages, size }
  // ISO 날짜 형식으로 바꿔야 하는데, 어떻게 하는지 모름

  const documents = [
    {
      id: 1,
      name: "행정기본법.pdf",
      level: 2, // 변환 시 사용한 난이도 (1~4)
      category: "법률", // 문서 카테고리 (차후: 태그 시스템으로 확장 가능)
      date: "2024년 11월 14일 14:32", // 차후: ISO 8601 형식으로 변경 ("2024-11-14T14:32:00Z")
      pages: 45, // 문서 페이지 수
      size: "2.4 MB", // 파일 크기
    },
    {
      id: 2,
      name: "도시재생법.pdf",
      level: 2,
      category: "법률",
      date: "2024년 11월 13일 16:45",
      pages: 32,
      size: "1.9 MB",
    },
    {
      id: 3,
      name: "도시재생구역지정안.pdf",
      level: 1,
      category: "행정",
      date: "2024년 11월 12일 15:41",
      pages: 67,
      size: "5.2 MB",
    },
    {
      id: 4,
      name: "주택법 시행령.pdf",
      level: 3,
      category: "법률",
      date: "2024년 11월 11일 11:26",
      pages: 54,
      size: "2.1 MB",
    },
    {
      id: 5,
      name: "환경영향평가서.pdf",
      level: 2,
      category: "환경",
      date: "2024년 11월 09일 18:11",
      pages: 156,
      size: "8.3 MB",
    },
    {
      id: 6,
      name: "국민건강보험법.pdf",
      level: 2,
      category: "법률",
      date: "2024년 11월 07일 20:56",
      pages: 89,
      size: "4.1 MB",
    },
    {
      id: 7,
      name: "지방자치법 개정안.pdf",
      level: 1,
      category: "법률",
      date: "2024년 11월 07일 20:56",
      pages: 89,
      size: "4.1 MB",
    },
  ];

  /**
   * 레벨별 배지 색상 매핑 함수
   * @param {number} level - 언어 난이도 레벨 (1~4)
   * @returns {Object} { bg: 배경색, text: 텍스트색 }
   * 
   * 색상 선택 기준:
   * - 1단계: 파란색 (쉬움, 친근함)
   * - 2단계: 초록색 (안전, 보통)
   * - 3단계: 노란색 (주의, 중간 난이도)
   * - 4단계: 빨간색 (경고, 높은 난이도)
   * 
   */
  const getLevelColor = (level) => {
    switch (level) {
      case 1: return { bg: "#dbeafe", text: "#1d4ed8" }; // blue-100 / blue-700
      case 2: return { bg: "#d1fae5", text: "#059669" }; // green-100 / green-600
      case 3: return { bg: "#fef3c7", text: "#d97706" }; // amber-100 / amber-600
      case 4: return { bg: "#fee2e2", text: "#dc2626" }; // red-100 / red-600
      default: return { bg: "#f3f4f6", text: "#6b7280" }; // gray-100 / gray-500
    }
  };

  // 검색어로 문서 필터링
  // 현재는 파일명만 검색.
  // 백엔드쪽 작업하고 나서야 필터링 관련 로직 생각해야 할 듯.
  const filteredDocs = documents.filter((doc) =>
    doc.name.toLowerCase().includes(searchQuery.toLowerCase())
    // 차후: doc.category 등도 포함하도록 확장
  );

  return (
    <>
      {/* 헤더 */}
      <div className="history-header">
        <h2 className="history-title">변환 이력</h2>
        <div className="history-filters">
          <button className="filter-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            기간
          </button>
          <button className="filter-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            필터
          </button>
        </div>
      </div>

      {/* 검색창 */}
      <div className="history-search">
        <input
          type="text"
          className="search-input"
          placeholder="문서 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>

      {/* 문서 목록 */}
      <div className="document-list">
        {filteredDocs.map((doc) => {
          const levelColor = getLevelColor(doc.level);
          return (
            <div className="document-item" key={doc.id}>
              <div className="document-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>

              <div className="document-info">
                <div className="document-name-row">
                  <span className="document-name">{doc.name}</span>
                  <span
                    className="document-level"
                    style={{ background: levelColor.bg, color: levelColor.text }}
                  >
                    {doc.level}단계
                  </span>
                  <span className="document-category">{doc.category}</span>
                </div>
                <div className="document-meta">
                  <span className="meta-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    {doc.date}
                  </span>
                  <span className="meta-divider">|</span>
                  <span className="meta-item">{doc.pages}페이지</span>
                  <span className="meta-divider">|</span>
                  <span className="meta-item">{doc.size}</span>
                </div>
              </div>

              <div className="document-actions">
                <button className="action-btn" title="보기">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
                <button className="action-btn" title="다운로드">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ============================================
// 메인 MyPage 컴포넌트
// ============================================
/**
 * MyPage
 * 
 * - 사이드바: 네비게이션 메뉴 (고정)
 * - 메인 콘텐츠: 선택된 메뉴에 따라 동적 렌더링
 * 
 * 【상태 관리】
 * - activeMenu: 현재 활성화된 메뉴 ID ("profile", "language", "history", "settings")
 * 
 * 【메뉴 구조】
 * 1. 프로필 정보 - ProfileContent
 * 2. 언어 능력 설정 - LanguageSettingsContent
 * 3. 변환 이력 - HistoryContent
 * 4. 계정 설정 - 미실장 (placeholder)
 * 
 * 【고찰】
 * 현재는 단순 조건부 렌더링 방식
 * 장점: 간단하고 직관적
 * 단점: 메뉴 전환 시 상태 초기화됨 (예: 검색어 사라짐)
 * 
 * 백엔드 구현 이후에나 리팩토링 생각해볼 수 있을 듯
 */

export default function MyPage() {
  // 현재 활성화된 메뉴 상태 (기본값: 프로필)
  const [activeMenu, setActiveMenu] = useState("profile");

  // ===== 더미 사용자 데이터 =====
  const userData = {
    name: "박영서",
    email: "pys010725@gmail.com",
    joinDate: "2024년 10월 15일",
    stats: {
      documents: 17,
      pages: 1248,
      words: 67,
    },
  };

  // 사이드바 메뉴 아이템 정의
  const menuItems = [
    { id: "profile", label: "프로필 정보", icon: ProfileIcon },
    { id: "language", label: "언어 능력 설정", icon: LanguageIcon },
    { id: "history", label: "변환 이력", icon: HistoryIcon },
    { id: "settings", label: "계정 설정", icon: SettingsIcon },
  ];

  /**
   * 선택된 메뉴에 따라 콘텐츠 컴포넌트 렌더링
   * 객체 매핑으로 간결화하는 게 좋을 것 같다는 듯.
   * 
   */
  const renderContent = () => {
    switch (activeMenu) {
      case "profile":
        return <ProfileContent userData={userData} />;
      case "language":
        return <LanguageSettingsContent />;
      case "history":
        return <HistoryContent />;
      case "settings":
        return <div className="placeholder-content">계정 설정 페이지 (준비 중)</div>;
      default:
        return <ProfileContent userData={userData} />;
    }
  };

  return (
    <div className="mypage">
      {/* ===== 사이드바 영역 ===== */}
      {/* 
        고정 너비 사이드바 (260px)
        모바일에서는 오버레이 써야 하나?
      */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <DocumentIcon />
          <h1 className="sidebar-title">
            <span className="title-easy">Easy</span>
            <span className="title-doc">DOC</span>
          </h1>
        </div>

        {/* 사용자 프로필 미니 카드 */}
        {/* 
          현재 로그인한 사용자 표시
          프로필 이미지 같은 건 추가할 수 있을 듯.
        */}
        <div className="sidebar-user">
          <div className="user-avatar">
            {/* 차후: 실제 프로필 이미지로 대체 */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 4-6 8-6s8 2 8 6" strokeLinecap="round" />
            </svg>
          </div>
          <span className="user-name">{userData.name}</span>
        </div>

        {/* 네비게이션 메뉴 */}
        {/* 
          구성요소는 동적으로 생성
          클릭 시 activeMenu 상태 변경
        */}
        <nav className="sidebar-nav">
          {menuItems.map((item) => {
            const Icon = item.icon; // 아이콘 컴포넌트 추출
            const isActive = activeMenu === item.id; // 현재 활성화 여부 확인
            return (
              <button
                key={item.id}
                className={`nav-item ${isActive ? "nav-item--active" : ""}`}
                onClick={() => setActiveMenu(item.id)}
              >
                <Icon active={isActive} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {   /* ===== 메인 콘텐츠 영역 ===== */}
      {/* 
        Flex 1로 남은 공간 모두 차지
        선택된 메뉴에 따라 동적으로 콘텐츠 렌더링
      */}
      <main className="main-content">
        {renderContent()}
        { }
      </main>
    </div>
  );
}