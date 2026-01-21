import React, { useState } from "react";
import "./login.css";
import SignUp from "./signup";
import Upload from "./Upload";

export default function Login() {
  const [showSignUp, setShowSignUp] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  const onSubmit = (e) => {
    e.preventDefault();
    setShowUpload(true);
  };

  if (showSignUp) {
    return <SignUp />;
  }

  if (showUpload) {
    return <Upload />;
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
            <input className="input" type="email" placeholder="Value" />
          </div>

          <div className="field">
            <label className="label">Password</label>
            <input className="input" type="password" placeholder="Value" />
          </div>

          <div className="button-group">
            <button className="btn btn-signin" type="submit">
              Sign In
            </button>
            <button
              className="btn btn-register"
              type="button"
              onClick={() => setShowSignUp(true)}
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
        q
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
