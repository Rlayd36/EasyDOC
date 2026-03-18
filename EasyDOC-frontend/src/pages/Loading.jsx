import React from "react";
import "./Loading.css";

export default function Loading({ title = "문서 분석 중", subtitle = "AI가 문서를 분석하고 있습니다" }) {
  return (
    <div className="loading-page">
      {/* 배경 장식 원 */}
      <div className="loading-bg-circle loading-bg-circle-1" />
      <div className="loading-bg-circle loading-bg-circle-2" />

      <div className="loading-content">
        {/* 스피너 */}
        <div className="loading-spinner-wrapper">
          <div className="loading-spinner">
            <div className="spinner-ring" />
            <div className="spinner-ring spinner-ring-inner" />
          </div>
        </div>

        {/* 텍스트 */}
        <p className="loading-text">{title}</p>
        <p className="loading-subtext">
          {subtitle}
        </p>

        {/* 점 애니메이션 */}
        <div className="loading-dots">
          <span className="dot dot-1" />
          <span className="dot dot-2" />
          <span className="dot dot-3" />
        </div>
      </div>
    </div>
  );
}
