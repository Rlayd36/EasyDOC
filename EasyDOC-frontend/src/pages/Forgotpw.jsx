import React, { useState } from "react";
import "./Forgotpw.css";

const API_BASE = "http://localhost:8080/api/users";

export default function Forgotpw({ onBackToLogin }) {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 1단계: 이메일로 재설정 요청
  const onRequestReset = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.token) {
        setToken(data.token);
        setStep(2);
      } else {
        setError(
          typeof data === "string"
            ? data
            : "등록된 이메일이 없거나 요청을 처리할 수 없습니다.",
        );
      }
    } catch (err) {
      console.error("Error:", err);
      setError("서버 연결에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 2단계: 토큰 + 새 비밀번호로 재설정
  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("새 비밀번호가 일치하지 않습니다.");
      return;
    }
    if (newPassword.length < 8) {
      setError("비밀번호는 8자 이상 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        alert("비밀번호가 재설정되었습니다. 로그인해주세요.");
        onBackToLogin();
        return;
      }
      setError(
        typeof data === "string"
          ? data
          : "토큰이 유효하지 않거나 만료되었습니다.",
      );
      console.error("Error:", error);
    } catch (error) {
      console.error("Error:", error);
      // 서버는 처리했지만 응답을 못 받은 경우가 있으므로, 에러 대신 안내 후 로그인으로 이동
      alert(
        "처리가 완료되었을 수 있습니다. 새 비밀번호로 로그인을 시도해 보세요.",
      );
      onBackToLogin();
    } finally {
      setLoading(false);
    }
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

          {step === 1 && (
            <>
              <p className="forgotpw-desc">
                가입한 이메일을 입력하시면 재설정 절차를 안내합니다.
              </p>
              <form className="form" onSubmit={onRequestReset}>
                <div className="field">
                  <label className="label">Email</label>
                  <input
                    className="input"
                    type="email"
                    placeholder="가입한 이메일 주소"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                {error && <p className="forgotpw-error">{error}</p>}
                <button
                  className="btn btn-submit"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? "처리 중..." : "재설정 링크 받기"}
                </button>
              </form>
            </>
          )}

          {step === 2 && (
            <>
              <p className="forgotpw-desc">
                새 비밀번호를 입력해주세요. (토큰은 이미 확인되었습니다)
              </p>
              <form className="form" onSubmit={onSubmit}>
                <div className="field">
                  <label className="label">새 비밀번호</label>
                  <input
                    className="input"
                    type="password"
                    placeholder="새 비밀번호 (8자 이상)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={8}
                    required
                    disabled={loading}
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
                    minLength={8}
                    required
                    disabled={loading}
                  />
                </div>
                {error && <p className="forgotpw-error">{error}</p>}
                <button
                  className="btn btn-submit"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? "처리 중..." : "비밀번호 재설정"}
                </button>
              </form>
              <button
                type="button"
                className="link link-back"
                onClick={() => setStep(1)}
                style={{ marginTop: "0.5rem" }}
              >
                이메일 다시 입력
              </button>
            </>
          )}

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
