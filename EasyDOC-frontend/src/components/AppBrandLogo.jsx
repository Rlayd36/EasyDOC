import "./AppBrandLogo.css";

function BrandDocumentIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
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

/**
 * Upload / Viewer / MyPage 상단·좌측 브랜드 로고 (디자인·크기 통일)
 * @param {() => void} [onClick] — 없으면 버튼 대신 정적 영역으로 렌더
 */
export default function AppBrandLogo({ onClick, className = "" }) {
  const content = (
    <>
      <span className="app-brand-logo__icon">
        <BrandDocumentIcon />
      </span>
      <div className="app-brand-logo__title">
        <span className="app-brand-logo__easy">Easy</span>
        <span className="app-brand-logo__doc">DOC</span>
      </div>
    </>
  );

  const rootClass = `app-brand-logo ${className}`.trim();

  if (onClick) {
    return (
      <button type="button" className={rootClass} onClick={onClick} aria-label="업로드 화면으로 이동">
        {content}
      </button>
    );
  }

  return <div className={`${rootClass} app-brand-logo--static`}>{content}</div>;
}
