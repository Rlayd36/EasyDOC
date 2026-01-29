import React, { useState } from "react";
import "./login.css";
import SignUp from "./signup";
import Upload from "./Upload";
import MyPage from "./MyPage";

export default function Login() {
  const [currentView, setCurrentView] = useState("login");
  
  // 로그인한 사용자 정보 저장
  const [userEmail, setUserEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailInput, setEmailInput] = useState("");

  //화면 렌더링
  const renderView = () => {
    switch (currentView) {
      case "upload":
        return (
          <Upload 
            onNavigateToMyPage={() => setCurrentView("mypage")} 
          />
        );
      case "mypage":
        return (
          <MyPage 
            userEmail={userEmail}
            onNavigateToUpload={() => setCurrentView("upload")}
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
    setUserEmail("");
    setPassword("");
    setEmailInput("");
    setCurrentView("login");
    alert("로그아웃 되었습니다.");
  };

  const onSubmit = async (e) => {
    e.preventDefault();

    // 불필요한 공백 제거
    const cleanEmail = String(emailInput || "").trim();
    const cleanPassword = String(password || "").trim();

    // 서버로 로그인 요청
    try {
      const response = await fetch("http://localhost:8080/api/users/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: cleanEmail, password: cleanPassword }),
      });

      if (response.ok) {
        alert("로그인 성공!");
        setUserEmail(cleanEmail);
        setCurrentView("upload");
      } else {
        const errorMsg = await response.text();
        console.log("서버 에러 응답:", errorMsg);
        alert("로그인 실패: " + errorMsg);
      }
    } catch (error) {
      console.error("Login Error:", error);
      alert("서버 연결에 실패했습니다.");
    }
  };

  if(currentView!=="login"){
    return renderView();
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
              onChange={(e) => setEmailInput(e.target.value)}
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
              onChange={(e) => setPassword(e.target.value)}
              required
            />
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

          <a className="link" href="#">
            Forgot password?
          </a>
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