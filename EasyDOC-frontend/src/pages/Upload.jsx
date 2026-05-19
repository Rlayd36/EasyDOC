import React, { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios"; // 통신 라이브러리
import Viewer from "./Viewer";
import Loading from "./Loading";
import AppBrandLogo from "../components/AppBrandLogo";
import DocTypeSelectModal from "../components/DocTypeSelectModal";
import { saveAppRoute, loadAppRoute } from "../utils/appRoute";
import { formatDocumentDateKo } from "../utils/documentDate";
import "./Upload.css";

export default function Upload({
  onNavigateToMyPage,
  onNavigateToUpload,
  userEmail,
}) {
  const [routeSnapshot] = useState(() => loadAppRoute());
  /** 복원 effect가 끝난 뒤에만 경로를 저장해 새로고침 직후 viewerDocId가 지워지지 않게 함 */
  const [routeHydrated, setRouteHydrated] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [recentDocs, setRecentDocs] = useState([]);
  const [showViewer, setShowViewer] = useState(false);
  const [showLoading, setShowLoading] = useState(false);
  const [parseResult, setParseResult] = useState(null);
  const [ocrResult, setOcrResult] = useState(null); // OCR 상태
  const [pdfFileUrl, setPdfFileUrl] = useState(null); // PDF 원본 렌더링용 블롭 URL
  const [showDocTypeModal, setShowDocTypeModal] = useState(false);
  const fileInputRef = useRef(null);

  // S3 presigned URL 발급 서버 (OCR 서버)
  const API_GATEWAY_URL = "http://localhost:8001/s3/upload-url";

  // 최근 문서 목록 가져오기
  const fetchRecentDocs = useCallback(async () => {
    try {
      const response = await axios.get(
        `http://localhost:8002/api/documents?user_email=${userEmail}`,
      );

      // DB 데이터를 화면에 맞게 변환
      const formattedDocs = response.data.map((doc) => ({
        id: doc.id,
        name: doc.file_name,
        date: formatDocumentDateKo(doc.created_at),
      }));
      setRecentDocs(formattedDocs);
    } catch (error) {
      console.error("최근 문서 목록 로딩 실패:", error);
    }
  }, [userEmail]);

  // 페이지가 처음 열릴 때 목록 가져오기
  useEffect(() => {
    fetchRecentDocs();
  }, [fetchRecentDocs]);

  /** DB 문서 id로 뷰어용 상태 채우기 (최근 문서 클릭 / 새로고침 복원 공통) */
  const applyDocumentToViewer = async (docId) => {
    const response = await axios.get(
      `http://localhost:8002/api/documents/${docId}`,
    );
    const docData = response.data;
    setParseResult({
      id: docData.id,
      filename: docData.file_name,
      text: docData.text,
      difficult_words: docData.difficult_words,
      doc_type: docData.doc_type || "default",
    });
    setOcrResult(null);
    setPdfFileUrl(docData.s3_url || null);
    setShowViewer(true);
  };

  /** 브라우저 새로고침 시 업로드+뷰어 화면 복원 (DB에 id가 있는 문서만) */
  useEffect(() => {
    const route = routeSnapshot;
    if (!route || route.page !== "upload" || route.viewerDocId == null) {
      setRouteHydrated(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setShowLoading(true);
        await applyDocumentToViewer(route.viewerDocId);
      } catch (error) {
        console.error("뷰어 복원 실패:", error);
        saveAppRoute({ page: "upload", viewerDocId: null });
      } finally {
        if (!cancelled) {
          setShowLoading(false);
          setRouteHydrated(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routeSnapshot]);

  useEffect(() => {
    if (!routeHydrated) return;
    saveAppRoute({
      page: "upload",
      viewerDocId:
        showViewer && parseResult?.id != null ? parseResult.id : null,
    });
  }, [routeHydrated, showViewer, parseResult?.id]);

  // 최근 문서 목록에서 문서 클릭 시 뷰어 페이지로 이동
  const handleRecentDocClick = async (docId) => {
    if (!docId) return;

    try {
      setShowLoading(true);
      await applyDocumentToViewer(docId);
      setShowLoading(false);
    } catch (error) {
      console.error("문서 상세 불러오기 실패:", error);
      alert("문서를 불러올 수 없습니다.");
      setShowLoading(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = () => {
    if (!selectedFile) {
      fileInputRef.current?.click();
      return;
    }
    // 파일이 골라진 상태에서는 곧바로 업로드를 시작하지 않고
    // 문서 유형 선택 모달부터 띄운다.
    setShowDocTypeModal(true);
  };

  const handleDocTypeCancel = () => {
    setShowDocTypeModal(false);
  };

  const handleDocTypeConfirm = async (docType) => {
    setShowDocTypeModal(false);
    if (!selectedFile) return;

    // PDF/HWPX 파일이면 원본 렌더링을 위해 블롭 URL 저장
    const _ext = selectedFile.name.split(".").pop().toLowerCase();
    if (_ext === "pdf" || _ext === "hwpx") {
      setPdfFileUrl(URL.createObjectURL(selectedFile));
    } else {
      setPdfFileUrl(null);
    }

    try {
      // AWS Lambda에 업로드 URL 요청
      console.log(`1. URL 요청 중... (doc_type=${docType})`);
      const response = await axios.get(API_GATEWAY_URL, {
        params: {
          fileName: selectedFile.name,
          fileType: selectedFile.type,
        },
      });

      const { uploadUrl, key } = response.data;
      console.log("2. URL 발급 완료:", uploadUrl);
      console.log("   Lambda 응답 전체:", response.data);

      // Lambda가 반환한 key를 사용하거나, 없으면 URL에서 추출
      let s3Key;
      if (key) {
        s3Key = key;
        console.log("3. S3 키 (Lambda 제공):", s3Key);
      } else {
        // uploadUrl에서 경로 부분만 추출
        const urlObj = new URL(uploadUrl);
        s3Key = decodeURIComponent(urlObj.pathname.substring(1)); // 맨 앞 '/' 제거 후 디코딩
        console.log("3. S3 키 (URL 추출):", s3Key);
      }

      // 발급받은 URL을 이용해 S3에 파일 직접 업로드
      console.log("4. S3로 파일 전송 중...");
      await axios.put(uploadUrl, selectedFile, {
        headers: {
          "Content-Type": selectedFile.type,
        },
      });

      console.log("5. 업로드 성공!");
      setShowLoading(true);

      // S3 업로드 완료를 위한 대기 (eventual consistency)
      console.log("대기 중... (3초)");
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // 업로드된 파일형에 따라 파싱 혹은 OCR 실행
      if (selectedFile.type.startsWith("image/")) {
        // 파일이 이미지일 때 -> OCR 서버 (8001번) 요청
        console.log("6. OCR 서버에 분석 요청...");
        const ocrResponse = await axios.get(
          `http://localhost:8001/ocr/s3/${encodeURIComponent(s3Key)}?user_email=${userEmail}`,
        );
        console.log("7. OCR 결과 도착!", ocrResponse.data);
        setOcrResult(ocrResponse.data); // 결과 저장
        setParseResult(null); // 파싱 데이터는 비움

        if (ocrResponse.data.pdf_url) {
          setPdfFileUrl(ocrResponse.data.pdf_url);
        }
      } else {
        // 파일이 문서일 때 -> 파싱 서버 (8000번) 요청
        console.log("6. 파싱 요청 중..., S3 키:", s3Key);
        const parseResponse = await axios.get(
          `http://localhost:8000/parse/s3/${encodeURIComponent(s3Key)}?user_email=${userEmail}&doc_type=${encodeURIComponent(docType)}`,
        );
        console.log("7. 파싱 완료!", parseResponse.data);

        setParseResult({
          ...parseResponse.data,
          doc_type: parseResponse.data.doc_type || docType,
        });
        setOcrResult(null); // OCR 데이터는 비움
      }

      setShowLoading(false);
      setShowViewer(true);

      // S3에 업로드된 파일 파싱 (파싱 서버가 있는 경우)
      // const s3Key = `uploads/${selectedFile.name}`;
      // const parseResponse = await axios.get(`http://localhost:8000/parse/s3/${s3Key}`);
      // console.log("파싱 결과:", parseResponse.data.text);

      // UPDATE: UI 업데이트 (최근 문서 목록에 추가)
      await fetchRecentDocs();

      // 초기화
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("파일 업로드 오류:", error);
      setShowLoading(false);
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
    if (ext === "hwpx") return "hwp";
    if (["jpg", "jpeg", "png", "gif", "bmp"].includes(ext)) return "image";
    return "default";
  };
  if (showLoading) {
    return (
      <Loading
        title="문서 분석 중"
        subtitle="문서를 확인하는 중입니다. 잠시만 기다려 주세요"
      />
    );
  }

  const handleExitToUpload = () => {
    setShowViewer(false);
    setParseResult(null);
    setOcrResult(null);
    setPdfFileUrl(null);
  };

  if (showViewer) {
    return (
      <Viewer
        parsedData={parseResult}
        ocrData={ocrResult}
        pdfFileUrl={pdfFileUrl}
        userEmail={userEmail}
        onLogoClick={handleExitToUpload}
      />
    );
  }

  return (
    <div className="upload-page">
      {/* Header */}
      <header className="upload-header">
        <AppBrandLogo onClick={onNavigateToUpload} />
        <div
          className="header-user"
          onClick={onNavigateToMyPage}
          style={{ cursor: "pointer" }}
        >
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
                <div
                  key={doc.id || index}
                  className="recent-item"
                  onClick={() => handleRecentDocClick(doc.id)}
                  style={{ cursor: "pointer" }}
                >
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
                <span>HWPX</span>
              </div>
              <div className="format-item">
                <ImageIcon />
                <span>이미지</span>
              </div>
            </div>

            {selectedFile && (
              <div className="selected-file">{selectedFile.name}</div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.hwpx,.jpg,.jpeg,.png,.gif,.bmp"
              onChange={handleFileSelect}
              className="file-input"
              id="file-input"
            />

            <button className="upload-btn" onClick={handleUpload} type="button">
              <UploadIcon />
              <span>{selectedFile ? "업로드 시작" : "문서 불러오기"}</span>
            </button>
          </div>
        </main>
      </div>

      <DocTypeSelectModal
        open={showDocTypeModal}
        fileName={selectedFile?.name}
        onConfirm={handleDocTypeConfirm}
        onCancel={handleDocTypeCancel}
      />
    </div>
  );
}

// Icons
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
        HWPX
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
