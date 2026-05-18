/**
 * ============================================
 * MyPage.jsx - 마이페이지 통합 컴포넌트
 * ============================================
 * 
 * 사이드바에사 순서대로...
 * 1. 프로필 정보 조회 및 통계 표시
 * 2. 변환 이력 관리 및 검색
 * 3. 계정 설정
 * 
 * 일단 각 페이지는 컴포넌트별로 따로 관리됨
 * 각 컴포넌트는 이 파일 하단에 정의되어 있음
 * 실제 운영 시에는 백엔드 API에서 사용자 정보 fetch 필요.
 * 
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import axios from "axios"; 
import Viewer from "./Viewer";
import Loading from "./Loading";
import AppBrandLogo from "../components/AppBrandLogo";
import { saveAppRoute, loadAppRoute } from "../utils/appRoute";
import { parseDocumentCreatedAt, formatDocumentDateTimeKo } from "../utils/documentDate";
import { aggregateTopCategories } from "../utils/docTypeLabels";
import "./mypage.css";

const PARSER_URL = "http://localhost:8000";
const DOCUMENT_API_URL = "http://localhost:8002";

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

/** 문서 유형 통계 아이콘 */
function DocTypeStatsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5">
      <rect x="4" y="4" width="6" height="16" rx="1" />
      <rect x="12" y="10" width="6" height="10" rx="1" />
      <rect x="12" y="4" width="6" height="4" rx="1" />
    </svg>
  );
}

