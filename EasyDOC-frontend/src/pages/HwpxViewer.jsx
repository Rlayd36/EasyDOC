import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { jsPDF } from "jspdf";
import {
  BookmarkCheck, X, Highlighter, Type, Download, ImagePlus,
} from "lucide-react";
import rhwpInit, { HwpDocument } from "@rhwp/core/rhwp.js";
import rhwpWasmUrl from "@rhwp/core/rhwp_bg.wasm?url";
import "./PdfHighlightViewer.css";

const PARSER_URL = "http://localhost:8000";

const STICKERS = [
  "👍","👎","⭐","❤️","✅","❌","🔥","❓","💡","⚠️",
];

if (typeof globalThis.measureTextWidth === "undefined") {
  const _ctx = document.createElement("canvas").getContext("2d");
  globalThis.measureTextWidth = (font, text) => {
    _ctx.font = font;
    return _ctx.measureText(text).width;
  };
}

let _initPromise = null;
function ensureInit() {
  if (!_initPromise) _initPromise = rhwpInit({ module_or_path: rhwpWasmUrl });
  return _initPromise;
}

/**
 * rhwp SVG는 글자 하나씩 별개 <text> 요소로 렌더링하기 때문에
 * getSelection().toString()이 "전\n세\n금\n..." 형태로 나온다.
 * 줄당 평균 글자 수가 짧으면(≤2) 글자단위 분리로 판단해 붙이고,
 * 길면 단어/문장 단위로 간주해 공백으로 잇는다.
 */
function cleanSvgText(raw) {
  const segments = raw.split("\n").map(s => s.trim()).filter(Boolean);
  if (segments.length <= 1) return raw.trim();
  const avgLen = segments.reduce((s, t) => s + [...t].length, 0) / segments.length;
  return segments.join(avgLen <= 2 ? "" : " ");
}

