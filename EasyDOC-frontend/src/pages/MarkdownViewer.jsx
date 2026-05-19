import React, { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import axios from "axios";
import { Highlighter, X, Eye, Code, Save, Type, Download } from "lucide-react";
import "./PdfHighlightViewer.css";

const PARSER_URL  = "http://localhost:8000";
const DOC_API_URL = "http://localhost:8002";

/* ── 쉬운말 팝업 ── */
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

/* ── 드래그 가능한 메모 오버레이 ── */
function MemoOverlay({ memo, onMove, onDelete, onUpdate }) {
  const [editing, setEditing] = useState(!memo.text);
  const isDragging = useRef(false);
  const startPos   = useRef({});

  const handleMouseDown = (e) => {
    if (e.button !== 0 || editing) return;
    e.stopPropagation();
    isDragging.current = true;
    startPos.current = { mx: e.clientX, my: e.clientY, ox: memo.x, oy: memo.y };
    const move = (ev) => {
      if (!isDragging.current) return;
      onMove(startPos.current.ox + ev.clientX - startPos.current.mx,
             startPos.current.oy + ev.clientY - startPos.current.my);
    };
    const up = () => { isDragging.current = false; window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div
      data-overlay="true"
      style={{ position: "absolute", left: memo.x, top: memo.y, zIndex: 10, cursor: editing ? "default" : "move" }}
      onMouseDown={handleMouseDown}
    >
      <div style={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: 4, minWidth: 160, boxShadow: "0 2px 6px rgba(0,0,0,0.15)", position: "relative" }}>
        <button
          onClick={() => onDelete()}
          style={{ position: "absolute", top: -8, right: -8, width: 16, height: 16, borderRadius: "50%", background: "#ef4444", border: "none", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 1 }}
        >×</button>
        {editing ? (
          <textarea
            autoFocus
            value={memo.text}
            onChange={(e) => onUpdate({ text: e.target.value })}
            onBlur={() => setEditing(false)}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ width: 180, height: 80, border: "none", background: "transparent", resize: "both", padding: 6, fontSize: 12, outline: "none", fontFamily: "inherit" }}
          />
        ) : (
          <div
            onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
            style={{ padding: "6px 8px", fontSize: 12, minHeight: 40, whiteSpace: "pre-wrap", wordBreak: "break-word", color: memo.text ? "#333" : "#aaa" }}
          >
            {memo.text || "더블클릭하여 메모 입력"}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MarkdownViewer({ text, highlightWord, docId, onTextSaved }) {
  const [mode, setMode]             = useState("preview");
  const [dragMode, setDragMode]     = useState(false);
  const [memoMode, setMemoMode]     = useState(false);
  const [memos, setMemos]           = useState([]);
  const [editedText, setEditedText] = useState(text ?? "");
  const [isDirty, setIsDirty]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [saveMsg, setSaveMsg]       = useState("");
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  const [simplifyPopup,  setSimplifyPopup]  = useState(null);
  const [highlightRects, setHighlightRects] = useState([]);
  const contentRef = useRef(null);

  useEffect(() => { setEditedText(text ?? ""); setIsDirty(false); }, [text]);

  // 모드 전환 시 종속 상태 초기화
  const switchMode = (m) => {
    setMode(m);
    setDragMode(false);
    setMemoMode(false);
    closePopup();
  };

  const closePopup = useCallback(() => {
    setSimplifyPopup(null);
    setHighlightRects([]);
  }, []);

  /* 저장 */
  const handleSave = useCallback(async () => {
    if (!docId || saving) return;
    setSaving(true); setSaveMsg("");
    try {
      await axios.patch(`${DOC_API_URL}/api/documents/${docId}/text`, { text: editedText });
      setIsDirty(false);
      setSaveMsg("저장됐습니다.");
      onTextSaved?.(editedText);
      setTimeout(() => setSaveMsg(""), 2500);
    } catch {
      setSaveMsg("저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }, [docId, editedText, saving, onTextSaved]);

  /* 다운로드 .md */
  const downloadMd = () => {
    const blob = new Blob([editedText], { type: "text/markdown;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "document.md"; a.click();
    URL.revokeObjectURL(url);
    setShowDownloadMenu(false);
  };

  /* 다운로드 PDF — 브라우저 인쇄 다이얼로그 */
  const downloadPdf = () => {
    setShowDownloadMenu(false);
    // 프리뷰 모드로 전환 후 인쇄
    setMode("preview");
    setTimeout(() => window.print(), 300);
  };

  /* 메모 CRUD */
  const addMemo    = (x, y) => setMemos(p => [...p, { id: Date.now(), x, y, text: "" }]);
  const updateMemo = (id, d) => setMemos(p => p.map(m => m.id === id ? { ...m, ...d } : m));
  const deleteMemo = (id)    => setMemos(p => p.filter(m => m.id !== id));

  /* 클릭 처리 */
  const handleContentClick = useCallback((e) => {
    if (e.target.closest("[data-overlay]")) return;
    if (!memoMode) return;
    const rect = contentRef.current.getBoundingClientRect();
    addMemo(e.clientX - rect.left, e.clientY - rect.top + contentRef.current.scrollTop);
  }, [memoMode]);

  /* 드래그 → 쉬운말 */
  const handleMouseUp = useCallback((e) => {
    if (mode !== "preview" || !dragMode) return;
    if (e.target.closest(".pdf-simplify-popup") || e.target.closest("[data-overlay]")) return;

    const selection = window.getSelection();
    const selected  = selection?.toString().trim();
    if (!selected || selected.length < 2) return;
    if (selected.length > 500) { selection.removeAllRanges(); alert("500자 이내로 드래그해 주세요."); return; }

    const range       = selection.getRangeAt(0);
    const clientRects = Array.from(range.getClientRects()).filter(r => r.width > 0);
    const wrapperRect = contentRef.current.getBoundingClientRect();

    const relRects   = clientRects.map(r => ({ left: r.left - wrapperRect.left, top: r.top - wrapperRect.top, width: r.width, height: r.height }));
    const first      = clientRects[0];
    const last       = clientRects[clientRects.length - 1];
    const vpX        = (first.left + last.right) / 2;
    const placeBelow = first.top < 140;
    const vpY        = placeBelow ? last.bottom + 8 : first.top - 8;

    selection.removeAllRanges();
    setHighlightRects(relRects);
    setSimplifyPopup({ loading: true, error: null, originalText: selected, simplifiedText: "", x: vpX, y: vpY, placement: placeBelow ? "below" : "above" });

    axios.post(`${PARSER_URL}/chat`, {
      messages: [{ role: "user", content:
        "아래 문장을 **사회초년생·청년층**(19~34세, 설명서·계약서·법령 읽기에 어려움을 느끼는 사람)이 한 번에 이해할 수 있도록 쉬운 한국어로 바꿔줘.\n" +
        "- 한자어·법률용어·행정 전문용어를 일상 표현으로 치환\n원래 의미를 절대 왜곡하지 말 것\n줄바꿈 없이 하나의 이어지는 문단으로 출력\n설명·주석 없이 변환된 문장만 출력\n\n" + selected,
      }],
      persona: "default", document_context: "",
    })
      .then(res => { const c = (res.data?.reply || "").replace(/\[HL:.+?\]/g, "").trim(); setSimplifyPopup(p => p ? { ...p, loading: false, simplifiedText: c || "변환 결과가 비어 있습니다." } : p); })
      .catch(() => setSimplifyPopup(p => p ? { ...p, loading: false, error: "변환에 실패했습니다." } : p));
  }, [mode, dragMode]);

  const handleMouseDown = useCallback((e) => {
    if (!e.target.closest(".pdf-simplify-popup")) closePopup();
    setShowDownloadMenu(false);
  }, [closePopup]);

  /* 버튼 스타일 */
  const btn = { display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer", border: "1px solid #d1d5db", background: "#fff", color: "#374151" };
  const btnOn = { ...btn, border: "1px solid #3D4B90", background: "#eef0fb", color: "#3D4B90", fontWeight: 700 };

  if (text == null) return null;

  const cursor = memoMode ? "crosshair" : dragMode ? "text" : "auto";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* ── 툴바 ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 16px", background: "#fff", borderBottom: "1px solid #e5e7eb", flexShrink: 0, flexWrap: "wrap" }}>

        <button onClick={() => switchMode("preview")} style={mode === "preview" ? btnOn : btn}><Eye size={14} /> 프리뷰</button>
        <button onClick={() => switchMode("raw")} style={mode === "raw" ? btnOn : btn}><Code size={14} /> RAW</button>

        <div style={{ width: 1, height: 20, background: "#e5e7eb", margin: "0 2px" }} />

        {mode === "preview" && (
          <>
            <button onClick={() => { setDragMode(v => !v); setMemoMode(false); }} style={dragMode ? btnOn : btn} title="드래그로 쉬운말 변환">
              <Highlighter size={14} /> 드래그 {dragMode ? "ON" : "OFF"}
            </button>
            <button onClick={() => { setMemoMode(v => !v); setDragMode(false); closePopup(); }} style={memoMode ? btnOn : btn} title="클릭하여 메모 추가">
              <Type size={14} /> 메모
            </button>
          </>
        )}

        {mode === "raw" && (
          <>
            <button
              onClick={handleSave}
              disabled={!isDirty || saving || !docId}
              style={{ ...btn, background: isDirty && docId ? "#3D4B90" : "#e5e7eb", color: isDirty && docId ? "#fff" : "#9ca3af", border: "none", cursor: isDirty && docId ? "pointer" : "default" }}
            >
              <Save size={14} /> {saving ? "저장 중..." : "저장"}
            </button>
            {!docId && <span style={{ fontSize: 11, color: "#f59e0b" }}>DB에 저장된 문서만 수정 가능합니다</span>}
            {saveMsg && <span style={{ fontSize: 11, color: saveMsg.includes("실패") ? "#dc2626" : "#059669" }}>{saveMsg}</span>}
          </>
        )}

        {/* 다운로드 드롭다운 */}
        <div style={{ position: "relative", marginLeft: "auto" }}>
          <button onClick={() => setShowDownloadMenu(v => !v)} style={{ ...btn, background: "#3D4B90", color: "#fff", border: "none" }}>
            <Download size={14} /> 다운로드
          </button>
          {showDownloadMenu && (
            <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.12)", zIndex: 100, minWidth: 160, overflow: "hidden" }}>
              <button onClick={downloadMd} style={{ display: "block", width: "100%", padding: "10px 16px", textAlign: "left", fontSize: 13, background: "none", border: "none", cursor: "pointer", color: "#374151" }}
                onMouseEnter={e => e.target.style.background = "#f3f4f6"} onMouseLeave={e => e.target.style.background = "none"}>
                .md 파일로 저장
              </button>
              <button onClick={downloadPdf} style={{ display: "block", width: "100%", padding: "10px 16px", textAlign: "left", fontSize: 13, background: "none", border: "none", cursor: "pointer", color: "#374151" }}
                onMouseEnter={e => e.target.style.background = "#f3f4f6"} onMouseLeave={e => e.target.style.background = "none"}>
                PDF로 저장 (인쇄)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 모드 안내 */}
      <div style={{ padding: "4px 16px", background: "#f9fafb", borderBottom: "1px solid #f3f4f6", fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>
        {mode === "preview" && !dragMode && !memoMode && "읽기 전용 · 수정하려면 RAW 모드로 전환하세요"}
        {mode === "preview" && dragMode && "텍스트를 드래그하면 쉬운말로 변환합니다 (최대 500자)"}
        {mode === "preview" && memoMode && "내용을 클릭하면 메모를 추가합니다. 더블클릭으로 편집, 드래그로 이동합니다."}
        {mode === "raw" && "마크다운 원문을 직접 편집할 수 있습니다. 저장하면 DB에 반영됩니다."}
      </div>

      {/* ── 본문 ── */}
      {mode === "preview" ? (
        <div
          ref={contentRef}
          style={{ position: "relative", flex: 1, overflowY: "auto", padding: "32px 40px", maxWidth: 800, margin: "0 auto", width: "100%", lineHeight: 1.8, fontSize: 15, color: "#1f2937", userSelect: dragMode ? "text" : "none", cursor }}
          onClick={handleContentClick}
          onMouseUp={handleMouseUp}
          onMouseDown={handleMouseDown}
        >
          <ReactMarkdown>{editedText}</ReactMarkdown>

          {/* 드래그 하이라이트 */}
          {highlightRects.map((r, i) => (
            <div key={i} style={{ position: "absolute", left: r.left, top: r.top, width: r.width, height: r.height, background: "rgba(255,220,0,0.4)", pointerEvents: "none", zIndex: 5 }} />
          ))}

          {/* 메모 오버레이 */}
          {memos.map(memo => (
            <MemoOverlay
              key={memo.id}
              memo={memo}
              onMove={(x, y) => updateMemo(memo.id, { x, y })}
              onUpdate={(d) => updateMemo(memo.id, d)}
              onDelete={() => deleteMemo(memo.id)}
            />
          ))}
        </div>
      ) : (
        <textarea
          value={editedText}
          onChange={(e) => { setEditedText(e.target.value); setIsDirty(true); }}
          spellCheck={false}
          style={{ flex: 1, padding: "24px 32px", fontFamily: "'Consolas', 'Monaco', monospace", fontSize: 13, lineHeight: 1.7, color: "#1f2937", background: "#fafafa", border: "none", outline: "none", resize: "none", overflowY: "auto" }}
        />
      )}

      {simplifyPopup && <SimplifyPopup popup={simplifyPopup} onClose={closePopup} />}
    </div>
  );
}