/* 로그아웃 아이콘 */
function LogoutIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="16 17 21 12 16 7" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="21" y1="12" x2="9" y2="12" strokeLinecap="round" strokeLinejoin="round"/>
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
 * @param {Array<{categoryId: string, label: string, count: number}>} userData.stats.topCategories - 분야(category)별 상위 3개
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
        <div className="stat-card stat-card--doc-types">
          <DocTypeStatsIcon />
          <div className="stat-info">
            <span className="stat-label">분야 TOP 3</span>
            {userData.stats.topCategories?.length > 0 ? (
              <ul className="stat-type-list">
                {userData.stats.topCategories.map((item) => (
                  <li key={item.categoryId} className="stat-type-item">
                    <span className="stat-type-name" title={item.label}>
                      {item.label}
                    </span>
                    <span className="stat-type-count">{item.count}건</span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="stat-types-empty">아직 없음</span>
            )}
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
// 변환 이력 컴포넌트
// ============================================
/**
 * 과거 변환한 문서 이력 관리
 * 
 * 1. 문서 목록 표시 (이름, 형식 배지, 날짜, 페이지, 크기)
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

/** 파일명·MIME 기준 변환 이력 배지 (PDF / HWP / HWPX / 이미지) */
function getHistoryFileBadge(fileName, fileType) {
  const mime = (fileType || "").toLowerCase();
  const lower = String(fileName || "").trim().toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";

  if (ext === "pdf" || mime === "application/pdf") {
    return { label: "PDF", variant: "pdf" };
  }
  if (ext === "hwpx") {
    return { label: "HWPX", variant: "hwpx" };
  }
  if (ext === "hwp" || (mime.includes("hwp") && !mime.includes("hwpx"))) {
    return { label: "HWP", variant: "hwp" };
  }
  const imageExts = ["jpg", "jpeg", "png", "gif", "bmp", "webp", "tif", "tiff", "heic", "heif", "svg"];
  if (mime.startsWith("image/") || imageExts.includes(ext)) {
    return { label: "이미지", variant: "image" };
  }
  return { label: "기타", variant: "other" };
}

/** 변환일(로컬 기준)이 선택한 기간에 포함되는지 */
function docMatchesDatePeriod(createdAtMs, preset, customFrom, customTo) {
  if (preset === "all") return true;
  const t = createdAtMs;
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  if (preset === "today") return t >= startOfToday.getTime();
  if (preset === "7d") return t >= now - 7 * 24 * 60 * 60 * 1000;
  if (preset === "30d") return t >= now - 30 * 24 * 60 * 60 * 1000;
  if (preset === "month") {
    const d = new Date();
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    first.setHours(0, 0, 0, 0);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    return t >= first.getTime() && t <= last.getTime();
  }
  if (preset === "custom" && customFrom && customTo) {
    const from = new Date(customFrom);
    from.setHours(0, 0, 0, 0);
    const to = new Date(customTo);
    to.setHours(23, 59, 59, 999);
    return t >= from.getTime() && t <= to.getTime();
  }
  return true;
}

/** 검색 비교용: NFC로 맞추면 NFD 저장 파일명과 한글 IME 입력이 같은 글자로 매칭됨 */
function normalizeForHistorySearch(s) {
  return String(s ?? "")
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .toLowerCase();
}

/** 변환 이력: 파일명·형식 배지·날짜·페이지·용량 문자열에서 검색 (공백으로 여러 키워드 AND) */
function historyDocMatchesSearch(doc, rawQuery) {
  const q = normalizeForHistorySearch(rawQuery).trim();
  if (!q) return true;
  const haystack = normalizeForHistorySearch(
    [doc.name ?? "", doc.badgeLabel ?? "", doc.date ?? "", String(doc.pages ?? ""), String(doc.size ?? "")].join(" "),
  );
  const terms = q.split(/\s+/).filter(Boolean);
  return terms.every((term) => haystack.includes(term));
}

function HistoryContent({ onDocumentClick, userEmail }) {
  const periodWrapRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [documents, setDocuments] = useState([]);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [periodPreset, setPeriodPreset] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await axios.get(`http://localhost:8002/api/documents?user_email=${userEmail}`);

        const formattedDocs = response.data.map((doc) => {
          const d = parseDocumentCreatedAt(doc.created_at);
          const createdAtMs = d.getTime();
          const dateStr = formatDocumentDateTimeKo(doc.created_at);
          const badge = getHistoryFileBadge(doc.file_name, doc.file_type);

          return {
            id: doc.id,
            name: doc.file_name,
            createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : 0,
            badgeLabel: badge.label,
            badgeVariant: badge.variant,
            date: dateStr,
            pages: doc.page_count || "-",
            size: doc.file_size || "-",
          };
        });
        setDocuments(formattedDocs);
      } catch (error) {
        console.error("이력 로딩 실패: ", error);
      }
    };
    fetchHistory();
  }, [userEmail]);

  useEffect(() => {
    if (!periodOpen) return;
    const onDown = (e) => {
      if (periodWrapRef.current && !periodWrapRef.current.contains(e.target)) {
        setPeriodOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [periodOpen]);

  const applyCustomPeriod = () => {
    if (!customFrom || !customTo) {
      alert("시작일과 종료일을 모두 선택해 주세요.");
      return;
    }
    let from = customFrom;
    let to = customTo;
    if (new Date(from) > new Date(to)) {
      const swap = from;
      from = to;
      to = swap;
      setCustomFrom(from);
      setCustomTo(to);
    }
    setPeriodPreset("custom");
    setPeriodOpen(false);
  };

  const periodBtnSuffix = {
    all: null,
    today: "오늘",
    "7d": "7일",
    "30d": "30일",
    month: "이번 달",
    custom: "지정",
  }[periodPreset];

  // 파일 다운로드 처리 함수
  const handleDownload = async (e, docId, fileName) => {
    e.stopPropagation();

    try{
      const response = await axios.get(`http://localhost:8002/api/documents/${docId}`);
      const s3Url = response.data.s3_url;

      if (!s3Url) {
        alert("다운로드할 원본 파일이 존재하지 않습니다.");
        return;
      }

      let finalFileName = fileName;

      // S3 실제 경로는 .pdf가 포함되어 있는데, 원본 파일명이 .pdf로 끝나지 않는 경우 (이미지 파일인 경우)
      if (s3Url.toLowerCase().includes('.pdf') && !fileName.toLowerCase().endsWith('.pdf')) {
        // 기존 확장자를 떼어내고 .pdf를 붙여줍니다.
        const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
        finalFileName = `${nameWithoutExt}.pdf`;
      }

      // S3에서 파일을 받아와 내 컴퓨터에 저장
      const fileResponse = await fetch(s3Url);
      const blob = await fileResponse.blob();
      const downloadUrl = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = finalFileName;
      document.body.appendChild(link);
      link.click();

      link.remove();
      window.URL.revokeObjectURL(downloadUrl);

    } catch (error) {
      console.error("다운로드 실패:", error);
      alert("파일 다운로드 중 오류가 발생했습니다.");
    }
  };

  const filteredDocs = useMemo(() => {
    return documents.filter((doc) => {
      if (!historyDocMatchesSearch(doc, searchQuery)) return false;
      return docMatchesDatePeriod(doc.createdAtMs, periodPreset, customFrom, customTo);
    });
  }, [documents, searchQuery, periodPreset, customFrom, customTo]);

  return (
    <>
      {/* 헤더 */}
      <div className="history-header">
        <h2 className="history-title">변환 이력</h2>
        <div className="history-filters">
          <div className="history-filter-slot" ref={periodWrapRef}>
            <button
              type="button"
              className={`filter-btn ${periodPreset !== "all" ? "filter-btn--active" : ""}`}
              aria-expanded={periodOpen}
              onClick={() => setPeriodOpen((o) => !o)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {periodBtnSuffix ? `기간 · ${periodBtnSuffix}` : "기간"}
            </button>
            {periodOpen ? (
              <div className="history-period-panel" role="dialog" aria-label="기간 선택">
                <div className="history-period-presets">
                  <button
                    type="button"
                    className="period-chip"
                    onClick={() => {
                      setPeriodPreset("all");
                      setCustomFrom("");
                      setCustomTo("");
                      setPeriodOpen(false);
                    }}
                  >
                    전체
                  </button>
                  <button
                    type="button"
                    className="period-chip"
                    onClick={() => {
                      setPeriodPreset("today");
                      setCustomFrom("");
                      setCustomTo("");
                      setPeriodOpen(false);
                    }}
                  >
                    오늘
                  </button>
                  <button
                    type="button"
                    className="period-chip"
                    onClick={() => {
                      setPeriodPreset("7d");
                      setCustomFrom("");
                      setCustomTo("");
                      setPeriodOpen(false);
                    }}
                  >
                    최근 7일
                  </button>
                  <button
                    type="button"
                    className="period-chip"
                    onClick={() => {
                      setPeriodPreset("30d");
                      setCustomFrom("");
                      setCustomTo("");
                      setPeriodOpen(false);
                    }}
                  >
                    최근 30일
                  </button>
                  <button
                    type="button"
                    className="period-chip"
                    onClick={() => {
                      setPeriodPreset("month");
                      setCustomFrom("");
                      setCustomTo("");
                      setPeriodOpen(false);
                    }}
                  >
                    이번 달
                  </button>
                </div>
                <div className="history-period-custom">
                  <span className="history-period-custom-label">직접 지정</span>
                  <div className="history-period-custom-row">
                    <input
                      type="date"
                      className="period-date-input"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      aria-label="시작일"
                    />
                    <span className="period-date-tilde">~</span>
                    <input
                      type="date"
                      className="period-date-input"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      aria-label="종료일"
                    />
                    <button type="button" className="period-apply-btn" onClick={applyCustomPeriod}>
                      적용
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <button type="button" className="filter-btn">
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
          type="search"
          className="search-input"
          placeholder="파일명, 형식(PDF 등), 날짜, 용량으로 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onCompositionEnd={(e) => setSearchQuery(e.currentTarget.value)}
          aria-label="문서 검색"
          autoComplete="off"
        />
        <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" aria-hidden>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>

      {/* 문서 목록 */}
      <div className="document-list">
        {filteredDocs.length === 0 ? (
          <div className="history-empty" role="status">
            {documents.length === 0
              ? "아직 변환된 문서가 없습니다."
              : "검색어 또는 기간 조건에 맞는 문서가 없습니다."}
          </div>
        ) : null}
        {filteredDocs.map((doc) => (
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
                  className={`document-type-badge document-type-badge--${doc.badgeVariant}`}
                >
                  {doc.badgeLabel}
                </span>
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
              <button
                className="action-btn"
                title="보기"
                onClick={() => onDocumentClick(doc.id)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
              <button
                className="action-btn"
                title="다운로드"
                onClick={(e) => handleDownload(e, doc.id, doc.name)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
// ============================================
// 계정 설정 컴포넌트
// ============================================
function SettingsContent({userEmail,onLogout}) {
  const [pwForm, setPwForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword:""
  });

  const handlePwChange = (e) => {
    const { name, value } = e.target;
    setPwForm((prev) => ({ ...prev, [name]: value }));
  };

  //비밀번호 변경
  const handleSubmitPassword = async () => {
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      alert("새 비밀번호가 일치하지 않습니다.");
      return;
    }
    if (pwForm.newPassword.length < 8) {
      alert("비밀번호는 8자 이상이어야 합니다.");
      return;
    }

    try {
      const response = await fetch("http://localhost:8080/api/users/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json","Authorization":`Bearer ${localStorage.getItem("token")}`
      },
        body: JSON.stringify({
          email: userEmail,
          currentPassword: pwForm.currentPassword,
          newPassword: pwForm.newPassword,
        }),
      });

      if (response.ok) {
        alert("비밀번호가 변경되었습니다. 다시 로그인해주세요.");
        onLogout();
      } else {
        const msg = await response.text();
        alert("변경 실패: " + msg);
      }
    } catch (error) {
      console.error(error);
      alert("서버 오류가 발생했습니다.");
    }
  };

  //계정 삭제
  const handleDeleteAccount = async () => {
    if (!window.confirm("정말로 계정을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:8080/api/users/delete?email=${userEmail}`, {
        method: "DELETE",
        headers:{
          "Authorization":`Bearer ${localStorage.getItem("token")}`
        }
      });

      if (response.ok) {
        alert("계정이 삭제되었습니다.");
        onLogout();
      } else {
        const msg = await response.text();
        alert("삭제 실패: " + msg);
      }
    } catch (error) {
      console.error(error);
      alert("서버 오류가 발생했습니다.");
    }
  };

  return (
    <>
      {/* 비밀번호 변경 */}
      <section className="settings-section">
        <h2 className="section-title">비밀번호 변경</h2>
        <div className="settings-form">
          <div className="form-group">
            <label className="form-label">현재 비밀번호</label>
            <input
              type="password"
              name="currentPassword"
              className="form-input" 
              placeholder="현재 비밀번호 입력"
              value={pwForm.currentPassword}
              onChange={handlePwChange} 
            />
          </div>
          <div className="form-group">
            <label className="form-label">새 비밀번호</label>
            <input
              type="password"
              name="newPassword" 
              className="form-input" 
              placeholder="새 비밀번호 입력"
              value={pwForm.newPassword}
              onChange={handlePwChange}
            />
          </div>
          <div className="form-group">
            <label className="form-label">새 비밀번호 확인</label>
            <input 
              type="password"
              name="confirmPassword" 
              className="form-input" 
              placeholder="새 비밀번호 다시 입력"
              value={pwForm.confirmPassword}
              onChange={handlePwChange}
            />
          </div>
          <button className="btn-primary" onClick={handleSubmitPassword}>
            비밀번호 변경
          </button>
        </div>
      </section>

      {/* 계정 삭제 */}
      <section className="settings-section settings-section--danger">
        <h2 className="section-title section-title--danger">계정 삭제</h2>
        <p className="danger-desc">
          계정을 삭제하면 모든 데이터가 영구적으로 삭제되며 복구할 수 없습니다.
        </p>
        <button className="btn-danger" onClick={handleDeleteAccount}>
          계정 삭제
        </button>
      </section>
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
 * - activeMenu: 현재 활성화된 메뉴 ID ("profile", "history", "settings")
 * 
 * 【메뉴 구조】
 * 1. 프로필 정보 - ProfileContent
 * 2. 변환 이력 - HistoryContent
 * 3. 계정 설정 - SettingsContent
 * 
 * 【고찰】
 * 현재는 단순 조건부 렌더링 방식
 * 장점: 간단하고 직관적
 * 단점: 메뉴 전환 시 상태 초기화됨 (예: 검색어 사라짐)
 * 
 * 백엔드 구현 이후에나 리팩토링 생각해볼 수 있을 듯
 */

export default function MyPage({userEmail,onLogout,onNavigateToUpload}) {
  const [routeSnapshot] = useState(() => loadAppRoute());
  const [routeHydrated, setRouteHydrated] = useState(false);

  // 현재 활성화된 메뉴 상태 (기본값: 프로필)
  const [activeMenu, setActiveMenu] = useState("profile");
  
  const [showViewer, setShowViewer] = useState(false);
  const [showLoading, setShowLoading] = useState(false);
  const [viewerData, setViewerData] = useState({ parseResult: null, ocrResult: null, pdfFileUrl: null });

  const applyDocumentToViewer = async (docId) => {
    const response = await axios.get(`http://localhost:8002/api/documents/${docId}`);
    const docData = response.data;
    setViewerData({
      parseResult: {
        id: docData.id,
        filename: docData.file_name,
        text: docData.text,
        difficult_words: docData.difficult_words
      },
      ocrResult: null,
      pdfFileUrl: docData.s3_url || null
    });
    setShowViewer(true);
  };

  /** 새로고침 시 마이페이지 + 사이드 메뉴 + 뷰어(문서 id 있을 때) 복원 */
  useEffect(() => {
    const route = routeSnapshot;
    if (!route || route.page !== "mypage") {
      setRouteHydrated(true);
      return;
    }
    if (route.activeMenu) {
      setActiveMenu(route.activeMenu === "language" ? "profile" : route.activeMenu);
    }
    if (route.viewerDocId == null) {
      setRouteHydrated(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setShowLoading(true);
        await applyDocumentToViewer(route.viewerDocId);
      } catch (error) {
        console.error("뷰어 복원 실패:", error);
        saveAppRoute({
          page: "mypage",
          activeMenu: route.activeMenu || "profile",
          viewerDocId: null,
        });
      } finally {
        if (!cancelled) {
          setShowLoading(false);
          setRouteHydrated(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routeSnapshot]);

  useEffect(() => {
    if (!routeHydrated) return;
    saveAppRoute({
      page: "mypage",
      activeMenu,
      viewerDocId:
        showViewer && viewerData.parseResult?.id != null ? viewerData.parseResult.id : null,
    });
  }, [routeHydrated, showViewer, activeMenu, viewerData.parseResult?.id]);

  const handleDocumentClick = async (docId) => {
    try {
      setShowLoading(true);
      await applyDocumentToViewer(docId);
      setShowLoading(false);
    } catch (error) {
      console.error("문서 상세 로딩 실패:", error);
      alert("문서를 불러올 수 없습니다.");
      setShowLoading(false);
    }
  };

  // ===== 더미 사용자 데이터 =====
  const [userData,setUserData]=useState({
    name: " ",
    email: userEmail,
    joinDate: "",
    stats: { documents: 0, pages: 0, topCategories: [] },
  });

  React.useEffect(() => {
    if(userEmail){
      const token=localStorage.getItem("token");
      fetch(`http://localhost:8080/api/users/info?email=${userEmail}`,{
        method:"GET",
        headers:{
          "Authorization":`Bearer ${token}`,
          "Content-Type":"application/json"
        }
      })
        .then(async res => {
           if(!res.ok)
           {
              const errorText=await res.text();
              throw new Error(`서버 에러(${res.status}): ${errorText}`);
           }
           return res.json();
        })
        .then(data => {
          //날짜 포맷팅
          const formattedDate = data.joinDate 
            ? new Date(data.joinDate).toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })
            : "정보 없음";

          setUserData(prev => ({
            ...prev,
            name: data.name||"이름 없음",
            email: data.email,
            joinDate: formattedDate,
            stats:prev.stats //추후 수정예정
          }));
        })
        .catch(err => {
          console.error("정보 로딩 실패:", err);
        });

      Promise.all([
        axios.get(`${DOCUMENT_API_URL}/api/documents/stats`, {
          params: { user_email: userEmail },
        }),
        axios.get(`${PARSER_URL}/document-types`),
      ])
        .then(([statsRes, typesRes]) => {
          const topCategories = aggregateTopCategories(
            statsRes.data?.type_counts,
            typesRes.data,
            3,
          );

          setUserData((prev) => ({
            ...prev,
            stats: {
              documents: statsRes.data?.documents ?? 0,
              pages: statsRes.data?.pages ?? 0,
              topCategories,
            },
          }));
        })
        .catch((error) => {
          console.error("통계 정보 로딩 실패:", error);
        });
    }
  }, [userEmail]);

  //사이드바 메뉴 아이템 정의
  const menuItems = [
    { id: "profile", label: "프로필 정보", icon: ProfileIcon },
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
      case "history":
        return <HistoryContent onDocumentClick={handleDocumentClick} userEmail={userEmail} />;
      case "settings":
        return <SettingsContent userEmail={userEmail} onLogout={onLogout}/>;
      default:
        return <ProfileContent userData={userData} />;
    }
  };

  // 로딩 & 뷰어 화면 렌더링 추가
  if (showLoading) {
    return <Loading title="문서 불러오는 중" subtitle="잠시만 기다려주세요" />;
  }

  if (showViewer) {
    return (
      <Viewer 
        parsedData={viewerData.parseResult} 
        ocrData={viewerData.ocrResult} 
        pdfFileUrl={viewerData.pdfFileUrl} 
        userEmail={userEmail}
        onLogoClick={() => {
          setShowViewer(false);
          setViewerData({ parseResult: null, ocrResult: null, pdfFileUrl: null });
          onNavigateToUpload();
        }}
      />
    );
  }

return (
    <div className="mypage">
      {/* ===== 사이드바 영역 ===== */}
      {/* 고정 너비 사이드바 (260px)
        모바일에서는 오버레이 써야 하나?
      */}
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-logo">
            <AppBrandLogo onClick={onNavigateToUpload} />
          </div>

          {/* 사용자 프로필 미니 카드 */}
          {/* 현재 로그인한 사용자 표시
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
          {/* 구성요소는 동적으로 생성
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
        </div>

        {/*하단 로그아웃 버튼 */}
        <div className="sidebar-footer">
          <button className="logout-btn" onClick={onLogout}>
            <LogoutIcon />
            <span>로그아웃</span>
          </button>
        </div>
      </aside>

      {   /* ===== 메인 콘텐츠 영역 ===== */}
      {/* Flex 1로 남은 공간 모두 차지
        선택된 메뉴에 따라 동적으로 콘텐츠 렌더링
      */}
      <main className="main-content">
        {renderContent()}
      </main>
    </div>
  );
}