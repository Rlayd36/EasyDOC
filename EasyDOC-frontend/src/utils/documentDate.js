/**
 * 문서 DB는 UTC(naive)로 저장되며, API는 ISO 8601 UTC(Z)로 내려줌.
 * 구버전/캐시처럼 타임존 없는 문자열은 UTC로 해석하도록 보강.
 */
export function parseDocumentCreatedAt(value) {
  if (value == null || value === "") return new Date(NaN);
  if (value instanceof Date) return value;
  let s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2} \d/.test(s)) {
    s = s.replace(" ", "T", 1);
  }
  const hasTz = /[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s);
  if (!hasTz && /^\d{4}-\d{2}-\d{2}T/.test(s)) {
    return new Date(s + "Z");
  }
  return new Date(s);
}

export function formatDocumentDateTimeKo(value) {
  const d = parseDocumentCreatedAt(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 변환 이력 사이드바 등 날짜만 */
export function formatDocumentDateKo(value) {
  const d = parseDocumentCreatedAt(value);
  if (Number.isNaN(d.getTime())) return "";
  return d
    .toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .replace(/\./g, ".");
}
