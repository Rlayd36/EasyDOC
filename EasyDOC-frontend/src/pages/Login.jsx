import React, { useState, useEffect } from "react";
import "./login.css";
import SignUp from "./SignUp";
import Upload from "./Upload";
import Forgotpw from "./Forgotpw";
import MyPage from "./MyPage";
import {
  loadPersistedSession,
  saveSession,
  clearSession,
  isJwtExpired,
  isIdleExpired,
  touchActivity,
} from "../utils/authSession";
import { saveAppRoute, loadAppRoute } from "../utils/appRoute";

export default function Login() {
  const [initialAuth] = useState(() => {
    const s = loadPersistedSession();
    if (!s) return { currentView: "login", userEmail: "" };
    const route = loadAppRoute();
    const page = route?.page === "mypage" ? "mypage" : "upload";
    return { currentView: page, userEmail: s.email };
  });
  const [currentView, setCurrentView] = useState(initialAuth.currentView);
  const [forgotUrlToken] = useState(
    () => new URLSearchParams(window.location.search).get("resetToken") || "",
  );
  const [showForgotPw, setShowForgotPw] = useState(
    () => !!new URLSearchParams(window.location.search).get("resetToken"),
  );
  const [userEmail, setUserEmail] = useState(initialAuth.userEmail);
  const [password, setPassword] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [loginError, setLoginError] = useState("");

  const goUpload = () => {
    saveAppRoute({ page: "upload", viewerDocId: null });
    setCurrentView("upload");
  };

  const goMyPage = () => {
    saveAppRoute({ page: "mypage", activeMenu: "profile", viewerDocId: null });
    setCurrentView("mypage");
  };

  /** JWT 만료·유휴(무입력) 만료 시 로그인 화면으로 (새로고침 유지와 균형) */
  useEffect(() => {
    if (currentView !== "upload" && currentView !== "mypage") return;

    const expireIfNeeded = () => {
      const token = localStorage.getItem("token");
      if (!token || isJwtExpired(token) || isIdleExpired()) {
        clearSession();
        setUserEmail("");
        setPassword("");
        setEmailInput("");
        setCurrentView("login");
      }
    };

    let lastBump = 0;
    const bumpActivity = () => {
      const now = Date.now();
      if (now - lastBump < 15_000) return;
      lastBump = now;
      touchActivity();
    };

    window.addEventListener("mousedown", bumpActivity);
    window.addEventListener("keydown", bumpActivity);
    const interval = setInterval(expireIfNeeded, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") expireIfNeeded();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("mousedown", bumpActivity);
      window.removeEventListener("keydown", bumpActivity);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [currentView]);

  //화면 렌더링
  const renderView = () => {
    switch (currentView) {
      case "upload":
        return (
          <Upload 
            onNavigateToMyPage={goMyPage}
            onNavigateToUpload={goUpload}
            userEmail={userEmail}
          />
        );
      case "mypage":
        return (
          <MyPage 
            userEmail={userEmail}
            onNavigateToUpload={goUpload}
            onLogout={handleLogout}
          />
        );
      case "signup":
        return <SignUp onBack={() => setCurrentView("login")} />;
      case "login":
      default:
        return null;
    }
  };

  //로그아웃
  const handleLogout = () => {
    clearSession();
    setUserEmail("");
    setPassword("");
    setEmailInput("");
    setCurrentView("login");
    alert("로그아웃 되었습니다.");
  };

  const onSubmit = async (e) => {
    e.preventDefault();

    //불필요한 공백 제거
    const cleanEmail = String(emailInput || "").trim();
    const cleanPassword = String(password || "").trim();
    setLoginError("");

    //서버로 로그인 요청
    try{
      const response = await fetch("http://localhost:8080/api/users/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: cleanEmail, password: cleanPassword }),
      });

      if (response.ok) {
        const data = await response.json();
        saveSession(data.token, data.email);
        saveAppRoute({ page: "upload", viewerDocId: null });
        setUserEmail(data.email);
        setCurrentView("upload");
      } else {
        const errorMsg = await response.text();
        console.log("서버 에러 응답:", errorMsg);
        setLoginError("이메일 또는 비밀번호가 잘못되었습니다.");
      }
    } catch (error) {
      console.error("Login Error:", error);
      setLoginError("서버 연결에 실패했습니다.");
    }
  };

  if(currentView!=="login"){
    return renderView();
  }

  if (showForgotPw) {
    return (
      <Forgotpw
        initialResetToken={forgotUrlToken}
        onBackToLogin={() => {
          setShowForgotPw(false);
          const u = new URL(window.location.href);
          u.searchParams.delete("resetToken");
          window.history.replaceState(
            {},
            "",
            u.pathname + (u.search || "") + (u.hash || ""),
          );
        }}
      />
    );
  }

  return (
    <div className="login-page">
      <div className="login-wrap">
        {/* Brand */}
        <div className="brand">
          <div className="brand-icon" aria-hidden="true">
            <DocumentIcon />
          </div>

          <h1 className="brand-title">
            <span className="brand-easy">Easy</span>
            <span className="brand-doc">DOC</span>
          </h1>
        </div>

        {/* Form */}
        <form className="form" onSubmit={onSubmit}>
          <div className="field">
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              placeholder="example@email.com"
              value={emailInput}
              onChange={(e) => {
                setEmailInput(e.target.value);
                setLoginError("");
              }}
              required
            />
          </div>

          <div className="field">
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setLoginError("");
              }}
              required
            />
            {loginError ? (
              <p className="login-error-msg" role="alert">
                {loginError}
              </p>
            ) : null}
          </div>

          <div className="button-group">
            <button className="btn btn-signin" type="submit">
              Sign In
            </button>
            <button
              className="btn btn-register"
              type="button"
              onClick={() => setCurrentView("signup")}
            >
              Register
            </button>
          </div>

          <button
            type="button"
            className="link"
            onClick={() => setShowForgotPw(true)}
          >
            Forgot password?
          </button>
        </form>
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
      {/* back sheet */}
      <rect
        x="16"
        y="12"
        width="54"
        height="68"
        rx="6"
        stroke="#111827"
        strokeWidth="3"
      />
      {/* front sheet */}
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
      {/* small box */}
      <rect
        x="38"
        y="34"
        width="16"
        height="12"
        rx="2"
        stroke="#111827"
        strokeWidth="3"
      />
      {/* lines */}
      <line x1="38" y1="54" x2="74" y2="54" stroke="#111827" strokeWidth="3" />
      <line x1="38" y1="62" x2="74" y2="62" stroke="#111827" strokeWidth="3" />
      <line x1="38" y1="70" x2="66" y2="70" stroke="#111827" strokeWidth="3" />
    </svg>
  );
}