import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { jsPDF } from "jspdf";
import axios from "axios";
import { MessageSquarePlus, GripVertical, Trash2, Type, Download, Sticker, ImagePlus, ClipboardEdit, Sparkles, CheckCheck, X, Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import "./PdfHighlightViewer.css";

const PARSER_URL = "http://localhost:8000";

// PDF.js 워커 설정 (로컬 번들)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/* ── 스티커 목록 (SVG path) ── */
const STICKERS = [
  { id: "thumbsup",  label: "👍", emoji: "👍" },
  { id: "thumbsdown",label: "👎", emoji: "👎" },
  { id: "star",      label: "⭐", emoji: "⭐" },
  { id: "heart",     label: "❤️", emoji: "❤️" },
  { id: "check",     label: "✅", emoji: "✅" },
  { id: "cross",     label: "❌", emoji: "❌" },
  { id: "arrow_r",   label: "➡️", emoji: "➡️" },
  { id: "arrow_d",   label: "⬇️", emoji: "⬇️" },
  { id: "fire",      label: "🔥", emoji: "🔥" },
  { id: "question",  label: "❓", emoji: "❓" },
  { id: "bulb",      label: "💡", emoji: "💡" },
  { id: "warning",   label: "⚠️", emoji: "⚠️" },
];

/* ─────────────────────────────────────────
   PdfPage: 단일 PDF 페이지 렌더링
   ───────────────────────────────────────── */
function PdfPage({ pdfDoc, pageNum, containerWidth, highlightWord, memoMode, memos, onAddMemo, onUpdateMemo, onDeleteMemo, onDownload, stickers, onAddSticker, onUpdateSticker, onDeleteSticker, images, onAddImage, onUpdateImage, onDeleteImage, fillMode, fillCells, cellValues, pendingCells, onCellValueChange, importantInfo }) {
  const imgInputRef = useRef(null);   // 우클릭 메뉴에서 이미지 업로드용
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);   // 현재 진행 중인 렌더 작업 추적
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [hasText, setHasText] = useState(true);
  const [highlights, setHighlights] = useState([]);
  const [renderScale, setRenderScale] = useState(1);  // 셀 오버레이 위치 계산용

  // 텍스트 좌표 저장 (드래그 선택용)
  const charBoxesRef = useRef([]);
  const linesRef = useRef([]);

  // 드래그 선택 상태
  const [dragSelection, setDragSelection] = useState(null); // { startX, startY, endX, endY }
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef(null);
  const [fixedSelectionRects, setFixedSelectionRects] = useState([]);
  const [simplifyPopup, setSimplifyPopup] = useState(null);

  // 중요 페이지 메모 토글 + 키워드 하이라이트
  const [showImportantMemo, setShowImportantMemo] = useState(false);
  const [importantHighlights, setImportantHighlights] = useState([]);
  const [activeKeywordIdx, setActiveKeywordIdx] = useState(null);
  const [charBoxesReady, setCharBoxesReady] = useState(0); // charBoxes 준비 신호용

  useEffect(() => {
    if (!pdfDoc || !containerWidth) return;
    let cancelled = false;

    // 이전 렌더 작업이 남아있으면 취소
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    (async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(containerWidth / baseViewport.width, 2.5);
        const viewport = page.getViewport({ scale });
        setRenderScale(scale);

        /* ── 캔버스 렌더링 ── */
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const ctx = canvas.getContext("2d");

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        setPageSize({
          width: Math.floor(viewport.width),
          height: Math.floor(viewport.height),
        });

        const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null;

        // 렌더 작업 시작 & 추적
        const renderTask = page.render({ canvasContext: ctx, viewport, transform });
        renderTaskRef.current = renderTask;

        try {
          await renderTask.promise;
        } catch (renderErr) {
          // 취소된 경우 조용히 무시
          if (renderErr?.name === "RenderingCancelledException" || cancelled) {
            return;
          }
          throw renderErr;
        }
        renderTaskRef.current = null;
        if (cancelled) return;

        /* ── 텍스트 좌표 추출 (하이라이팅 + 드래그 선택 공용) ── */
        const textContent = await page.getTextContent();
        if (cancelled) return;

        const vpT = viewport.transform;
        const charBoxes = [];
        for (const item of textContent.items) {
          const str = item.str;
          if (!str) continue;

          const itm = item.transform;
          const ct = [
            vpT[0] * itm[0] + vpT[2] * itm[1],
            vpT[1] * itm[0] + vpT[3] * itm[1],
            vpT[0] * itm[2] + vpT[2] * itm[3],
            vpT[1] * itm[2] + vpT[3] * itm[3],
            vpT[0] * itm[4] + vpT[2] * itm[5] + vpT[4],
            vpT[1] * itm[4] + vpT[3] * itm[5] + vpT[5],
          ];

          const fontH = Math.hypot(ct[0], ct[1]);
          const baseX = ct[4];
          const baseY = ct[5];

          let textW = item.width ? item.width * viewport.scale : str.length * fontH * 0.6;
          const charW = textW / (str.length || 1);

          for (let ci = 0; ci < str.length; ci++) {
            charBoxes.push({
              char: str[ci],
              x: baseX + ci * charW,
              y: baseY - fontH,
              w: charW,
              h: fontH * 1.15,
              baseY,
              fontH,
            });
          }
        }

        // ref에 저장 (드래그 선택에서 재사용)
        charBoxesRef.current = charBoxes;
        setCharBoxesReady((v) => v + 1);

        if (charBoxes.length === 0) {
          setHasText(false);
          setHighlights([]);
          linesRef.current = [];
          return;
        }
        setHasText(true);

        const LINE_TOLERANCE = 5;
        const lines = [];
        let currentLine = [charBoxes[0]];
        for (let i = 1; i < charBoxes.length; i++) {
          const prev = currentLine[currentLine.length - 1];
          const cur = charBoxes[i];
          if (Math.abs(cur.baseY - prev.baseY) < LINE_TOLERANCE) {
            currentLine.push(cur);
          } else {
            lines.push(currentLine);
            currentLine = [cur];
          }
        }
        lines.push(currentLine);
        linesRef.current = lines;

        /* ── 단어 하이라이팅 ── */
        if (!highlightWord) {
          setHighlights([]);
        } else {
          const found = [];
          for (const line of lines) {
            line.sort((a, b) => a.x - b.x);
            const lineStr = line.map((c) => c.char).join("");
            let searchPos = 0;
            let idx;

            while ((idx = lineStr.indexOf(highlightWord, searchPos)) !== -1) {
              const startBox = line[idx];
              const endBox = line[idx + highlightWord.length - 1];

              if (startBox && endBox) {
                found.push({
                  x: startBox.x,
                  y: Math.min(startBox.y, endBox.y),
                  width: endBox.x + endBox.w - startBox.x,
                  height: Math.max(startBox.h, endBox.h),
                  word: highlightWord
                });
              }
              searchPos = idx + highlightWord.length;
            }
          }
          setHighlights(found);
        }

      } catch (err) {
        if (err?.name !== "RenderingCancelledException") {
          console.error(`페이지 ${pageNum} 렌더링 오류:`, err);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [pdfDoc, pageNum, containerWidth, highlightWord]);

  // 중요 문장 하이라이팅 (importantInfo가 나중에 도착해도 반영)
  useEffect(() => {
    const allChars = charBoxesRef.current;
    if (!importantInfo?.keywords?.length || !allChars.length) {
      setImportantHighlights([]);
      return;
    }

    console.log(`[중요하이라이트] 페이지 ${pageNum}: ${importantInfo.keywords.length}개 문장`, importantInfo.keywords.map(k => k.keyword.substring(0, 20)));
    const fullText = allChars.map((c) => c.char).join("");
    const kwFound = [];

    for (let ki = 0; ki < importantInfo.keywords.length; ki++) {
      const kw = importantInfo.keywords[ki];
      const sentence = kw.keyword;
      const normalizedSentence = sentence.replace(/\s+/g, "");
      const normalizedFull = fullText.replace(/\s+/g, "");

      let searchPos = 0;
      let nIdx;
      console.log(`[중요하이라이트] 검색: "${normalizedSentence.substring(0, 30)}..." found=${normalizedFull.indexOf(normalizedSentence) !== -1}`);
      while ((nIdx = normalizedFull.indexOf(normalizedSentence, searchPos)) !== -1) {
        // 정규화된 인덱스를 원본 charBox 인덱스로 변환
        let origStart = 0, normCount = 0;
        for (let ci = 0; ci < allChars.length; ci++) {
          if (allChars[ci].char.trim()) normCount++;
          if (normCount > nIdx) { origStart = ci; break; }
        }
        let origEnd = origStart, matchNorm = 0;
        for (let ci = origStart; ci < allChars.length; ci++) {
          if (allChars[ci].char.trim()) matchNorm++;
          if (matchNorm >= normalizedSentence.length) { origEnd = ci; break; }
        }

        // charBox 범위에서 줄 단위로 하이라이트 rect 생성
        const matchBoxes = allChars.slice(origStart, origEnd + 1);
        if (matchBoxes.length === 0) break;
        const lineGroups = [];
        let curLine = [matchBoxes[0]];
        for (let mi = 1; mi < matchBoxes.length; mi++) {
          if (Math.abs(matchBoxes[mi].baseY - curLine[0].baseY) < 5) {
            curLine.push(matchBoxes[mi]);
          } else {
            lineGroups.push(curLine);
            curLine = [matchBoxes[mi]];
          }
        }
        lineGroups.push(curLine);

        for (const lg of lineGroups) {
          const minX = Math.min(...lg.map((b) => b.x));
          const maxX = Math.max(...lg.map((b) => b.x + b.w));
          const minY = Math.min(...lg.map((b) => b.y));
          const maxH = Math.max(...lg.map((b) => b.h));
          kwFound.push({
            x: minX, y: minY, width: maxX - minX, height: maxH,
            keyword: sentence, explanation: kw.explanation, kwIndex: ki,
          });
        }

        searchPos = nIdx + normalizedSentence.length;
      }
    }
    console.log(`[중요하이라이트] 페이지 ${pageNum}: ${kwFound.length}개 하이라이트 생성`);
    setImportantHighlights(kwFound);
  }, [importantInfo, pageNum, charBoxesReady]);

  // 드래그 영역에서 텍스트 추출
  const extractTextFromRect = useCallback((rect) => {
    const lines = linesRef.current;
    if (!lines.length) return "";

    const minX = Math.min(rect.startX, rect.endX);
    const maxX = Math.max(rect.startX, rect.endX);
    const minY = Math.min(rect.startY, rect.endY);
    const maxY = Math.max(rect.startY, rect.endY);

    const selectedLines = [];
    for (const line of lines) {
      const sorted = [...line].sort((a, b) => a.x - b.x);
      // 라인의 Y 범위가 선택 영역과 겹치는지 확인
      const lineTop = Math.min(...sorted.map(c => c.y));
      const lineBottom = Math.max(...sorted.map(c => c.y + c.h));
      if (lineBottom < minY || lineTop > maxY) continue;

      // 이 라인에서 X 범위 안의 글자만 수집
      const chars = sorted.filter(c => {
        const cx = c.x + c.w / 2;
        const cy = c.y + c.h / 2;
        return cx >= minX && cx <= maxX && cy >= minY && cy <= maxY;
      });
      if (chars.length > 0) {
        selectedLines.push(chars.map(c => c.char).join(""));
      }
    }
    return selectedLines.join("\n");
  }, []);

  // 드래그 영역 중 실제 글자 영역만 추출
  const extractHighlightRectsFromRect = useCallback((rect) => {
    const lines = linesRef.current;
    if (!lines.length) return [];

    const minX = Math.min(rect.startX, rect.endX);
    const maxX = Math.max(rect.startX, rect.endX);
    const minY = Math.min(rect.startY, rect.endY);
    const maxY = Math.max(rect.startY, rect.endY);
    const LINE_MERGE_GAP = 2;
    const mergedRects = [];

    for (const line of lines) {
      const sorted = [...line].sort((a, b) => a.x - b.x);
      const selectedChars = sorted.filter((c) => {
        const cx = c.x + c.w / 2;
        const cy = c.y + c.h / 2;
        return cx >= minX && cx <= maxX && cy >= minY && cy <= maxY;
      });
      if (!selectedChars.length) continue;

      let start = selectedChars[0];
      let prev = selectedChars[0];

      for (let i = 1; i < selectedChars.length; i++) {
        const cur = selectedChars[i];
        const gap = cur.x - (prev.x + prev.w);
        const sameLine = Math.abs(cur.baseY - prev.baseY) <= 3;
        if (sameLine && gap <= LINE_MERGE_GAP) {
          prev = cur;
          continue;
        }

        mergedRects.push({
          x: start.x,
          y: Math.min(start.y, prev.y),
          width: prev.x + prev.w - start.x,
          height: Math.max(start.h, prev.h),
        });
        start = cur;
        prev = cur;
      }

      mergedRects.push({
        x: start.x,
        y: Math.min(start.y, prev.y),
        width: prev.x + prev.w - start.x,
        height: Math.max(start.h, prev.h),
      });
    }

    return mergedRects;
  }, []);

  // 드래그 선택 핸들러
  const handleDragStart = useCallback((e) => {
    // 메모, 스티커, 이미지, 셀, 컨텍스트 메뉴 위에서는 무시
    if (memoMode || fillMode) return;
    if (e.target.closest(".pdf-memo") || e.target.closest(".pdf-sticker") ||
        e.target.closest(".pdf-user-image") || e.target.closest(".pdf-fill-cell") ||
        e.target.closest(".pdf-context-menu")) return;
    if (e.button !== 0) return; // 좌클릭만

    const wrapper = e.currentTarget;
    const rect = wrapper.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    isDraggingRef.current = false; // 아직 드래그 시작 아님 (클릭과 구분)
    dragStartRef.current = { x, y, clientX: e.clientX, clientY: e.clientY };
  }, [memoMode, fillMode]);

  const handleDragMove = useCallback((e) => {
    if (!dragStartRef.current) return;

    const dx = e.clientX - dragStartRef.current.clientX;
    const dy = e.clientY - dragStartRef.current.clientY;

    // 최소 이동 거리 (5px) 이상이어야 드래그로 인식
    if (!isDraggingRef.current && Math.hypot(dx, dy) < 5) return;
    isDraggingRef.current = true;

    const wrapper = e.currentTarget;
    const rect = wrapper.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setDragSelection({
      startX: dragStartRef.current.x,
      startY: dragStartRef.current.y,
      endX: x,
      endY: y,
    });
  }, []);

  const handleDragEnd = useCallback((e) => {
    if (!dragStartRef.current) return;
    if (isDraggingRef.current && dragSelection) {
      const text = extractTextFromRect(dragSelection);
      if (text.trim()) {
        const normalizedSelection = {
          startX: Math.min(dragSelection.startX, dragSelection.endX),
          startY: Math.min(dragSelection.startY, dragSelection.endY),
          endX: Math.max(dragSelection.startX, dragSelection.endX),
          endY: Math.max(dragSelection.startY, dragSelection.endY),
        };
        const selectedRects = extractHighlightRectsFromRect(normalizedSelection);
        const popupX = normalizedSelection.startX + (normalizedSelection.endX - normalizedSelection.startX) / 2;
        const wrapperRect = e.currentTarget.getBoundingClientRect();
        const preferAboveY = wrapperRect.top + Math.max(8, normalizedSelection.startY - 12);
        const preferBelowY = wrapperRect.top + normalizedSelection.endY + 12;
        const placeBelow = preferAboveY < 140;
        const popupClientX = wrapperRect.left + popupX;
        const popupClientY = placeBelow ? preferBelowY : preferAboveY;

        setFixedSelectionRects(selectedRects);
        setSimplifyPopup({
          loading: true,
          error: null,
          originalText: text.trim(),
          simplifiedText: "",
          x: popupClientX,
          y: popupClientY,
          placement: placeBelow ? "below" : "above",
        });

        axios.post(`${PARSER_URL}/chat`, {
          messages: [
            {
              role: "user",
              content:
                "아래 문장을 **사회초년생·청년층**(19~34세, 설명서·계약서·법령 읽기에 어려움을 느끼는 사람)이 한 번에 이해할 수 있도록 쉬운 한국어로 바꿔줘.\n" +
                "- 한자어·법률용어·행정 전문용어를 일상 표현으로 치환\n" +
                "- 원래 의미를 절대 왜곡하지 말 것\n" +
                "- 줄바꿈 없이 하나의 이어지는 문단으로 출력\n" +
                "- 설명·주석 없이 변환된 문장만 출력\n\n" +
                text.trim(),
            },
          ],
          persona: "default",
          document_context: "",
        }).then((res) => {
          const rawReply = (res.data?.reply || "").trim();
          const cleanedReply = rawReply.replace(/\[HL:.+?\]/g, "").trim();
          setSimplifyPopup((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              loading: false,
              simplifiedText: cleanedReply || "변환 결과가 비어 있습니다.",
            };
          });
        }).catch((err) => {
          console.error("쉬운말 변환 실패:", err);
          setSimplifyPopup((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              loading: false,
              error: "변환에 실패했습니다. 다시 시도해주세요.",
            };
          });
        });
      }
    }

    isDraggingRef.current = false;
    dragStartRef.current = null;
    setDragSelection(null);
  }, [dragSelection, extractTextFromRect, extractHighlightRectsFromRect]);

  // 메모 모드에서 빈 곳 클릭 시 새 메모 추가
  const handlePageClick = useCallback((e) => {
    // 컨텍스트 메뉴가 열려있으면 닫기
    setContextMenu(null);

    if (!memoMode) return;
    const wrapper = e.currentTarget;
    const rect = wrapper.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (e.target.closest(".pdf-memo") || e.target.closest(".pdf-word-highlight")) return;

    onAddMemo?.({
      id: `memo-${pageNum}-${Date.now()}`,
      pageNum,
      x,
      y,
      text: "",
    });
  }, [memoMode, pageNum, onAddMemo]);

  // 우클릭 컨텍스트 메뉴
  const [contextMenu, setContextMenu] = useState(null);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    if (e.target.closest(".pdf-memo")) return; // 메모 위에서는 무시

    const wrapper = e.currentTarget;
    const rect = wrapper.getBoundingClientRect();
    setContextMenu({
      mouseX: e.clientX,
      mouseY: e.clientY,
      pdfX: e.clientX - rect.left,
      pdfY: e.clientY - rect.top,
    });
  }, []);

  const handleContextAddMemo = useCallback(() => {
    if (!contextMenu) return;
    onAddMemo?.({
      id: `memo-${pageNum}-${Date.now()}`,
      pageNum,
      x: contextMenu.pdfX,
      y: contextMenu.pdfY,
      text: "",
    });
    setContextMenu(null);
  }, [contextMenu, pageNum, onAddMemo]);

  // 스티커 서브메뉴 토글
  const [showStickerSub, setShowStickerSub] = useState(false);

  const handleAddStickerFromMenu = useCallback((stickerId) => {
    if (!contextMenu) return;
    onAddSticker?.({
      id: `stk-${pageNum}-${Date.now()}`,
      pageNum,
      x: contextMenu.pdfX,
      y: contextMenu.pdfY,
      stickerId,
      size: 48,
    });
    setShowStickerSub(false);
    setContextMenu(null);
  }, [contextMenu, pageNum, onAddSticker]);

  // 우클릭 메뉴에서 이미지 업로드
  const imgPosRef = useRef({ x: 100, y: 100 });

  const handleContextImageUpload = useCallback(() => {
    if (!contextMenu) return;
    imgPosRef.current = { x: contextMenu.pdfX, y: contextMenu.pdfY };
    imgInputRef.current?.click();
    setContextMenu(null);
  }, [contextMenu]);

  const handleImageFileChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      // 원본 이미지 크기를 파악한 후 페이지에 맞게 스케일링
      const img = new Image();
      img.onload = () => {
        const maxW = Math.max(pageSize.width * 0.5, 80);
        const maxH = Math.max(pageSize.height * 0.5, 80);
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > maxW) { h = h * (maxW / w); w = maxW; }
        if (h > maxH) { w = w * (maxH / h); h = maxH; }
        w = Math.max(40, Math.round(w));
        h = Math.max(40, Math.round(h));

        const pos = imgPosRef.current;
        onAddImage?.({
          id: `img-${pageNum}-${Date.now()}`,
          pageNum,
          x: pos.x,
          y: pos.y,
          width: w,
          height: h,
          src: reader.result,
        });
      };
      img.onerror = () => {
        alert("이미지를 읽을 수 없습니다.");
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, [pageNum, pageSize, onAddImage]);

  // 외부 클릭 시 컨텍스트 메뉴 닫기
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    // requestAnimationFrame으로 지연: 현재 이벤트 버블링이 끝난 뒤 리스너 등록
    const raf = requestAnimationFrame(() => {
      window.addEventListener("mousedown", close);
      window.addEventListener("scroll", close, true);
    });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [contextMenu]);

  return (
    <div
      className={`pdf-page-wrapper ${memoMode ? "memo-mode" : ""} ${importantInfo ? `important-page importance-${importantInfo.importance}` : ""}`}
      style={{ width: pageSize.width || "auto" }}
      onClick={handlePageClick}
      onContextMenu={handleContextMenu}
      onMouseDown={handleDragStart}
      onMouseMove={handleDragMove}
      onMouseUp={handleDragEnd}
      onMouseLeave={handleDragEnd}
    >
      <canvas ref={canvasRef} />

      {/* 중요 페이지 책갈피 배지 + 메모 토글 */}
      {importantInfo && (
        <>
          <div
            className={`important-page-badge importance-badge-${importantInfo.importance}`}
            onClick={(e) => { e.stopPropagation(); setShowImportantMemo((v) => !v); }}
            title="클릭하여 상세 설명 보기"
            style={{ cursor: "pointer" }}
          >
            <BookmarkCheck size={16} />
            <span className="important-badge-label">
              {importantInfo.importance === 3 ? "매우 중요" : importantInfo.importance === 2 ? "중요" : "참고"}
            </span>
            <span className="important-badge-toggle">{showImportantMemo ? "▲" : "▼"}</span>
          </div>

          {/* 메모 패널 */}
          {showImportantMemo && (
            <div className="important-memo-panel" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
              <div className="important-memo-header">
                <span>{importantInfo.importance === 3 ? "⚠️" : importantInfo.importance === 2 ? "📌" : "💡"} {importantInfo.reason}</span>
                <button className="important-memo-close" onClick={() => setShowImportantMemo(false)}>
                  <X size={13} />
                </button>
              </div>
              <div className="important-memo-body">
                <p>{importantInfo.summary || importantInfo.reason}</p>
                {importantInfo.keywords?.length > 0 && (
                  <div className="important-keywords-list">
                    <p className="important-keywords-title">주요 키워드</p>
                    {importantInfo.keywords.map((kw, ki) => (
                      <div
                        key={ki}
                        className={`important-keyword-item ${activeKeywordIdx === ki ? "active" : ""}`}
                        onClick={() => setActiveKeywordIdx(activeKeywordIdx === ki ? null : ki)}
                      >
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
      )}

      {/* 중요 키워드 하이라이트 오버레이 + 인라인 설명 토글 */}
      {importantHighlights.map((h, i) => (
        <React.Fragment key={`imp-kw-${pageNum}-${i}`}>
          <span
            className={`important-keyword-highlight ${activeKeywordIdx === i ? "active-kw" : ""}`}
            style={{
              position: "absolute",
              left: `${h.x}px`,
              top: `${h.y}px`,
              width: `${h.width}px`,
              height: `${h.height}px`,
            }}
            onClick={(e) => { e.stopPropagation(); setActiveKeywordIdx(activeKeywordIdx === i ? null : i); }}
          />
          {activeKeywordIdx === i && (
            <div
              className="important-kw-tooltip"
              style={{
                position: "absolute",
                left: `${Math.min(Math.max(0, h.x), (pageSize.width || 600) - 310)}px`,
                top: `${h.y + h.height + 4}px`,
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="important-kw-tooltip-header">
                <span className="important-kw-tooltip-word">{h.keyword}</span>
                <button className="important-kw-tooltip-close" onClick={() => setActiveKeywordIdx(null)}>
                  <X size={12} />
                </button>
              </div>
              <p className="important-kw-tooltip-explain">{h.explanation}</p>
            </div>
          )}
        </React.Fragment>
      ))}

      {/* 드래그 선택 영역 */}
      {dragSelection && (
        <div
          className="pdf-drag-selection"
          style={{
            position: "absolute",
            left: Math.min(dragSelection.startX, dragSelection.endX),
            top: Math.min(dragSelection.startY, dragSelection.endY),
            width: Math.abs(dragSelection.endX - dragSelection.startX),
            height: Math.abs(dragSelection.endY - dragSelection.startY),
          }}
        />
      )}

      {/* 선택 확정 하이라이트 (선택된 글자 영역만 표시) */}
      {fixedSelectionRects.map((rect, idx) => (
        <div
          key={`sel-fixed-${pageNum}-${idx}`}
          className="pdf-drag-text-highlight"
          style={{
            position: "absolute",
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
          }}
        />
      ))}

      {/* 쉬운말 변환 팝업 (클리핑 방지: body 포털로 렌더링) */}
      {simplifyPopup
        ? createPortal(
            <div
              className={`pdf-simplify-popup ${simplifyPopup.placement === "below" ? "pdf-simplify-popup--below" : ""}`}
              style={{ left: simplifyPopup.x, top: simplifyPopup.y }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="pdf-simplify-popup-header">
                <Sparkles size={14} />
                <span>쉬운 표현</span>
                <button
                  className="pdf-simplify-popup-close"
                  onClick={() => {
                    setSimplifyPopup(null);
                    setFixedSelectionRects([]);
                  }}
                  title="닫기"
                >
                  <X size={13} />
                </button>
              </div>
              <div className="pdf-simplify-popup-body">
                <p className="pdf-simplify-popup-label">선택 문장</p>
                <p className="pdf-simplify-popup-original">{simplifyPopup.originalText}</p>
                <p className="pdf-simplify-popup-label">변환 결과</p>
                {simplifyPopup.loading ? (
                  <p className="pdf-simplify-popup-loading">Gemini가 쉬운 표현으로 바꾸는 중...</p>
                ) : simplifyPopup.error ? (
                  <p className="pdf-simplify-popup-error">{simplifyPopup.error}</p>
                ) : (
                  <p className="pdf-simplify-popup-result">{simplifyPopup.simplifiedText}</p>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* 텍스트 레이어 없음 안내 */}
      {!hasText && (
        <div className="pdf-no-text-badge">
          스캔 PDF — 텍스트 레이어 없음
        </div>
      )}

      {/* 하이라이트 오버레이 */}
      {highlights.map((h, i) => (
        <span
          key={`hl-${pageNum}-${i}`}
          className="active-highlight-box"
          style={{
            position: "absolute",
            left: `${h.x}px`,
            top: `${h.y}px`,
            width: `${h.width}px`,
            height: `${h.height}px`,
            backgroundColor: "rgba(255, 255, 0, 0.4)",
            borderBottom: "2px solid #eab308",
            pointerEvents: "none"
          }}
        />
      ))}

      {/* 텍스트 메모 */}
      {memos.map((memo) => (
        <MemoBox
          key={memo.id}
          memo={memo}
          onUpdate={onUpdateMemo}
          onDelete={onDeleteMemo}
        />
      ))}

      {/* 스티커 */}
      {stickers.map((stk) => (
        <StickerBox
          key={stk.id}
          sticker={stk}
          onUpdate={onUpdateSticker}
          onDelete={onDeleteSticker}
        />
      ))}

      {/* 사용자 이미지 */}
      {images.map((img) => (
        <ImageBox
          key={img.id}
          image={img}
          onUpdate={onUpdateImage}
          onDelete={onDeleteImage}
        />
      ))}

      {/* 표 셀 오버레이 — 편집 모드: 입력 가능 / 모드 OFF: 채운 값 표시 */}
      {fillCells && fillCells.map((cell) => {
        const value = cellValues?.[cell.id] ?? "";
        // 모드 꺼졌을 때는 값이 있는 셀만 표시
        if (!fillMode && !value) return null;

        const x = cell.x0 * renderScale;
        const y = cell.top * renderScale;
        const w = (cell.x1 - cell.x0) * renderScale;
        const h = (cell.bottom - cell.top) * renderScale;
        const isPending = pendingCells?.has(cell.id);

        if (!fillMode) {
          // 읽기 전용 텍스트 오버레이
          return (
            <div
              key={cell.id}
              className="pdf-fill-cell pdf-fill-cell--readonly"
              style={{ left: x, top: y, width: w, height: h }}
              onClick={(e) => e.stopPropagation()}
            >
              <span className="fill-cell-readonly-text">{value}</span>
            </div>
          );
        }

        return (
          <div
            key={cell.id}
            className={`pdf-fill-cell ${isPending ? "pdf-fill-cell--pending" : value ? "pdf-fill-cell--filled" : ""}`}
            style={{ left: x, top: y, width: w, height: h }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              className="fill-cell-input"
              value={value}
              onChange={(e) => onCellValueChange?.(cell.id, e.target.value)}
              placeholder={isPending ? "" : "클릭해서 입력..."}
              title={cell.text ? `원본: ${cell.text}` : "빈 셀"}
            />
          </div>
        );
      })}

      {/* 숨겨진 file input (우클릭 메뉴용) */}
      <input
        ref={imgInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleImageFileChange}
      />

      {/* 우클릭 컨텍스트 메뉴 */}
      {contextMenu && (
        <div
          className="pdf-context-menu"
          style={{ left: contextMenu.pdfX, top: contextMenu.pdfY }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="pdf-context-menu-item" onMouseDown={(e) => { e.stopPropagation(); handleContextAddMemo(); }}>
            <MessageSquarePlus size={14} />
            메모 추가
          </button>
          <button className="pdf-context-menu-item" onMouseDown={(e) => { e.stopPropagation(); setShowStickerSub((v) => !v); }}>
            <Sticker size={14} />
            스티커 추가 ▸
          </button>
          {showStickerSub && (
            <div className="pdf-sticker-submenu" onMouseDown={(e) => e.stopPropagation()}>
              {STICKERS.map((s) => (
                <button
                  key={s.id}
                  className="pdf-sticker-pick"
                  title={s.label}
                  onMouseDown={(e) => { e.stopPropagation(); handleAddStickerFromMenu(s.id); }}
                >
                  {s.emoji}
                </button>
              ))}
            </div>
          )}
          <button className="pdf-context-menu-item" onMouseDown={(e) => { e.stopPropagation(); handleContextImageUpload(); }}>
            <ImagePlus size={14} />
            이미지 추가
          </button>
          <div className="pdf-context-menu-divider" />
          <button className="pdf-context-menu-item" onMouseDown={(e) => { e.stopPropagation(); setContextMenu(null); onDownload?.(); }}>
            <Download size={14} />
            PDF 다운로드
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   MemoBox: 드래그 가능한 텍스트 메모
   ───────────────────────────────────────── */
function MemoBox({ memo, onUpdate, onDelete }) {
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const textareaRef = useRef(null);

  // 새로 생성된 메모에 자동 포커스
  useEffect(() => {
    if (memo.text === "" && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  const handleMouseDown = (e) => {
    // 그립 영역에서만 드래그 시작
    if (!e.target.closest(".memo-grip")) return;
    e.preventDefault();
    const wrapper = e.currentTarget.closest(".pdf-page-wrapper");
    const wrapperRect = wrapper.getBoundingClientRect();
    setDragging(true);
    setOffset({
      x: e.clientX - wrapperRect.left - memo.x,
      y: e.clientY - wrapperRect.top - memo.y,
    });
  };

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e) => {
      const wrapper = document.querySelector(`.pdf-page-wrapper`);
      if (!wrapper) return;
      // 가장 가까운 wrapper 찾기
      const wrappers = document.querySelectorAll(".pdf-page-wrapper");
      for (const w of wrappers) {
        const rect = w.getBoundingClientRect();
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
          onUpdate?.(memo.id, {
            x: Math.max(0, e.clientX - rect.left - offset.x),
            y: Math.max(0, e.clientY - rect.top - offset.y),
          });
          break;
        }
      }
    };

    const handleMouseUp = () => setDragging(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, memo.id, offset, onUpdate]);

  return (
    <div
      className="pdf-memo"
      style={{ left: `${memo.x}px`, top: `${memo.y}px` }}
      onMouseDown={handleMouseDown}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="memo-header">
        <span className="memo-grip" title="드래그하여 이동">
          <GripVertical size={14} />
        </span>
        <button
          className="memo-delete-btn"
          onClick={() => onDelete?.(memo.id)}
          title="메모 삭제"
        >
          <Trash2 size={13} />
        </button>
      </div>
      <textarea
        ref={textareaRef}
        className="memo-textarea"
        value={memo.text}
        onChange={(e) => onUpdate?.(memo.id, { text: e.target.value })}
        placeholder="메모를 입력하세요..."
        rows={3}
      />
    </div>
  );
}

/* ─────────────────────────────────────────
   StickerToolbar: 툴바 내 스티커 선택 드롭다운
   ───────────────────────────────────────── */
function StickerToolbar({ onAddSticker }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const raf = requestAnimationFrame(() => {
      document.addEventListener("mousedown", close);
    });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("mousedown", close);
    };
  }, [open]);

  const handlePick = (stickerId) => {
    // 첫 번째 페이지 wrapper의 중앙에 배치
    const wrapper = document.querySelector(".pdf-page-wrapper");
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    // 페이지 번호 추출
    const allWrappers = document.querySelectorAll(".pdf-page-wrapper");
    let pNum = 1;
    allWrappers.forEach((w, idx) => { if (w === wrapper) pNum = idx + 1; });

    onAddSticker?.({
      id: `stk-${pNum}-${Date.now()}`,
      pageNum: pNum,
      x: rect.width / 2 - 24,
      y: rect.height / 3,
      stickerId,
      size: 48,
    });
    setOpen(false);
  };

  return (
    <div className="sticker-toolbar-wrapper" ref={ref}>
      <button
        className={`memo-tool-btn ${open ? "active" : ""}`}
        onClick={() => setOpen(!open)}
        title="스티커 추가"
      >
        <Sticker size={16} />
        <span>스티커</span>
      </button>
      {open && (
        <div className="sticker-toolbar-dropdown">
          {STICKERS.map((s) => (
            <button
              key={s.id}
              className="pdf-sticker-pick"
              title={s.label}
              onClick={() => handlePick(s.id)}
            >
              {s.emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   StickerBox: 드래그 가능 + 리사이즈 스티커
   ───────────────────────────────────────── */
function StickerBox({ sticker, onUpdate, onDelete }) {
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const stickerMeta = STICKERS.find((s) => s.id === sticker.stickerId);

  const handleMouseDown = (e) => {
    if (e.target.closest(".sticker-delete-btn") || e.target.closest(".sticker-resize")) return;
    e.preventDefault();
    const wrapper = e.currentTarget.closest(".pdf-page-wrapper");
    const wrapperRect = wrapper.getBoundingClientRect();
    setDragging(true);
    setOffset({
      x: e.clientX - wrapperRect.left - sticker.x,
      y: e.clientY - wrapperRect.top - sticker.y,
    });
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e) => {
      const wrappers = document.querySelectorAll(".pdf-page-wrapper");
      for (const w of wrappers) {
        const rect = w.getBoundingClientRect();
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
          onUpdate?.(sticker.id, {
            x: Math.max(0, e.clientX - rect.left - offset.x),
            y: Math.max(0, e.clientY - rect.top - offset.y),
          });
          break;
        }
      }
    };
    const handleMouseUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, sticker.id, offset, onUpdate]);

  // 리사이즈 핸들
  const [resizing, setResizing] = useState(false);
  const resizeStart = useRef({ mouseX: 0, initSize: 0 });

  const handleResizeDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(true);
    resizeStart.current = { mouseX: e.clientX, initSize: sticker.size };
  };

  useEffect(() => {
    if (!resizing) return;
    const handleMouseMove = (e) => {
      const delta = e.clientX - resizeStart.current.mouseX;
      const newSize = Math.max(24, Math.min(200, resizeStart.current.initSize + delta));
      onUpdate?.(sticker.id, { size: newSize });
    };
    const handleMouseUp = () => setResizing(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizing, sticker.id, onUpdate]);

  return (
    <div
      className="pdf-sticker"
      style={{
        left: `${sticker.x}px`,
        top: `${sticker.y}px`,
        width: `${sticker.size}px`,
        height: `${sticker.size}px`,
        fontSize: `${sticker.size * 0.75}px`,
      }}
      onMouseDown={handleMouseDown}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="sticker-emoji">{stickerMeta?.emoji || "❓"}</span>
      <button
        className="sticker-delete-btn"
        onClick={() => onDelete?.(sticker.id)}
        title="스티커 삭제"
      >
        <Trash2 size={11} />
      </button>
      <div className="sticker-resize" onMouseDown={handleResizeDown} />
    </div>
  );
}

/* ─────────────────────────────────────────
   ImageBox: 드래그 + 비율 리사이즈 이미지
   ───────────────────────────────────────── */
function ImageBox({ image, onUpdate, onDelete }) {
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e) => {
    if (e.target.closest(".img-delete-btn") || e.target.closest(".img-resize")) return;
    e.preventDefault();
    const wrapper = e.currentTarget.closest(".pdf-page-wrapper");
    const wrapperRect = wrapper.getBoundingClientRect();
    setDragging(true);
    setOffset({
      x: e.clientX - wrapperRect.left - image.x,
      y: e.clientY - wrapperRect.top - image.y,
    });
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e) => {
      const wrappers = document.querySelectorAll(".pdf-page-wrapper");
      for (const w of wrappers) {
        const rect = w.getBoundingClientRect();
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
          onUpdate?.(image.id, {
            x: Math.max(0, e.clientX - rect.left - offset.x),
            y: Math.max(0, e.clientY - rect.top - offset.y),
          });
          break;
        }
      }
    };
    const handleMouseUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, image.id, offset, onUpdate]);

  // 우하단 리사이즈 (비율 유지)
  const [resizing, setResizing] = useState(false);
  const resizeStart = useRef({ mouseX: 0, initW: 0, initH: 0 });

  const handleResizeDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(true);
    resizeStart.current = {
      mouseX: e.clientX,
      initW: image.width,
      initH: image.height,
    };
  };

  useEffect(() => {
    if (!resizing) return;
    const handleMouseMove = (e) => {
      const dx = e.clientX - resizeStart.current.mouseX;
      const ratio = resizeStart.current.initW / resizeStart.current.initH;
      const newW = Math.max(40, resizeStart.current.initW + dx);
      const newH = Math.max(40, newW / ratio);
      onUpdate?.(image.id, { width: Math.round(newW), height: Math.round(newH) });
    };
    const handleMouseUp = () => setResizing(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizing, image.id, onUpdate]);

  return (
    <div
      className="pdf-user-image"
      style={{
        left: `${image.x}px`,
        top: `${image.y}px`,
        width: `${image.width}px`,
        height: `${image.height}px`,
      }}
      onMouseDown={handleMouseDown}
      onClick={(e) => e.stopPropagation()}
    >
      <img src={image.src} alt="user" draggable={false} />
      <button
        className="img-delete-btn"
        onClick={() => onDelete?.(image.id)}
        title="이미지 삭제"
      >
        <Trash2 size={11} />
      </button>
      <div className="img-resize" onMouseDown={handleResizeDown} />
    </div>
  );
}

/* ─────────────────────────────────────────
   PdfHighlightViewer: PDF 전체 페이지 뷰어
   ───────────────────────────────────────── */
export default function PdfHighlightViewer({ pdfUrl, highlightWord, parsedText, onCellsFetched, externalSuggestions, docType = "default" }) {
  const containerRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // 메모 관련 상태
  const [memoMode, setMemoMode] = useState(false);
  const [memos, setMemos] = useState([]);     // { id, pageNum, x, y, text }

  // 양식 채우기 관련 상태
  const [fillMode, setFillMode] = useState(false);
  const [tableCells, setTableCells] = useState([]);   // 백엔드에서 받은 페이지별 셀
  const [cellValues, setCellValues] = useState({});   // { cellId: string }
  const [pendingCells, setPendingCells] = useState(new Set());  // AI 제안 대기 중인 셀 ID
  const [fetchingCells, setFetchingCells] = useState(false);
  const [aiFillingCells, setAiFillingCells] = useState(false);
  const [fillMessage, setFillMessage] = useState("");

  // 양식 채우기: 셀 좌표 가져오기
  const handleToggleFillMode = useCallback(async () => {
    if (fillMode) {
      setFillMode(false);
      return;
    }
    if (!pdfUrl || pdfUrl === "/sample.pdf") return;

    setFetchingCells(true);
    setFillMessage("표 구조 분석 중...");
    try {
      // URL 타입 무관하게 blob fetch → 파일로 전송
      const pdfBlob = await fetch(pdfUrl).then((r) => r.blob());
      const formData = new FormData();
      formData.append("file", pdfBlob, "document.pdf");
      const res = await axios.post(`${PARSER_URL}/parse/table-cells-file`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (res.data.error) throw new Error(res.data.error);
      const pages = res.data.pages || [];
      setTableCells(pages);
      onCellsFetched?.(pages);
      const totalCells = pages.reduce((s, p) => s + p.cells.length, 0);
      const emptyCells = (res.data.pages || []).reduce(
        (s, p) => s + p.cells.filter((c) => c.is_empty).length, 0
      );
      setFillMessage(`표 감지 완료 — 전체 ${totalCells}개 셀, 빈 셀 ${emptyCells}개`);
      setFillMode(true);
    } catch (err) {
      console.error("셀 분석 실패:", err);
      setFillMessage("표 분석에 실패했습니다.");
    } finally {
      setFetchingCells(false);
    }
  }, [fillMode, pdfUrl]);

  // 외부(에이전트 어시스트)에서 주입된 제안 적용
  const lastExternalRef = useRef(null);
  useEffect(() => {
    if (!externalSuggestions || externalSuggestions === lastExternalRef.current) return;
    lastExternalRef.current = externalSuggestions;
    if (!externalSuggestions.length) return;

    // 양식 채우기 모드가 꺼져 있으면 자동으로 켜야 하므로 cells 로드 필요
    // (tableCells가 이미 있으면 바로 적용, 없으면 무시 - Viewer가 순서 보장)
    const newValues = { ...cellValues };
    const newPending = new Set(pendingCells);
    externalSuggestions.forEach(({ cell_id, value }) => {
      if (value) {
        newValues[cell_id] = value;
        newPending.add(cell_id);
      }
    });
    setCellValues(newValues);
    setPendingCells(newPending);
    setFillMode(true);
    setFillMessage(`에이전트가 ${externalSuggestions.length}개 셀을 채웠습니다. 확인 후 수정하세요.`);
  }, [externalSuggestions]);

  // AI 자동 채우기
  const handleAiFill = useCallback(async () => {
    const allCells = tableCells.flatMap((p) => p.cells);
    if (!allCells.length) return;
    setAiFillingCells(true);
    setFillMessage("AI가 내용을 분석하는 중...");
    try {
      const res = await axios.post(`${PARSER_URL}/chat/fill-cells`, {
        cells: allCells,
        document_context: parsedText || "",
      });
      const suggestions = res.data.suggestions || [];
      if (!suggestions.length) {
        setFillMessage(res.data.message || "AI가 제안할 내용을 찾지 못했습니다.");
        return;
      }
      const newValues = { ...cellValues };
      const newPending = new Set(pendingCells);
      suggestions.forEach(({ cell_id, value }) => {
        if (value) {
          newValues[cell_id] = value;
          newPending.add(cell_id);
        }
      });
      setCellValues(newValues);
      setPendingCells(newPending);
      setFillMessage(res.data.message || `AI가 ${suggestions.length}개 셀을 채웠습니다. 내용을 확인 후 수정하세요.`);
    } catch (err) {
      console.error("AI 채우기 실패:", err);
      setFillMessage("AI 채우기에 실패했습니다.");
    } finally {
      setAiFillingCells(false);
    }
  }, [tableCells, parsedText, cellValues, pendingCells]);

  // 셀 값 변경
  const handleCellValueChange = useCallback((cellId, value) => {
    setCellValues((prev) => ({ ...prev, [cellId]: value }));
    // 사용자가 직접 편집하면 pending 해제
    setPendingCells((prev) => {
      const next = new Set(prev);
      next.delete(cellId);
      return next;
    });
  }, []);

  // AI 제안 전체 수락 (pending 상태만 해제, 값은 유지)
  const handleAcceptAll = useCallback(() => {
    setPendingCells(new Set());
    setFillMessage("모든 제안을 수락했습니다.");
  }, []);

  const handleAddMemo = useCallback((memo) => {
    setMemos((prev) => [...prev, memo]);
  }, []);

  const handleUpdateMemo = useCallback((id, updates) => {
    setMemos((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
    );
  }, []);

  const handleDeleteMemo = useCallback((id) => {
    setMemos((prev) => prev.filter((m) => m.id !== id));
  }, []);

  // 스티커 관련 상태
  const [stickers, setStickers] = useState([]);   // { id, pageNum, x, y, stickerId, size }

  const handleAddSticker = useCallback((stk) => {
    setStickers((prev) => [...prev, stk]);
  }, []);

  const handleUpdateSticker = useCallback((id, updates) => {
    setStickers((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  }, []);

  const handleDeleteSticker = useCallback((id) => {
    setStickers((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // 중요 페이지 분석 상태
  const [importantPages, setImportantPages] = useState([]);
  const [analyzingImportant, setAnalyzingImportant] = useState(false);

  // 이미지 관련 상태
  const [images, setImages] = useState([]);   // { id, pageNum, x, y, width, height, src }
  const toolbarImgInputRef = useRef(null);

  const handleAddImage = useCallback((img) => {
    setImages((prev) => [...prev, img]);
  }, []);

  const handleUpdateImage = useCallback((id, updates) => {
    setImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, ...updates } : img))
    );
  }, []);

  const handleDeleteImage = useCallback((id) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  const handleToolbarImageUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // 첫 페이지 기준으로 스케일링
        const wrapper = document.querySelector(".pdf-page-wrapper");
        const maxW = wrapper ? wrapper.clientWidth * 0.5 : 300;
        const maxH = wrapper ? wrapper.clientHeight * 0.5 : 400;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > maxW) { h = h * (maxW / w); w = maxW; }
        if (h > maxH) { w = w * (maxH / h); h = maxH; }
        w = Math.max(40, Math.round(w));
        h = Math.max(40, Math.round(h));

        handleAddImage({
          id: `img-1-${Date.now()}`,
          pageNum: 1,
          x: 100,
          y: 100,
          width: w,
          height: h,
          src: reader.result,
        });
      };
      img.onerror = () => alert("이미지를 읽을 수 없습니다.");
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, [handleAddImage]);

  // PDF + 메모 + 스티커 + 이미지 다운로드
  const [downloading, setDownloading] = useState(false);

  const handleDownloadPdf = useCallback(async () => {
    if (!pdfDoc || downloading) return;
    setDownloading(true);

    try {
      const pageCanvases = containerRef.current?.querySelectorAll(".pdf-page-wrapper");
      if (!pageCanvases?.length) return;

      let pdf = null;

      for (let i = 0; i < numPages; i++) {
        const wrapper = pageCanvases[i];
        const srcCanvas = wrapper.querySelector("canvas");
        if (!srcCanvas) continue;

        const cw = srcCanvas.width;
        const ch = srcCanvas.height;

        // 합성 캔버스 생성 (원본 + 메모)
        const comp = document.createElement("canvas");
        comp.width = cw;
        comp.height = ch;
        const ctx = comp.getContext("2d");

        // 1) 원본 캔버스 복사
        ctx.drawImage(srcCanvas, 0, 0);

        // 2) 해당 페이지 메모 그리기
        const pageMemos = memos.filter((m) => m.pageNum === i + 1);
        const dpr = window.devicePixelRatio || 1;

        for (const memo of pageMemos) {
          if (!memo.text?.trim()) continue;

          const mx = memo.x * dpr;
          const my = memo.y * dpr;
          const memoW = 180 * dpr;
          const fontSize = 12 * dpr;
          const pad = 8 * dpr;
          const lineHeight = fontSize * 1.4;

          // 텍스트 줄바꿈 계산
          ctx.font = `${fontSize}px sans-serif`;
          const words = memo.text.split("");
          const lines = [];
          let currentLine = "";
          for (const ch of words) {
            const testLine = currentLine + ch;
            if (ctx.measureText(testLine).width > memoW - pad * 2) {
              lines.push(currentLine);
              currentLine = ch;
            } else {
              currentLine = testLine;
            }
          }
          if (currentLine) lines.push(currentLine);

          const headerH = 20 * dpr;
          const memoH = headerH + pad + lines.length * lineHeight + pad;

          // 그림자
          ctx.save();
          ctx.shadowColor = "rgba(0,0,0,0.15)";
          ctx.shadowBlur = 6 * dpr;
          ctx.shadowOffsetY = 2 * dpr;

          // 메모 배경
          ctx.fillStyle = "#fef9c3";
          ctx.beginPath();
          const r = 4 * dpr;
          ctx.roundRect(mx, my, memoW, memoH, r);
          ctx.fill();
          ctx.restore();

          // 헤더
          ctx.fillStyle = "#fde047";
          ctx.beginPath();
          ctx.roundRect(mx, my, memoW, headerH, [r, r, 0, 0]);
          ctx.fill();

          // 테두리
          ctx.strokeStyle = "#d4a800";
          ctx.lineWidth = 1 * dpr;
          ctx.beginPath();
          ctx.roundRect(mx, my, memoW, memoH, r);
          ctx.stroke();

          // 텍스트
          ctx.fillStyle = "#374151";
          ctx.font = `${fontSize}px sans-serif`;
          lines.forEach((line, li) => {
            ctx.fillText(line, mx + pad, my + headerH + pad + (li + 1) * lineHeight - fontSize * 0.3);
          });
        }

        // 3) 해당 페이지 스티커 그리기
        const pageStickers = stickers.filter((s) => s.pageNum === i + 1);

        for (const stk of pageStickers) {
          const stickerMeta = STICKERS.find((s) => s.id === stk.stickerId);
          if (!stickerMeta) continue;

          const sx = stk.x * dpr;
          const sy = stk.y * dpr;
          const sSize = stk.size * dpr;

          ctx.save();
          ctx.font = `${sSize * 0.75}px sans-serif`;
          ctx.textBaseline = "top";
          ctx.fillText(stickerMeta.emoji, sx + sSize * 0.1, sy + sSize * 0.1);
          ctx.restore();
        }

        // 4) 채워진 셀 텍스트 그리기 (양식 채우기 모드 여부 무관)
        if (tableCells.length > 0 && Object.keys(cellValues).length > 0) {
          const pageData = tableCells.find((p) => p.page === i + 1);
          if (pageData) {
            const cssWidth = parseFloat(srcCanvas.style.width);
            const fillScale = cssWidth / pageData.page_width;

            for (const cell of pageData.cells) {
              const value = cellValues[cell.id];
              if (!value) continue;

              const cx = cell.x0 * fillScale * dpr;
              const cy = cell.top * fillScale * dpr;
              const cw = (cell.x1 - cell.x0) * fillScale * dpr;
              const ch = (cell.bottom - cell.top) * fillScale * dpr;
              const fontSize = Math.max(8, Math.min(ch * 0.55, 13)) * dpr;

              ctx.save();
              // 흰 배경으로 원본 덮기
              ctx.fillStyle = "rgba(255,255,255,0.92)";
              ctx.fillRect(cx + 1, cy + 1, cw - 2, ch - 2);
              // 텍스트 클리핑
              ctx.beginPath();
              ctx.rect(cx + 2, cy + 2, cw - 4, ch - 4);
              ctx.clip();
              ctx.fillStyle = "#1a1a1a";
              ctx.font = `${fontSize}px sans-serif`;
              ctx.textBaseline = "middle";
              ctx.fillText(value, cx + 4, cy + ch / 2);
              ctx.restore();
            }
          }
        }

        // 5) 해당 페이지 이미지 그리기
        const pageImages = images.filter((img) => img.pageNum === i + 1);

        for (const img of pageImages) {
          await new Promise((resolve) => {
            const imgEl = new Image();
            imgEl.onload = () => {
              ctx.drawImage(
                imgEl,
                img.x * dpr,
                img.y * dpr,
                img.width * dpr,
                img.height * dpr
              );
              resolve();
            };
            imgEl.onerror = resolve;
            imgEl.src = img.src;
          });
        }

        // jsPDF 페이지 추가
        const orientation = cw > ch ? "l" : "p";
        const pxToMm = (px) => (px * 25.4) / 96 / dpr;
        const wMm = pxToMm(cw);
        const hMm = pxToMm(ch);

        if (i === 0) {
          pdf = new jsPDF({ orientation, unit: "mm", format: [wMm, hMm] });
        } else {
          pdf.addPage([wMm, hMm], orientation);
        }

        const imgData = comp.toDataURL("image/jpeg", 0.92);
        pdf.addImage(imgData, "JPEG", 0, 0, wMm, hMm);
      }

      if (pdf) {
        pdf.save("EasyDOC_메모.pdf");
      }
    } catch (err) {
      console.error("PDF 다운로드 실패:", err);
      alert("PDF 다운로드에 실패했습니다.");
    } finally {
      setDownloading(false);
    }
  }, [pdfDoc, numPages, memos, stickers, images, downloading]);

  // 컨테이너 너비 자동 추적 (리사이즈 대응)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => setContainerWidth(el.clientWidth - 32);
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // PDF 문서 로드
  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const doc = await pdfjsLib.getDocument({
          url: pdfUrl,
          cMapUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/cmaps/`,
          cMapPacked: true,
        }).promise;

        if (!cancelled) {
          setPdfDoc(doc);
          setNumPages(doc.numPages);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("PDF 로드 실패:", err);
          setError("PDF를 로드할 수 없습니다.");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  // 중요 페이지 분석 (PDF 로드 완료 후 자동 실행)
  useEffect(() => {
    console.log("[중요페이지] useEffect 진입 - pdfDoc:", !!pdfDoc, "importantPages:", importantPages.length);
    if (!pdfDoc || importantPages.length > 0) return;
    let cancelled = false;

    (async () => {
      setAnalyzingImportant(true);
      console.log("[중요페이지] 페이지별 텍스트 추출 시작...");
      try {
        const pageTexts = [];
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const page = await pdfDoc.getPage(i);
          const content = await page.getTextContent();
          const text = content.items.map((item) => item.str).join(" ");
          if (text.trim()) {
            pageTexts.push({ page: i, text });
          }
        }
        console.log(`[중요페이지] 텍스트 추출 완료 - ${pageTexts.length}/${pdfDoc.numPages} 페이지`);
        if (cancelled || pageTexts.length === 0) {
          console.log("[중요페이지] 취소됨 또는 텍스트 없음");
          return;
        }

        console.log(`[중요페이지] API 요청 중... (doc_type=${docType})`, `${PARSER_URL}/analyze-important-pages`);
        const res = await axios.post(`${PARSER_URL}/analyze-important-pages`, {
          pages: pageTexts,
          doc_type: docType,
        });
        console.log("[중요페이지] API 응답:", res.data);
        if (!cancelled && res.data.important_pages) {
          setImportantPages(res.data.important_pages);
          console.log("[중요페이지] 중요 페이지 설정 완료:", res.data.important_pages);
        }
      } catch (err) {
        console.error("[중요페이지] 분석 실패:", err);
      } finally {
        if (!cancelled) setAnalyzingImportant(false);
      }
    })();

    return () => { cancelled = true; };
  }, [pdfDoc, docType]);

  if (loading) {
    return (
      <div className="pdf-highlight-viewer" ref={containerRef}>
        <div className="pdf-status-msg">PDF 로딩 중...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pdf-highlight-viewer" ref={containerRef}>
        <div className="pdf-status-msg">{error}</div>
      </div>
    );
  }

  return (
    <div className="pdf-highlight-viewer" ref={containerRef}>
      {/* 메모 툴바 */}
      <div className="pdf-memo-toolbar">
        <button
          className={`memo-tool-btn ${memoMode ? "active" : ""}`}
          onClick={() => setMemoMode(!memoMode)}
          title={memoMode ? "메모 모드 끄기" : "메모 모드 켜기"}
        >
          <Type size={16} />
          <span>메모</span>
        </button>
        {memos.length > 0 && (
          <span className="memo-count">{memos.length}개</span>
        )}

        {/* 양식 채우기 버튼 */}
        <button
          className={`memo-tool-btn ${fillMode ? "active" : ""}`}
          onClick={handleToggleFillMode}
          disabled={fetchingCells}
          title={fillMode ? "양식 채우기 끄기" : "표 셀을 직접 채우거나 AI로 자동 채우기"}
        >
          <ClipboardEdit size={16} />
          <span>{fetchingCells ? "분석 중..." : "양식 채우기"}</span>
        </button>

        {/* AI 자동 채우기 (양식 모드 활성 시만) */}
        {fillMode && (
          <button
            className="memo-tool-btn fill-ai-btn"
            onClick={handleAiFill}
            disabled={aiFillingCells}
            title="AI가 빈 셀 내용을 자동으로 제안"
          >
            <Sparkles size={16} />
            <span>{aiFillingCells ? "AI 분석 중..." : "AI 자동 채우기"}</span>
          </button>
        )}

        {/* 전체 수락 (AI 제안이 있을 때) */}
        {fillMode && pendingCells.size > 0 && (
          <button
            className="memo-tool-btn fill-accept-btn"
            onClick={handleAcceptAll}
            title="AI 제안 전체 수락"
          >
            <CheckCheck size={16} />
            <span>전체 수락 ({pendingCells.size})</span>
          </button>
        )}

        <StickerToolbar onAddSticker={handleAddSticker} />
        {stickers.length > 0 && (
          <span className="memo-count">🌟 {stickers.length}</span>
        )}

        {/* 중요 페이지 책갈피 */}
        <div className="bookmark-indicator">
          {analyzingImportant ? (
            <span className="memo-tool-btn bookmark-analyzing">
              <Loader2 size={16} className="spin-icon" />
              <span>분석 중...</span>
            </span>
          ) : importantPages.length > 0 ? (
            <span className="memo-tool-btn bookmark-result" title={importantPages.map((p) => `p.${p.page}: ${p.reason}`).join("\n")}>
              <Bookmark size={16} />
              <span>중요 {importantPages.length}페이지</span>
            </span>
          ) : null}
        </div>

        <button
          className="memo-tool-btn"
          onClick={() => toolbarImgInputRef.current?.click()}
          title="이미지 추가"
        >
          <ImagePlus size={16} />
          <span>이미지</span>
        </button>
        <input
          ref={toolbarImgInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleToolbarImageUpload}
        />
        {images.length > 0 && (
          <span className="memo-count">🖼️ {images.length}</span>
        )}

        <button
          className="memo-tool-btn download-btn"
          onClick={handleDownloadPdf}
          disabled={downloading}
          title="메모 포함 PDF 다운로드"
        >
          <Download size={16} />
          <span>{downloading ? "저장 중..." : "다운로드"}</span>
        </button>
      </div>

      {/* 양식 채우기 안내 배너 */}
      {fillMode && fillMessage && (
        <div className="fill-mode-banner">
          <Sparkles size={13} />
          <span>{fillMessage}</span>
          <button className="fill-banner-close" onClick={() => setFillMessage("")} title="닫기">
            <X size={13} />
          </button>
        </div>
      )}

      {containerWidth > 0 &&
        Array.from({ length: numPages }, (_, i) => {
          const pageNum = i + 1;
          return (
            <PdfPage
              key={i}
              pdfDoc={pdfDoc}
              pageNum={pageNum}
              containerWidth={containerWidth}
              highlightWord={highlightWord}
              memoMode={memoMode}
              memos={memos.filter((m) => m.pageNum === pageNum)}
              onAddMemo={handleAddMemo}
              onUpdateMemo={handleUpdateMemo}
              onDeleteMemo={handleDeleteMemo}
              onDownload={handleDownloadPdf}
              stickers={stickers.filter((s) => s.pageNum === pageNum)}
              onAddSticker={handleAddSticker}
              onUpdateSticker={handleUpdateSticker}
              onDeleteSticker={handleDeleteSticker}
              images={images.filter((img) => img.pageNum === pageNum)}
              onAddImage={handleAddImage}
              onUpdateImage={handleUpdateImage}
              onDeleteImage={handleDeleteImage}
              fillMode={fillMode}
              fillCells={tableCells.find((p) => p.page === pageNum)?.cells || []}
              cellValues={cellValues}
              pendingCells={pendingCells}
              onCellValueChange={handleCellValueChange}
              importantInfo={importantPages.find((p) => p.page === pageNum) || null}
            />
          );
        })}
    </div>
  );
}
