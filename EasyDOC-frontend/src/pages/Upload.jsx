import React, { useState, useRef } from "react";
import "./Upload.css";
import MyPage from "./MyPage";

export default function Upload() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [recentDocs, setRecentDocs] = useState([]);
  const [showMyPage, setShowMyPage] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      fileInputRef.current?.click();
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      // TODO: 백엔드 API가 구현되면 여기서 API 호출 (* 현재는 로컬에서 파일 정보만 저장)
      const fileInfo = {
        name: selectedFile.name,
        date: new Date()
          .toLocaleDateString("ko-KR", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          })
          .replace(/\./g, "."),
      };

      const filteredDocs = recentDocs.filter(
        (doc) => doc.name !== selectedFile.name
      );
      setRecentDocs([fileInfo, ...filteredDocs.slice(0, 9)]);

      // 파일 저장 (나중에 백엔드 API로 대체)
      console.log("업로드 성공", selectedFile.name);

      // 초기화
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      alert("파일이 업로드 성공! (백엔드 API 연결 후 DB로 밀어넣을 예정)");
    } catch (error) {
      console.error("파일 업로드 오류:", error);
      alert("파일 업로드 중 오류가 발생했습니다.");
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const getFileIcon = (fileName) => {
    const ext = fileName.split(".").pop().toLowerCase();
    if (ext === "pdf") return "pdf";
    if (ext === "hwp") return "hwp";
    if (["jpg", "jpeg", "png", "gif", "bmp"].includes(ext)) return "image";
    return "default";
  };

  if (showMyPage) {
    return <MyPage />;
  }

  return (
    <div className="upload-page">
      {/* Header */}
      <header className="upload-header">
        <div className="header-logo">
          <DocumentIcon />
          <h1 className="header-title">
            <span className="brand-easy">Easy</span>
            <span className="brand-doc">DOC</span>
          </h1>
        </div>
        <div className="header-user" onClick={() => setShowMyPage(true)}>
          <UserIcon />
        </div>
      </header>

      <div className="upload-container">
        {/* 사이드바 */}
        <aside className="upload-sidebar">
          <div className="sidebar-recent">
            <div className="recent-header">
              <ClockIcon />
              <span>최근 문서</span>
            </div>
            <div className="recent-list">
              {recentDocs.map((doc, index) => (
                <div key={index} className="recent-item">
                  <div className="recent-item-icon">
                    {getFileIcon(doc.name) === "pdf" && <PDFIcon />}
                    {getFileIcon(doc.name) === "hwp" && <HWPIcon />}
                    {getFileIcon(doc.name) === "image" && <ImageIcon />}
                  </div>
                  <div className="recent-item-info">
                    <div className="recent-item-name">{doc.name}</div>
                    <div className="recent-item-date">{doc.date}</div>
                  </div>
                  <div className="recent-item-arrow">
                    <ArrowIcon />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="upload-main">
          <div
            className="upload-card"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <div className="upload-icon-wrapper">
              <UploadIconLarge />
            </div>
            <h2 className="upload-title">문서 업로드</h2>
            <p className="upload-subtitle">파일을 선택해주세요</p>

            <div className="upload-formats">
              <div className="format-item">
                <PDFIcon />
                <span>PDF</span>
              </div>
              <div className="format-item">
                <HWPIcon />
                <span>HWP</span>
              </div>
              <div className="format-item">
                <ImageIcon />
                <span>이미지</span>
              </div>
            </div>

            {selectedFile && (
              <div className="selected-file">
                선택된 파일: {selectedFile.name}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.hwp,.jpg,.jpeg,.png,.gif,.bmp"
              onChange={handleFileSelect}
              className="file-input"
              id="file-input"
            />

            <button className="upload-btn" onClick={handleUpload} type="button">
              <UploadIcon />
              <span>문서 업로드</span>
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}

// Icons
function DocumentIcon() {
  return (
    <svg
      width="48"
      height="48"
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

function UserIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="8" r="4" stroke="#111827" strokeWidth="2" />
      <path
        d="M6 21c0-3.314 2.686-6 6-6s6 2.686 6 6"
        stroke="#111827"
        strokeWidth="2"
      />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="17 8 12 3 7 8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="12"
        y1="3"
        x2="12"
        y2="15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UploadIconLarge() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="17 8 12 3 7 8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="12"
        y1="3"
        x2="12"
        y2="15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
      <polyline
        points="12 6 12 12 16 14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <polyline
        points="9 18 15 12 9 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PDFIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="2"
        fill="#DC2626"
        stroke="#DC2626"
        strokeWidth="1"
      />
      <text
        x="12"
        y="16"
        textAnchor="middle"
        fill="white"
        fontSize="10"
        fontWeight="bold"
      >
        PDF
      </text>
    </svg>
  );
}

function HWPIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="2"
        fill="#2563EB"
        stroke="#2563EB"
        strokeWidth="1"
      />
      <text
        x="12"
        y="16"
        textAnchor="middle"
        fill="white"
        fontSize="8"
        fontWeight="bold"
      >
        HWP
      </text>
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="2"
        fill="#10B981"
        stroke="#10B981"
        strokeWidth="1"
      />
      <circle cx="8.5" cy="8.5" r="2" fill="white" />
      <polyline
        points="4 16 9 11 14 16 20 10"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
