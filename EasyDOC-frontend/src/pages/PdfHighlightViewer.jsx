import React, { useState, useRef, useEffect } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "./PdfHighlightViewer.css";

// PDF.js 워커 설정 (로컬 번들)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/* ─────────────────────────────────────────
   PdfPage: 단일 PDF 페이지 렌더링 + 하이라이트
   ───────────────────────────────────────── */
function PdfPage({ pdfDoc, pageNum, containerWidth, difficultWords }) {
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);   // 현재 진행 중인 렌더 작업 추적
  const [highlights, setHighlights] = useState([]);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [hasText, setHasText] = useState(true);

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

        /* ── 텍스트 좌표 추출 ── */
        const textContent = await page.getTextContent();
        if (cancelled) return;

        const vpT = viewport.transform;

        // 각 텍스트 아이템 → 화면 좌표로 변환
        const charBoxes = [];
        for (const item of textContent.items) {
          const str = item.str;
          if (!str) continue;

          const itm = item.transform;
          // combined = viewportTransform × itemTransform
          const ct = [
            vpT[0] * itm[0] + vpT[2] * itm[1],
            vpT[1] * itm[0] + vpT[3] * itm[1],
            vpT[0] * itm[2] + vpT[2] * itm[3],
            vpT[1] * itm[2] + vpT[3] * itm[3],
            vpT[0] * itm[4] + vpT[2] * itm[5] + vpT[4],
            vpT[1] * itm[4] + vpT[3] * itm[5] + vpT[5],
          ];

          // 폰트 높이: ct[0],ct[1]이 수평 방향, ct[2],ct[3]가 수직 방향
          const fontH = Math.hypot(ct[0], ct[1]);
          const baseX = ct[4];
          const baseY = ct[5];

          let textW;
          if (item.width && item.width > 0) {
            textW = item.width * viewport.scale;
          } else {
            textW = str.length * fontH * 0.6;
          }

          const charW = textW / (str.length || 1);

          // 문자열의 각 글자를 개별 박스로 저장
          // 상단 y = baseY - fontH (PDF는 아래→위 좌표계, 뷰포트 변환 후 위→아래)
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

        console.log(
          `[PdfHL] 페이지 ${pageNum}: 글자 박스 ${charBoxes.length}개, 어려운 단어 ${difficultWords.length}개`
        );

        if (charBoxes.length === 0) {
          console.warn(`[PdfHL] 페이지 ${pageNum}: 텍스트 레이어 없음`);
          setHasText(false);
          setHighlights([]);
          return;
        }
        setHasText(true);

        // ── 같은 줄의 글자들을 그룹핑 (Y좌표 근접 + X좌표 순서) ──
        const LINE_TOLERANCE = 5; // px 이내면 같은 줄
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

        // ── 각 줄에서 어려운 단어 매칭 (긴 단어 우선, 중복 방지, 단어 경계 체크) ──
        const sortedWords = [...difficultWords].sort(
          (a, b) => b.word.length - a.word.length
        );

        // 한글 음절 범위 체크 (가~힣)
        const isKorean = (ch) => ch && ch.charCodeAt(0) >= 0xAC00 && ch.charCodeAt(0) <= 0xD7A3;

        const found = [];

        for (const line of lines) {
          line.sort((a, b) => a.x - b.x);
          const lineStr = line.map((c) => c.char).join("");

          // 이미 하이라이트된 글자 인덱스 추적
          const taken = new Set();

          for (const info of sortedWords) {
            const word = info.word;
            let searchPos = 0;
            let idx;

            while ((idx = lineStr.indexOf(word, searchPos)) !== -1) {
              // 단어 경계 체크: 앞뒤에 한글이 붙어있으면 부분 매칭 → 스킵
              const charBefore = idx > 0 ? lineStr[idx - 1] : null;
              const charAfter = idx + word.length < lineStr.length ? lineStr[idx + word.length] : null;
              const boundaryOk = !isKorean(charBefore) && !isKorean(charAfter);

              // 이 범위가 이미 점유되어 있는지 확인
              let overlap = false;
              for (let ci = idx; ci < idx + word.length; ci++) {
                if (taken.has(ci)) {
                  overlap = true;
                  break;
                }
              }

              if (boundaryOk && !overlap) {
                const startBox = line[idx];
                const endBox = line[idx + word.length - 1];

                if (startBox && endBox) {
                  found.push({
                    x: startBox.x,
                    y: Math.min(startBox.y, endBox.y),
                    width: endBox.x + endBox.w - startBox.x,
                    height: Math.max(startBox.h, endBox.h),
                    word,
                    info,
                  });

                  // 점유 표시
                  for (let ci = idx; ci < idx + word.length; ci++) {
                    taken.add(ci);
                  }
                }
              }

              searchPos = idx + word.length;
            }
          }
        }

        console.log(`[PdfHL] 페이지 ${pageNum}: 하이라이트 ${found.length}개 발견`);
        if (found.length > 0) {
          console.log(`  [예시]`, found[0]);
        }
        setHighlights(found);
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
  }, [pdfDoc, pageNum, containerWidth, difficultWords]);

  return (
    <div
      className="pdf-page-wrapper"
      style={{ width: pageSize.width || "auto" }}
    >
      <canvas ref={canvasRef} />

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
          className={`pdf-word-highlight level-${h.info.level}`}
          style={{
            left: `${h.x}px`,
            top: `${h.y}px`,
            width: `${h.width}px`,
            height: `${h.height}px`,
          }}
        >
          {/* 말풍선 툴팁 (hover 시 표시) */}
          <span className="word-bubble">
            <strong>{h.word}</strong>
            <span className="word-bubble-desc">
              {h.info.easy_expression || `난이도 ${h.info.level} 단어`}
            </span>
          </span>
        </span>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────
   PdfHighlightViewer: PDF 전체 페이지 뷰어
   ───────────────────────────────────────── */
export default function PdfHighlightViewer({ pdfUrl, difficultWords = [] }) {
  const containerRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [containerWidth, setContainerWidth] = useState(0);

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
      {containerWidth > 0 &&
        Array.from({ length: numPages }, (_, i) => (
          <PdfPage
            key={i}
            pdfDoc={pdfDoc}
            pageNum={i + 1}
            containerWidth={containerWidth}
            difficultWords={difficultWords}
          />
        ))}
    </div>
  );
}
