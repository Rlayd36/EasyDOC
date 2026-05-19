import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { BookmarkCheck, X } from "lucide-react";
import rhwpInit, { HwpDocument } from "@rhwp/core/rhwp.js";
import rhwpWasmUrl from "@rhwp/core/rhwp_bg.wasm?url";
import "./PdfHighlightViewer.css";

const PARSER_URL = "http://localhost:8000";

if (typeof globalThis.measureTextWidth === "undefined") {
  const _ctx = document.createElement("canvas").getContext("2d");
  globalThis.measureTextWidth = (font, text) => {
    _ctx.font = font;
    return _ctx.measureText(text).width;
  };
}

let _initPromise = null;
function ensureInit() {
  if (!_initPromise) {
    _initPromise = rhwpInit({ module_or_path: rhwpWasmUrl });
  }
  return _initPromise;
}

/* ── 중요 페이지 배지 + 메모 패널 ── */
function ImportantBadge({ importantInfo }) {
  const [open, setOpen] = useState(false);
  if (!importantInfo) return null;

  const label =
    importantInfo.importance === 3
      ? "매우 중요"
      : importantInfo.importance === 2
        ? "중요"
        : "참고";
  const icon =
    importantInfo.importance === 3
      ? "⚠️"
      : importantInfo.importance === 2
        ? "📌"
        : "💡";

  return (
    <>
      <div
        className={`important-page-badge importance-badge-${importantInfo.importance}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title="클릭하여 상세 설명 보기"
        style={{ cursor: "pointer" }}
      >
        <BookmarkCheck size={16} />
        <span className="important-badge-label">{label}</span>
        <span className="important-badge-toggle">{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div
          className="important-memo-panel"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="important-memo-header">
            <span>
              {icon} {importantInfo.reason}
            </span>
            <button
              className="important-memo-close"
              onClick={() => setOpen(false)}
            >
              <X size={13} />
            </button>
          </div>
          <div className="important-memo-body">
            <p>{importantInfo.summary || importantInfo.reason}</p>
            {importantInfo.keywords?.length > 0 && (
              <div className="important-keywords-list">
                <p className="important-keywords-title">주요 키워드</p>
                {importantInfo.keywords.map((kw, i) => (
                  <div key={i} className="important-keyword-item">
                    <span className="important-keyword-word">{kw.keyword}</span>
                    <span className="important-keyword-explain">
                      {kw.explanation}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* ── 단일 페이지 ── */
function HwpxPage({ doc, pageNum, importantInfo, onTextReady }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!doc || !ref.current) return;
    try {
      ref.current.innerHTML = doc.renderPageSvg(pageNum);
      const svg = ref.current.querySelector("svg");
      if (svg) {
        svg.style.width = "100%";
        svg.style.height = "auto";
        svg.style.display = "block";
        // SVG에서 텍스트 추출해서 부모로 전달
        onTextReady(pageNum, svg.textContent?.trim() ?? "");
      }
    } catch (e) {
      console.error(`[HwpxViewer] 페이지 ${pageNum} 렌더 실패:`, e);
      ref.current.innerHTML = `<div style="padding:16px;color:#dc2626">페이지 렌더 실패</div>`;
      onTextReady(pageNum, "");
    }
  }, [doc, pageNum, onTextReady]);

  return (
    <div
      className={`pdf-page-wrapper${importantInfo ? ` important-page importance-${importantInfo.importance}` : ""}`}
      style={{ position: "relative", marginBottom: 16 }}
    >
      <div ref={ref} />
      <ImportantBadge importantInfo={importantInfo} />
    </div>
  );
}

/* ── 뷰어 본체 ── */
export default function HwpxViewer({ fileUrl, highlightWord, docType }) {
  const [doc, setDoc] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const docRef = useRef(null);

  // 중요 페이지
  const [importantPages, setImportantPages] = useState([]);
  const [analyzingImportant, setAnalyzingImportant] = useState(false);
  const pageTextsRef = useRef({});   // { pageNum: text }
  const analyzedRef = useRef(false); // 분석 중복 방지

  /* 문서 로드 */
  useEffect(() => {
    if (!fileUrl) return;
    let cancelled = false;
    pageTextsRef.current = {};
    analyzedRef.current = false;
    setImportantPages([]);

    (async () => {
      setLoading(true);
      setError(null);
      try {
        await ensureInit();
        const resp = await fetch(fileUrl);
        if (!resp.ok) throw new Error(`파일 다운로드 실패 (${resp.status})`);
        const bytes = new Uint8Array(await resp.arrayBuffer());

        if (docRef.current) {
          docRef.current.free();
          docRef.current = null;
        }
        const hwpDoc = new HwpDocument(bytes);

        if (!cancelled) {
          docRef.current = hwpDoc;
          setDoc(hwpDoc);
          setPageCount(hwpDoc.pageCount());
        } else {
          hwpDoc.free();
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileUrl]);

  useEffect(() => {
    return () => {
      if (docRef.current) {
        docRef.current.free();
        docRef.current = null;
      }
    };
  }, []);

  /* 페이지 텍스트 수집 → 전체 모이면 중요 페이지 분석 */
  const handleTextReady = useCallback(
    (pageNum, text) => {
      pageTextsRef.current[pageNum] = text;
      const collected = Object.keys(pageTextsRef.current).length;
      if (collected < pageCount || pageCount === 0) return;
      if (analyzedRef.current) return;
      analyzedRef.current = true;

      const pages = Object.entries(pageTextsRef.current)
        .filter(([, t]) => t.length > 0)
        .map(([p, t]) => ({ page: Number(p) + 1, text: t })); // rhwp는 0-based

      if (pages.length === 0) return;

      setAnalyzingImportant(true);
      axios
        .post(`${PARSER_URL}/analyze-important-pages`, {
          pages,
          doc_type: docType || "default",
        })
        .then((res) => {
          if (res.data.important_pages?.length) {
            setImportantPages(res.data.important_pages);
          }
        })
        .catch((err) => console.error("[HwpxViewer] 중요 페이지 분석 실패:", err))
        .finally(() => setAnalyzingImportant(false));
    },
    [pageCount, docType],
  );

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: 200,
          color: "#666",
          fontSize: 14,
        }}
      >
        HWPX 문서 로딩 중...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24, color: "#dc2626", fontSize: 14 }}>
        문서를 열 수 없습니다: {error}
      </div>
    );
  }

  if (!doc) return null;

  return (
    <div
      style={{
        padding: 24,
        background: "#f0f0f0",
        minHeight: "100%",
        overflowY: "auto",
      }}
    >
      {analyzingImportant && (
        <div
          style={{
            textAlign: "center",
            fontSize: 12,
            color: "#6b7280",
            marginBottom: 12,
          }}
        >
          중요 페이지 분석 중...
        </div>
      )}
      {Array.from({ length: pageCount }, (_, i) => (
        <HwpxPage
          key={i}
          doc={doc}
          pageNum={i}
          importantInfo={
            // API는 1-based 페이지 번호 반환
            importantPages.find((p) => p.page === i + 1) ?? null
          }
          onTextReady={handleTextReady}
        />
      ))}
    </div>
  );
}
