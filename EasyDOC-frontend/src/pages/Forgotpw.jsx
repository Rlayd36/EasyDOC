import React, { useState } from "react";
import "./Forgotpw.css";

export default function Forgotpw({ onBackToLogin }) {
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const onSubmit = (e) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("새 비밀번호가 일치하지 않습니다.");
      return;
    }

    if (newPassword.length < 6) {
      setError("비밀번호는 6자 이상 입력해주세요.");
      return;
    }

    // TODO: 비밀번호 재설정 API 연동
    console.log("비밀번호 재설정:", { email, newPassword });
  };

  return (
    <div className="forgotpw-page">
      <div className="forgotpw-wrap">
        <div className="brand">
          <div className="brand-icon" aria-hidden="true">
            <DocumentIcon />
          </div>
          <h1 className="brand-title">
            <span className="brand-easy">Easy</span>
            <span className="brand-doc">DOC</span>
          </h1>
        </div>

        <div className="forgotpw-card">
          <h2 className="forgotpw-title">비밀번호 재설정</h2>
          <p className="forgotpw-desc">
            가입한 이메일과 새 비밀번호를 입력해주세요.
          </p>

          <form className="form" onSubmit={onSubmit}>
            <div className="field">
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                placeholder="가입한 이메일 주소"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label className="label">새 비밀번호</label>
              <input
                className="input"
                type="password"
                placeholder="새 비밀번호 (6자 이상)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>

            <div className="field">
              <label className="label">새 비밀번호 확인</label>
              <input
                className="input"
                type="password"
                placeholder="새 비밀번호 다시 입력"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>

            {error && <p className="forgotpw-error">{error}</p>}

            <button className="btn btn-submit" type="submit">
              비밀번호 재설정
            </button>
          </form>

          <button
            type="button"
            className="link link-back"
            onClick={onBackToLogin}
          >
            로그인으로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}

function DocumentIcon() {
  return (
    <svg
      width="88"
      height="88"
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="16"
        y="12"
        width="54"
        height="68"
        rx="6"
        stroke="#111827"
        strokeWidth="3"
      />
      <rect
        x="28"
        y="22"
        width="54"
        height="68"
        rx="6"
        fill="#FFFFFF"
        stroke="#111827"
        strokeWidth="3"
      />
      <rect
        x="38"
        y="34"
        width="16"
        height="12"
        rx="2"
        stroke="#111827"
        strokeWidth="3"
      />
      <line x1="38" y1="54" x2="74" y2="54" stroke="#111827" strokeWidth="3" />
      <line x1="38" y1="62" x2="74" y2="62" stroke="#111827" strokeWidth="3" />
      <line x1="38" y1="70" x2="66" y2="70" stroke="#111827" strokeWidth="3" />
    </svg>
  );
}
