import React, { useState } from "react";
import { User, Mail, Lock, Eye, EyeOff, Sparkles, CheckCircle } from "lucide-react"; //아이콘
import "./signup.css";

const Signup = ({ onBack }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [modalType, setModalType] = useState(null); // 'terms' | 'privacy' | null
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    /*비밀번호 길이 검사*/
    if (formData.password.length < 8) {
      alert("비밀번호는 최소 8자 이상이어야 합니다.");
      return;
    }
    /*비밀번호 일치 검사*/
    if (formData.password !== formData.confirmPassword) {
      alert("비밀번호가 일치하지 않습니다.");
      return;
    }
    /*백엔드 연결*/
    try {
      const response = await fetch("http://localhost:8080/api/users/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
        }),
      });
      if (response.ok) {
        setShowSuccessModal(true);
      } else {
        const errorMsg = await response.text();
        alert("회원가입 실패: " + errorMsg);
      }
    } catch (error) {
      console.error("Error:", error);
      alert("서버 연결에 실패했습니다.");
    }
  };

  const closeSuccessModal = () => {
    setShowSuccessModal(false);
    if (typeof onBack === "function") {
      onBack();
    } else {
      window.location.reload();
    }
  };

  return (
    <div className="signup-page">
      {/* 1.헤더 영역 */}
      <div className="signup-header">
        <div className="logo-box">
          <Sparkles color="white" size={32} />
        </div>
        <h1 className="header-title">EasyDOC 시작하기</h1>
        <p className="header-subtitle">어려운 문서를 쉬운 말로 바꿔드려요!</p>
      </div>

      {/* 2.메인 카드 영역 */}
      <div className="signup-card">
        {/* 입력 폼 */}
        <div className="signup-form-area">
          <form onSubmit={handleSubmit}>
            {/*이름*/}
            <div className="form-group">
              <label className="form-label">이름</label>
              <div className="input-wrapper">
                <User className="input-icon" size={20} />
                <input
                  type="text"
                  name="name"
                  placeholder="홍길동"
                  className="custom-input"
                  onChange={handleChange}
                />
              </div>
            </div>

            {/*이메일*/}
            <div className="form-group">
              <label className="form-label">이메일</label>
              <div className="input-wrapper">
                <Mail className="input-icon" size={20} />
                <input
                  type="email"
                  name="email"
                  placeholder="example@email.com"
                  className="custom-input"
                  onChange={handleChange}
                />
              </div>
            </div>

            {/*비밀번호*/}
            <div className="form-group">
              <label className="form-label">비밀번호</label>
              <div className="input-wrapper">
                <Lock className="input-icon" size={20} />
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="8자 이상 입력해주세요"
                  className="custom-input"
                  onChange={handleChange}
                />
                <button
                  type="button"
                  className="toggle-pw-btn"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/*비밀번호 확인*/}
            <div className="form-group">
              <label className="form-label">비밀번호 확인</label>
              <div className="input-wrapper">
                <Lock className="input-icon" size={20} />
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  name="confirmPassword"
                  placeholder="8자 이상 입력해주세요"
                  className="custom-input"
                  onChange={handleChange}
                />
                <button
                  type="button"
                  className="toggle-pw-btn"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeOff size={20} />
                  ) : (
                    <Eye size={20} />
                  )}
                </button>
              </div>
            </div>

            {/*회원가입 버튼*/}
            <button type="submit" className="submit-btn">
              회원가입
            </button>
          </form>
        </div>

        {/*카드 하단 로그인 링크*/}
        <div className="card-footer">
          <p className="footer-text">
            이미 계정이 있으신가요?
            <a href="/login" className="login-link">
              로그인하기
            </a>
          </p>
        </div>
      </div>

      {/*3.페이지 최하단 약관*/}
      <div className="terms-text">
        회원가입 시 EasyDOC의{" "}
        <span
          className="terms-link"
          onClick={() => setModalType("terms")}
          onKeyDown={(e) => e.key === "Enter" && setModalType("terms")}
          role="button"
          tabIndex={0}
        >
          이용약관
        </span>
        과{" "}
        <span
          className="terms-link"
          onClick={() => setModalType("privacy")}
          onKeyDown={(e) => e.key === "Enter" && setModalType("privacy")}
          role="button"
          tabIndex={0}
        >
          개인정보처리방침
        </span>
        에<br />
        동의하는 것으로 간주됩니다.
      </div>

      {/* 약관/개인정보처리방침 모달 */}
      {modalType && (
        <div
          className="terms-modal-overlay"
          onClick={() => setModalType(null)}
          onKeyDown={(e) => e.key === "Escape" && setModalType(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="terms-modal-title"
        >
          <div
            className="terms-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="terms-modal-header">
              <h2 id="terms-modal-title" className="terms-modal-title">
                {modalType === "terms" ? "이용약관" : "개인정보처리방침"}
              </h2>
              <button
                type="button"
                className="terms-modal-close"
                onClick={() => setModalType(null)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <div className="terms-modal-body">
              {modalType === "terms" && <TermsContent />}
              {modalType === "privacy" && <PrivacyContent />}
            </div>
          </div>
        </div>
      )}

      {/* 회원가입 성공 팝업 */}
      {showSuccessModal && (
        <div
          className="terms-modal-overlay"
          onClick={closeSuccessModal}
          onKeyDown={(e) => e.key === "Escape" && closeSuccessModal()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="signup-success-title"
        >
          <div
            className="terms-modal-content signup-success-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="signup-success-inner">
              <div className="signup-success-icon-wrap" aria-hidden="true">
                <CheckCircle size={32} strokeWidth={2.5} />
              </div>
              <h2 id="signup-success-title" className="signup-success-title">
                가입을 환영합니다
              </h2>
              <p className="signup-success-desc">
                회원가입이 완료되었습니다.
                <br />
                로그인 화면에서 이메일과 비밀번호로 로그인해 주세요.
              </p>
              <button
                type="button"
                className="submit-btn signup-success-btn"
                onClick={closeSuccessModal}
              >
                로그인하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* 이용약관 본문 (필요 시 내용 수정) */
function TermsContent() {
  return (
    <div className="terms-body-text">
      <p>
        <strong>제1조 (목적)</strong>
      </p>
      <p>
        본 약관은 EasyDOC 서비스(이하 "서비스")의 이용 조건 및 절차, 회사와
        이용자의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.
      </p>
      <p>
        <strong>제2조 (정의)</strong>
      </p>
      <p>
        ① "서비스"란 회사가 제공하는 공공문서 해석·요약 등 관련 모든 서비스를
        의미합니다.
      </p>
      <p>
        ② "이용자"란 본 약관에 따라 서비스를 이용하는 회원 및 비회원을 말합니다.
      </p>
      <p>
        <strong>제3조 (약관의 효력 및 변경)</strong>
      </p>
      <p>
        ① 본 약관은 서비스 화면에 게시하거나 기타의 방법으로 공지함으로써 효력이
        발생합니다.
      </p>
      <p>
        ② 회사는 필요한 경우 관련 법령을 위반하지 않는 범위에서 본 약관을 변경할
        수 있으며, 변경된 약관은 제1항과 같은 방법으로 공지함으로써 효력이
        발생합니다.
      </p>
      <p>
        <strong>제4조 (서비스의 제공)</strong>
      </p>
      <p>
        회사는 업무상·기술상의 장애가 없는 한 연중무휴로 서비스를 제공합니다.
        단, 시스템 점검 등 필요한 경우 사전 공지 후 일시 중단할 수 있습니다.
      </p>
      <p>
        <strong>제5조 (이용자의 의무)</strong>
      </p>
      <p>
        이용자는 서비스를 이용할 때 관계 법령 및 본 약관을 준수하여야 하며,
        타인의 권리를 침해하거나 서비스 운영을 방해하는 행위를 해서는 안 됩니다.
      </p>
    </div>
  );
}

/* 개인정보처리방침 본문 (필요 시 내용 수정) */
function PrivacyContent() {
  return (
    <div className="terms-body-text">
      <p>
        <strong>1. 개인정보의 수집·이용 목적</strong>
      </p>
      <p>
        EasyDOC는 서비스 제공, 회원 관리, 문의 대응 등을 위하여 필요한 범위에서
        최소한의 개인정보를 수집·이용합니다.
      </p>
      <p>
        <strong>2. 수집하는 개인정보 항목</strong>
      </p>
      <p>
        필수: 이메일, 비밀번호, 이름 / 선택: 없음 (서비스에 따라 추가될 수 있음)
      </p>
      <p>
        <strong>3. 개인정보의 보유 및 이용 기간</strong>
      </p>
      <p>
        회원 탈퇴 시까지 보유하며, 탈퇴 후 지체 없이 파기합니다. 단, 관계 법령에
        따라 보존할 필요가 있는 경우 해당 기간 동안 보관합니다.
      </p>
      <p>
        <strong>4. 개인정보의 제3자 제공</strong>
      </p>
      <p>
        원칙적으로 이용자의 동의 없이 제3자에게 제공하지 않습니다. 법령에 의한
        경우 등 예외가 있는 경우 해당 법령에 따릅니다.
      </p>
      <p>
        <strong>5. 이용자의 권리</strong>
      </p>
      <p>
        이용자는 언제든지 자신의 개인정보에 대한 열람·정정·삭제·처리정지를
        요청할 수 있으며, 회사는 이에 따라 지체 없이 필요한 조치를 하겠습니다.
      </p>
    </div>
  );
}

export default Signup;
