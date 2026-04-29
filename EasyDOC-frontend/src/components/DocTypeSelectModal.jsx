import React, { useEffect, useState } from "react";
import axios from "axios";
import "./DocTypeSelectModal.css";

const PARSER_URL = "http://localhost:8000";

export default function DocTypeSelectModal({ open, fileName, onConfirm, onCancel }) {
  const [types, setTypes] = useState([]);
  const [defaultId, setDefaultId] = useState("default");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    axios
      .get(`${PARSER_URL}/document-types`)
      .then((res) => {
        if (cancelled) return;
        setTypes(res.data?.types || []);
        setDefaultId(res.data?.default_id || "default");
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[DocTypeSelectModal] 유형 목록 로딩 실패:", err);
        setError("문서 유형을 불러오지 못했습니다. 기본 모드로 진행할 수 있습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) setSelected(null);
  }, [open]);

  if (!open) return null;

  const handleConfirm = () => {
    onConfirm(selected || defaultId);
  };

  const handleSkip = () => {
    onConfirm(defaultId);
  };

  return (
    <div
      className="terms-modal-overlay"
      onClick={onCancel}
      onKeyDown={(e) => e.key === "Escape" && onCancel?.()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="doctype-modal-title"
    >
      <div
        className="terms-modal-content doctype-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="terms-modal-header">
          <h2 id="doctype-modal-title" className="terms-modal-title">
            문서 유형 선택
          </h2>
          <button
            type="button"
            className="terms-modal-close"
            onClick={onCancel}
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        <div className="terms-modal-body doctype-modal-body">
          <p className="doctype-modal-subtitle">
            업로드할 문서의 유형을 선택해 주세요.
            {fileName ? <span className="doctype-modal-filename"> ({fileName})</span> : null}
          </p>

          {error && <div className="doctype-modal-error">{error}</div>}

          {loading ? (
            <div className="doctype-modal-loading">유형 목록을 불러오는 중...</div>
          ) : (
            <div className="doctype-grid">
              {types.map((t) => {
                const isSelected = (selected || defaultId) === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`doctype-card${isSelected ? " selected" : ""}`}
                    onClick={() => setSelected(t.id)}
                  >
                    <div className="doctype-card-icon" aria-hidden="true">
                      {t.icon || "📄"}
                    </div>
                    <div className="doctype-card-label">{t.label}</div>
                    <div className="doctype-card-desc">{t.description}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="doctype-modal-footer">
          <button
            type="button"
            className="doctype-btn-secondary"
            onClick={handleSkip}
          >
            잘 모르겠어요
          </button>
          <button
            type="button"
            className="doctype-btn-primary"
            onClick={handleConfirm}
            disabled={loading}
          >
            이 유형으로 분석
          </button>
        </div>
      </div>
    </div>
  );
}
