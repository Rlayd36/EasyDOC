import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./DocTypeSelectModal.css";

const PARSER_URL = "http://localhost:8000";

// 검색용 정규화: 공백/대소문자 차이를 무시
const norm = (s) => (s || "").toString().toLowerCase().replace(/\s+/g, "");

export default function DocTypeSelectModal({ open, fileName, onConfirm, onCancel }) {
  const [registry, setRegistry] = useState({ categories: [], types: [], default_id: "default" });
  const [selectedCategory, setSelectedCategory] = useState(null); // null = 카테고리 화면
  const [selectedType, setSelectedType] = useState(null);
  const [query, setQuery] = useState("");
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
        setRegistry({
          categories: res.data?.categories || [],
          types: res.data?.types || [],
          default_id: res.data?.default_id || "default",
        });
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

  // 모달이 닫힐 때 상태 초기화
  useEffect(() => {
    if (!open) {
      setSelectedCategory(null);
      setSelectedType(null);
      setQuery("");
    }
  }, [open]);

  const { categories, types, default_id: defaultId } = registry;

  // 카테고리별 유형 그룹핑 (카테고리 화면에서 카운트 표시용)
  const typesByCategory = useMemo(() => {
    const map = {};
    for (const t of types) {
      if (!t.category) continue;
      (map[t.category] ||= []).push(t);
    }
    return map;
  }, [types]);

  // 검색 결과: 모든 카테고리를 가로질러 검색
  const queryNorm = norm(query);
  const searchResults = useMemo(() => {
    if (!queryNorm) return null;
    return types.filter((t) => {
      const haystack = [
        t.label,
        t.description,
        ...(t.keywords || []),
      ]
        .map(norm)
        .join("|");
      return haystack.includes(queryNorm);
    });
  }, [types, queryNorm]);

  // 현재 화면에서 보여줄 유형 목록
  const visibleTypes = useMemo(() => {
    if (searchResults) return searchResults;
    if (selectedCategory === null) return [];
    return types.filter((t) => t.category === selectedCategory);
  }, [searchResults, selectedCategory, types]);

  if (!open) return null;

  const handleConfirm = () => {
    onConfirm(selectedType || defaultId);
  };

  const handleSkip = () => {
    onConfirm(defaultId);
  };

  const goBack = () => {
    if (queryNorm) {
      setQuery("");
      return;
    }
    setSelectedCategory(null);
    setSelectedType(null);
  };

  const showingCategoryGrid = !queryNorm && selectedCategory === null;
  const showingTypeGrid = !!queryNorm || selectedCategory !== null;

  const currentCategory = categories.find((c) => c.id === selectedCategory);

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
          <div className="doctype-modal-header-left">
            {showingTypeGrid && (
              <button
                type="button"
                className="doctype-back-btn"
                onClick={goBack}
                aria-label="뒤로"
              >
                ←
              </button>
            )}
            <h2 id="doctype-modal-title" className="terms-modal-title">
              {queryNorm
                ? `검색: "${query}"`
                : currentCategory
                ? currentCategory.label
                : "문서 유형 선택"}
            </h2>
          </div>
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

          <div className="doctype-search-wrap">
            <input
              type="text"
              className="doctype-search-input"
              placeholder="유형 검색 (예: 보험, 계약, 대출)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>

          {error && <div className="doctype-modal-error">{error}</div>}

          {loading ? (
            <div className="doctype-modal-loading">유형 목록을 불러오는 중...</div>
          ) : showingCategoryGrid ? (
            <div className="doctype-grid">
              {categories.map((c) => {
                const count = (typesByCategory[c.id] || []).length;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className="doctype-card"
                    onClick={() => setSelectedCategory(c.id)}
                  >
                    <div className="doctype-card-icon" aria-hidden="true">
                      {c.icon || "📁"}
                    </div>
                    <div className="doctype-card-label">
                      {c.label}
                      <span className="doctype-card-count"> ({count})</span>
                    </div>
                    <div className="doctype-card-desc">{c.description}</div>
                  </button>
                );
              })}
            </div>
          ) : visibleTypes.length === 0 ? (
            <div className="doctype-modal-loading">
              {queryNorm
                ? "검색 결과가 없습니다."
                : "이 카테고리에 등록된 유형이 없습니다."}
            </div>
          ) : (
            <div className="doctype-grid">
              {visibleTypes.map((t) => {
                const isSelected = selectedType === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`doctype-card${isSelected ? " selected" : ""}`}
                    onClick={() => setSelectedType(t.id)}
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
            disabled={loading || !selectedType}
          >
            이 유형으로 분석
          </button>
        </div>
      </div>
    </div>
  );
}