/* ── 쉬운말 팝업 — portal + fixed로 overflow 클리핑 방지 ── */
function SimplifyPopup({ popup, onClose }) {
  return createPortal(
    <div
      className={`pdf-simplify-popup ${popup.placement === "below" ? "pdf-simplify-popup--below" : ""}`}
      style={{ position: "fixed", left: popup.x, top: popup.y, transform: "translateX(-50%)", zIndex: 9999 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="pdf-simplify-popup-header">
        <span>쉬운말 변환</span>
        <button className="pdf-simplify-popup-close" onClick={onClose}><X size={13} /></button>
      </div>
      <div className="pdf-simplify-popup-body">
        <p className="pdf-simplify-popup-label">선택 문장</p>
        <p className="pdf-simplify-popup-original">{popup.originalText}</p>
        <p className="pdf-simplify-popup-label">변환 결과</p>
        {popup.loading ? (
          <p className="pdf-simplify-popup-loading">Gemini가 쉬운 표현으로 바꾸는 중...</p>
        ) : popup.error ? (
          <p className="pdf-simplify-popup-error">{popup.error}</p>
        ) : (
          <p className="pdf-simplify-popup-result">{popup.simplifiedText}</p>
        )}
      </div>
    </div>,
    document.body
  );
}

/* ── 중요 페이지 배지 ── */
function ImportantBadge({ importantInfo }) {
  const [open, setOpen] = useState(false);
  if (!importantInfo) return null;
  const label = importantInfo.importance === 3 ? "매우 중요" : importantInfo.importance === 2 ? "중요" : "참고";
  const icon  = importantInfo.importance === 3 ? "⚠️" : importantInfo.importance === 2 ? "📌" : "💡";
  return (
    <>
      <div
        className={`important-page-badge importance-badge-${importantInfo.importance}`}
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        style={{ cursor: "pointer" }}
      >
        <BookmarkCheck size={16} />
        <span className="important-badge-label">{label}</span>
        <span className="important-badge-toggle">{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div className="important-memo-panel" onClick={(e) => e.stopPropagation()}>
          <div className="important-memo-header">
            <span>{icon} {importantInfo.reason}</span>
            <button className="important-memo-close" onClick={() => setOpen(false)}><X size={13} /></button>
          </div>
          <div className="important-memo-body">
            <p>{importantInfo.summary || importantInfo.reason}</p>
            {importantInfo.keywords?.length > 0 && (
              <div className="important-keywords-list">
                <p className="important-keywords-title">주요 키워드</p>
                {importantInfo.keywords.map((kw, i) => (
                  <div key={i} className="important-keyword-item">
                    <span className="important-keyword-word">{kw.keyword}</span>
                    <span className="important-keyword-explain">{kw.explanation}</span>
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

/* ── 드래그 가능한 오버레이 래퍼 ── */
function DraggableOverlay({ x, y, onMove, onDelete, children, style }) {
  const isDragging = useRef(false);
  const startPos   = useRef({ mx: 0, my: 0, ox: 0, oy: 0 });

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    isDragging.current = true;
    startPos.current = { mx: e.clientX, my: e.clientY, ox: x, oy: y };
    const onMove_ = (ev) => {
      if (!isDragging.current) return;
      onMove(
        startPos.current.ox + (ev.clientX - startPos.current.mx),
        startPos.current.oy + (ev.clientY - startPos.current.my),
      );
    };
    const onUp_ = () => {
      isDragging.current = false;
      window.removeEventListener("mousemove", onMove_);
      window.removeEventListener("mouseup",   onUp_);
    };
    window.addEventListener("mousemove", onMove_);
    window.addEventListener("mouseup",   onUp_);
  };

  return (
    <div
      style={{ position: "absolute", left: x, top: y, zIndex: 10, cursor: "move", ...style }}
      onMouseDown={handleMouseDown}
    >
      {children}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        style={{
          position: "absolute", top: -8, right: -8,
          width: 16, height: 16, borderRadius: "50%",
          background: "#ef4444", border: "none", color: "#fff",
          fontSize: 10, cursor: "pointer", display: "flex",
          alignItems: "center", justifyContent: "center", padding: 0,
          lineHeight: 1,
        }}
      >×</button>
    </div>
  );
}

/* ── 단일 페이지 ── */
function HwpxPage({
  doc, pageNum, importantInfo, onTextReady,
  activeMode, activeSticker,
  memos, onAddMemo, onUpdateMemo, onDeleteMemo,
  stickers, onAddSticker, onUpdateSticker, onDeleteSticker,
  images, onAddImage, onUpdateImage, onDeleteImage,
  onPageRef,
}) {
  const wrapperRef      = useRef(null);
  const svgContainerRef = useRef(null);
  const [simplifyPopup,   setSimplifyPopup]   = useState(null);
  const [highlightRects,  setHighlightRects]  = useState([]);
  const [editingMemoId,   setEditingMemoId]   = useState(null);

  /* SVG 렌더 */
  useEffect(() => {
    if (!doc || !svgContainerRef.current) return;
    try {
      svgContainerRef.current.innerHTML = doc.renderPageSvg(pageNum);
      const svg = svgContainerRef.current.querySelector("svg");
      if (svg) {
        svg.style.width = "100%";
        svg.style.height = "auto";
        svg.style.display = "block";
        onTextReady(pageNum, svg.textContent?.trim() ?? "");
      }
    } catch (e) {
      console.error(`[HwpxViewer] p${pageNum} 렌더 실패:`, e);
      onTextReady(pageNum, "");
    }
  }, [doc, pageNum, onTextReady]);

  /* pageRef 전달 */
  useEffect(() => {
    if (wrapperRef.current) onPageRef(pageNum, wrapperRef.current);
  }, [pageNum, onPageRef]);

  const closePopup = useCallback(() => {
    setSimplifyPopup(null);
    setHighlightRects([]);
  }, []);

  /* 페이지 클릭 → 모드별 처리 */
  const handleClick = useCallback((e) => {
    if (e.target.closest(".pdf-simplify-popup")) return;
    if (e.target.closest(".important-page-badge")) return;
    if (e.target.closest(".important-memo-panel")) return;
    if (e.target.closest("[data-overlay]")) return;

    const rect = wrapperRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (activeMode === "memo") {
      const id = Date.now();
      onAddMemo({ id, pageNum, x, y, text: "" });
      setEditingMemoId(id);
      return;
    }
    if (activeMode === "sticker" && activeSticker) {
      onAddSticker({ id: Date.now(), pageNum, x, y, emoji: activeSticker });
      return;
    }
  }, [activeMode, activeSticker, pageNum, onAddMemo, onAddSticker]);

  /* 드래그 → 쉬운말 변환 */
  const handleMouseUp = useCallback((e) => {
    if (activeMode !== "drag") return;
    if (e.target.closest(".pdf-simplify-popup")) return;
    if (e.target.closest("[data-overlay]")) return;

    const selection = window.getSelection();
    const raw = selection?.toString() ?? "";
    const text = cleanSvgText(raw);
    if (!text || text.length < 2) return;
    if (text.length > 500) {
      selection.removeAllRanges();
      alert("선택 범위가 너무 큽니다. 500자 이내로 드래그해 주세요.");
      return;
    }

    const range = selection.getRangeAt(0);
    const clientRects = Array.from(range.getClientRects()).filter(r => r.width > 0);
    const wrapperRect = wrapperRef.current.getBoundingClientRect();

    const relRects = clientRects.map(r => ({
      left: r.left - wrapperRect.left, top: r.top - wrapperRect.top,
      width: r.width, height: r.height,
    }));

    // 팝업은 viewport 좌표(fixed)
    const first = clientRects[0];
    const last  = clientRects[clientRects.length - 1];
    const vpX = (first.left + last.right) / 2;
    const placeBelow = first.top < 140;
    const vpY = placeBelow ? last.bottom + 8 : first.top - 8;

    selection.removeAllRanges();
    setHighlightRects(relRects);
    setSimplifyPopup({ loading: true, error: null, originalText: text, simplifiedText: "", x: vpX, y: vpY, placement: placeBelow ? "below" : "above" });

    axios.post(`${PARSER_URL}/chat`, {
      messages: [{ role: "user", content:
        "아래 문장을 **사회초년생·청년층**(19~34세, 설명서·계약서·법령 읽기에 어려움을 느끼는 사람)이 한 번에 이해할 수 있도록 쉬운 한국어로 바꿔줘.\n" +
        "- 한자어·법률용어·행정 전문용어를 일상 표현으로 치환\n" +
        "- 원래 의미를 절대 왜곡하지 말 것\n" +
        "- 줄바꿈 없이 하나의 이어지는 문단으로 출력\n" +
        "- 설명·주석 없이 변환된 문장만 출력\n\n" + text,
      }],
      persona: "default", document_context: "",
    })
      .then(res => {
        const cleaned = (res.data?.reply || "").replace(/\[HL:.+?\]/g, "").trim();
        setSimplifyPopup(p => p ? { ...p, loading: false, simplifiedText: cleaned || "변환 결과가 비어 있습니다." } : p);
      })
      .catch(() => setSimplifyPopup(p => p ? { ...p, loading: false, error: "변환에 실패했습니다." } : p));
  }, [activeMode]);

  const handleMouseDown = useCallback((e) => {
    if (!e.target.closest(".pdf-simplify-popup")) closePopup();
  }, [closePopup]);

  const cursorStyle =
    activeMode === "drag"    ? "text"      :
    activeMode === "memo"    ? "crosshair" :
    activeMode === "sticker" ? "crosshair" : "default";

  return (
    <div
      ref={wrapperRef}
      data-page={pageNum}
      className={`pdf-page-wrapper${importantInfo ? ` important-page importance-${importantInfo.importance}` : ""}`}
      style={{ position: "relative", marginBottom: 16 }}
      onClick={handleClick}
      onMouseUp={handleMouseUp}
      onMouseDown={handleMouseDown}
    >
      {/* SVG */}
      <div
        ref={svgContainerRef}
        style={{ userSelect: activeMode === "drag" ? "text" : "none", cursor: cursorStyle }}
      />

      {/* 드래그 하이라이트 */}
      {highlightRects.map((r, i) => (
        <div key={i} style={{
          position: "absolute", left: r.left, top: r.top, width: r.width, height: r.height,
          background: "rgba(255,220,0,0.4)", pointerEvents: "none", zIndex: 5,
        }} />
      ))}

      {/* 쉬운말 팝업 */}
      {simplifyPopup && <SimplifyPopup popup={simplifyPopup} onClose={closePopup} />}

      {/* 메모 */}
      {memos.map(memo => (
        <DraggableOverlay
          key={memo.id} x={memo.x} y={memo.y}
          onMove={(x, y) => onUpdateMemo(memo.id, { x, y })}
          onDelete={() => onDeleteMemo(memo.id)}
          data-overlay="true"
        >
          <div data-overlay="true" style={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: 4, minWidth: 160, boxShadow: "0 2px 6px rgba(0,0,0,0.15)" }}>
            {editingMemoId === memo.id ? (
              <textarea
                autoFocus
                value={memo.text}
                onChange={e => onUpdateMemo(memo.id, { text: e.target.value })}
                onBlur={() => setEditingMemoId(null)}
                onClick={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
                style={{ width: 180, height: 80, border: "none", background: "transparent", resize: "both", padding: 6, fontSize: 12, outline: "none", fontFamily: "inherit" }}
              />
            ) : (
              <div
                onDoubleClick={e => { e.stopPropagation(); setEditingMemoId(memo.id); }}
                style={{ padding: "6px 8px", fontSize: 12, minHeight: 40, whiteSpace: "pre-wrap", wordBreak: "break-word", color: memo.text ? "#333" : "#aaa" }}
              >
                {memo.text || "더블클릭하여 메모 입력"}
              </div>
            )}
          </div>
        </DraggableOverlay>
      ))}

      {/* 스티커 */}
      {stickers.map(s => (
        <DraggableOverlay
          key={s.id} x={s.x} y={s.y}
          onMove={(x, y) => onUpdateSticker(s.id, { x, y })}
          onDelete={() => onDeleteSticker(s.id)}
        >
          <span data-overlay="true" style={{ fontSize: 32, lineHeight: 1, display: "block", userSelect: "none" }}>{s.emoji}</span>
        </DraggableOverlay>
      ))}

      {/* 이미지 */}
      {images.map(img => (
        <DraggableOverlay
          key={img.id} x={img.x} y={img.y}
          onMove={(x, y) => onUpdateImage(img.id, { x, y })}
          onDelete={() => onDeleteImage(img.id)}
        >
          <img
            data-overlay="true"
            src={img.src}
            alt=""
            style={{ width: img.width, height: "auto", display: "block", maxWidth: 300, border: "1px solid #d1d5db", borderRadius: 4 }}
          />
        </DraggableOverlay>
      ))}

      <ImportantBadge importantInfo={importantInfo} />
    </div>
  );
}

/* ── 뷰어 본체 ── */
export default function HwpxViewer({ fileUrl, highlightWord, docType }) {
  const [doc,       setDoc]       = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [error,     setError]     = useState(null);
  const [loading,   setLoading]   = useState(true);
  const docRef = useRef(null);

  // 모드: null | "drag" | "memo" | "sticker"
  const [activeMode,    setActiveMode]    = useState(null);
  const [activeSticker, setActiveSticker] = useState(null);
  const [showStickerPicker, setShowStickerPicker] = useState(false);

  // 오버레이
  const [memos,    setMemos]    = useState([]);
  const [stickers, setStickers] = useState([]);
  const [images,   setImages]   = useState([]);

  // 페이지 표시
  const [currentPage, setCurrentPage] = useState(1);
  const pageRefs = useRef({});

  // 다운로드
  const [downloading, setDownloading] = useState(false);

  // 중요 페이지
  const [importantPages,     setImportantPages]     = useState([]);
  const [analyzingImportant, setAnalyzingImportant] = useState(false);
  const pageTextsRef  = useRef({});
  const analyzedRef   = useRef(false);

  // 이미지 업로드 input
  const imageInputRef = useRef(null);

  /* 문서 로드 */
  useEffect(() => {
    if (!fileUrl) return;
    let cancelled = false;
    pageTextsRef.current = {};
    analyzedRef.current  = false;
    setImportantPages([]);
    setMemos([]); setStickers([]); setImages([]);
    setCurrentPage(1);

    (async () => {
      setLoading(true); setError(null);
      try {
        await ensureInit();
        const resp = await fetch(fileUrl);
        if (!resp.ok) throw new Error(`다운로드 실패 (${resp.status})`);
        const bytes = new Uint8Array(await resp.arrayBuffer());
        if (docRef.current) { docRef.current.free(); docRef.current = null; }
        const hwpDoc = new HwpDocument(bytes);
        if (!cancelled) {
          docRef.current = hwpDoc;
          setDoc(hwpDoc);
          setPageCount(hwpDoc.pageCount());
        } else { hwpDoc.free(); }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fileUrl]);

  useEffect(() => () => { docRef.current?.free(); docRef.current = null; }, []);

  /* IntersectionObserver — 현재 페이지 추적 */
  useEffect(() => {
    if (pageCount === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting);
        if (!visible.length) return;
        const top = visible.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b
        );
        setCurrentPage(Number(top.target.dataset.page) + 1);
      },
      { threshold: 0.3 },
    );
    Object.values(pageRefs.current).forEach(el => { if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, [pageCount]);

  const handlePageRef = useCallback((pageNum, el) => {
    pageRefs.current[pageNum] = el;
  }, []);

  /* 중요 페이지 분석 */
  const handleTextReady = useCallback((pageNum, text) => {
    pageTextsRef.current[pageNum] = text;
    if (Object.keys(pageTextsRef.current).length < pageCount || pageCount === 0) return;
    if (analyzedRef.current) return;
    analyzedRef.current = true;
    const pages = Object.entries(pageTextsRef.current)
      .filter(([, t]) => t.length > 0)
      .map(([p, t]) => ({ page: Number(p) + 1, text: t }));
    if (!pages.length) return;
    setAnalyzingImportant(true);
    axios.post(`${PARSER_URL}/analyze-important-pages`, { pages, doc_type: docType || "default" })
      .then(res => { if (res.data.important_pages?.length) setImportantPages(res.data.important_pages); })
      .catch(err => console.error("[HwpxViewer] 중요 페이지 분석 실패:", err))
      .finally(() => setAnalyzingImportant(false));
  }, [pageCount, docType]);

  /* 오버레이 CRUD */
  const addMemo    = useCallback(m  => setMemos(p => [...p, m]), []);
  const updateMemo = useCallback((id, d) => setMemos(p => p.map(m => m.id === id ? { ...m, ...d } : m)), []);
  const deleteMemo = useCallback(id => setMemos(p => p.filter(m => m.id !== id)), []);

  const addSticker    = useCallback(s  => setStickers(p => [...p, s]), []);
  const updateSticker = useCallback((id, d) => setStickers(p => p.map(s => s.id === id ? { ...s, ...d } : s)), []);
  const deleteSticker = useCallback(id => setStickers(p => p.filter(s => s.id !== id)), []);

  const addImage    = useCallback(img  => setImages(p => [...p, img]), []);
  const updateImage = useCallback((id, d) => setImages(p => p.map(img => img.id === id ? { ...img, ...d } : img)), []);
  const deleteImage = useCallback(id => setImages(p => p.filter(img => img.id !== id)), []);

  /* 이미지 파일 선택 */
  const handleImageFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      addImage({ id: Date.now(), pageNum: 0, x: 40, y: 40, src: ev.target.result, width: 200 });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  /* 다운로드 — SVG→canvas per page, 오버레이 합성 후 PDF */
  const handleDownload = useCallback(async () => {
    if (!doc || downloading) return;
    setDownloading(true);
    try {
      let pdf = null;
      for (let i = 0; i < pageCount; i++) {
        const svgStr = doc.renderPageSvg(i);
        // SVG 크기 파싱
        const match = svgStr.match(/viewBox="[^"]*"\s*width="([^"]+)"\s*height="([^"]+)"/);
        const svgW = match ? parseFloat(match[1]) : 794;
        const svgH = match ? parseFloat(match[2]) : 1123;

        const SCALE = 2;
        const canvas = document.createElement("canvas");
        canvas.width  = svgW * SCALE;
        canvas.height = svgH * SCALE;
        const ctx = canvas.getContext("2d");
        ctx.scale(SCALE, SCALE);

        // SVG → Image → canvas
        await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => { ctx.drawImage(img, 0, 0); resolve(); };
          img.onerror = reject;
          const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
          img.src = URL.createObjectURL(blob);
        });

        // 메모 렌더
        memos.filter(m => m.pageNum === i).forEach(m => {
          ctx.fillStyle = "rgba(254,249,195,0.9)";
          ctx.fillRect(m.x, m.y, 188, 80);
          ctx.strokeStyle = "#fde047"; ctx.strokeRect(m.x, m.y, 188, 80);
          ctx.fillStyle = "#333"; ctx.font = "12px sans-serif";
          ctx.fillText(m.text, m.x + 6, m.y + 18);
        });

        // 스티커 렌더
        stickers.filter(s => s.pageNum === i).forEach(s => {
          ctx.font = "32px serif";
          ctx.fillText(s.emoji, s.x, s.y + 32);
        });

        // 이미지 렌더
        await Promise.all(images.filter(img => img.pageNum === i).map(img =>
          new Promise(resolve => {
            const im = new Image();
            im.onload = () => { ctx.drawImage(im, img.x, img.y, img.width, img.width * (im.naturalHeight / im.naturalWidth)); resolve(); };
            im.onerror = resolve;
            im.src = img.src;
          })
        ));

        const wMm = svgW * 0.2646;
        const hMm = svgH * 0.2646;
        const orient = svgW > svgH ? "landscape" : "portrait";
        if (!pdf) {
          pdf = new jsPDF({ orientation: orient, unit: "mm", format: [wMm, hMm] });
        } else {
          pdf.addPage([wMm, hMm], orient);
        }
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, wMm, hMm);
      }
      pdf?.save("document.pdf");
    } catch (e) {
      console.error("[HwpxViewer] 다운로드 실패:", e);
    } finally {
      setDownloading(false);
    }
  }, [doc, pageCount, downloading, memos, stickers, images]);

  /* 모드 토글 헬퍼 */
  const toggleMode = (mode) => setActiveMode(prev => prev === mode ? null : mode);

  /* ── 로딩 / 에러 ── */
  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 200, color: "#666", fontSize: 14 }}>
      HWPX 문서 로딩 중...
    </div>
  );
  if (error) return (
    <div style={{ padding: 24, color: "#dc2626", fontSize: 14 }}>문서를 열 수 없습니다: {error}</div>
  );
  if (!doc) return null;

  const btnBase = { display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer", border: "1px solid #d1d5db", background: "#fff", color: "#374151" };
  const btnActive = { ...btnBase, border: "1px solid #3D4B90", background: "#eef0fb", color: "#3D4B90", fontWeight: 700 };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* ── 툴바 ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 16px", background: "#fff", borderBottom: "1px solid #e5e7eb", flexShrink: 0, flexWrap: "wrap" }}>

        {/* 드래그 */}
        <button onClick={() => toggleMode("drag")} title="드래그 모드: 텍스트 선택 후 쉬운말 변환" style={activeMode === "drag" ? btnActive : btnBase}>
          <Highlighter size={14} /> 드래그 {activeMode === "drag" ? "ON" : "OFF"}
        </button>

        {/* 메모 */}
        <button onClick={() => toggleMode("memo")} title="메모 모드: 클릭하여 메모 추가" style={activeMode === "memo" ? btnActive : btnBase}>
          <Type size={14} /> 메모
        </button>

        {/* 스티커 */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => { setShowStickerPicker(v => !v); setActiveMode(prev => prev === "sticker" ? null : "sticker"); }}
            title="스티커 배치"
            style={activeMode === "sticker" ? btnActive : btnBase}
          >
            😊 스티커{activeSticker ? ` ${activeSticker}` : ""}
          </button>
          {showStickerPicker && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, display: "flex", flexWrap: "wrap", gap: 4, width: 180, boxShadow: "0 4px 12px rgba(0,0,0,0.12)", zIndex: 100 }}>
              {STICKERS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => { setActiveSticker(emoji); setShowStickerPicker(false); setActiveMode("sticker"); }}
                  style={{ fontSize: 22, background: activeSticker === emoji ? "#eef0fb" : "transparent", border: "none", borderRadius: 4, cursor: "pointer", padding: 4 }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 이미지 */}
        <button onClick={() => imageInputRef.current?.click()} title="이미지 삽입" style={btnBase}>
          <ImagePlus size={14} /> 이미지
        </button>
        <input ref={imageInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageFile} />

        {/* 다운로드 */}
        <button onClick={handleDownload} disabled={downloading} title="PDF로 다운로드" style={{ ...btnBase, marginLeft: "auto", background: "#3D4B90", color: "#fff", border: "none" }}>
          <Download size={14} /> {downloading ? "저장 중..." : "다운로드"}
        </button>

        {/* 페이지 표시 */}
        <span style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>
          p.{currentPage}/{pageCount}
        </span>

        {/* 분석 중 */}
        {analyzingImportant && (
          <span style={{ fontSize: 11, color: "#6b7280" }}>중요 페이지 분석 중...</span>
        )}
      </div>

      {/* ── 페이지 목록 ── */}
      <div style={{ padding: 24, background: "#f0f0f0", flex: 1, overflowY: "auto" }}>
        {Array.from({ length: pageCount }, (_, i) => (
          <HwpxPage
            key={i}
            doc={doc}
            pageNum={i}
            importantInfo={importantPages.find(p => p.page === i + 1) ?? null}
            onTextReady={handleTextReady}
            onPageRef={handlePageRef}
            activeMode={activeMode}
            activeSticker={activeSticker}
            memos={memos.filter(m => m.pageNum === i)}
            onAddMemo={addMemo}
            onUpdateMemo={updateMemo}
            onDeleteMemo={deleteMemo}
            stickers={stickers.filter(s => s.pageNum === i)}
            onAddSticker={addSticker}
            onUpdateSticker={updateSticker}
            onDeleteSticker={deleteSticker}
            images={images.filter(img => img.pageNum === i)}
            onAddImage={addImage}
            onUpdateImage={updateImage}
            onDeleteImage={deleteImage}
          />
        ))}
      </div>
    </div>
  );
}
