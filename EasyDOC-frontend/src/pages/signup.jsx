import React, { useState } from 'react';
import { User, Mail, Lock, Eye, EyeOff, Sparkles } from 'lucide-react'; //아이콘
import './signup.css';

const Signup = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('회원가입 정보:', formData);
    //추후 백엔드 연동
  };

  return (
    <div className="signup-page">
      
      {/* 1.헤더 영역 */}
      <div className="signup-header">
        <div className="logo-box">
          <Sparkles color="white" size={32} />
        </div>
        <h1 className="header-title">EasyDOC 시작하기</h1>
        <p className="header-subtitle">어려운 공공문서를 쉬운 말로 바꿔드려요!</p>
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
                  {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
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
            <a href="/login" className="login-link">로그인하기</a>
          </p>
        </div>
      </div>

      {/*3.페이지 최하단 약관*/}
      <div className="terms-text">
        회원가입 시 EasyDOC의 <span className="terms-link">이용약관</span>과 <span className="terms-link">개인정보처리방침</span>에<br />
        동의하는 것으로 간주됩니다.
      </div>
    </div>
  );
};

export default Signup;