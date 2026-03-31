import { clearAppRoute } from "./appRoute";

const TOKEN_KEY = "token";
const EMAIL_KEY = "userEmail";
/** 탭 단위 — 브라우저/탭을 닫으면 초기화됨 */
const LAST_ACTIVITY_KEY = "easydoc_last_activity";

/**
 * 서버 `jwt.expiration`(기본 3600000ms = 1시간)과 맞추려면 백엔드 application.properties 참고.
 * 유휴 시간은 그보다 짧게 두는 것이 일반적(예: 30분 무동작 시 로그아웃).
 */
export const IDLE_LOGOUT_MS = 30 * 60 * 1000;

function parseJwtPayload(token) {
  if (!token || typeof token !== "string") return null;
  try {
    const base64Url = token.split(".")[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4;
    const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** 백엔드 JwtUtil: subject = email. API는 서버에서 서명 검증. */
export function parseJwtEmail(token) {
  const payload = parseJwtPayload(token);
  return typeof payload?.sub === "string" ? payload.sub : null;
}

/** JWT exp(초)가 지났으면 true. exp 없으면 만료로 보지 않음(구버전 호환). */
export function isJwtExpired(token) {
  const payload = parseJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") return false;
  return payload.exp * 1000 <= Date.now();
}

export function touchActivity() {
  sessionStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
}

export function isIdleExpired() {
  const raw = sessionStorage.getItem(LAST_ACTIVITY_KEY);
  if (!raw) return false;
  const last = Number(raw);
  if (!Number.isFinite(last)) return false;
  return Date.now() - last > IDLE_LOGOUT_MS;
}

export function loadPersistedSession() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;

  if (isJwtExpired(token)) {
    clearSession();
    return null;
  }

  if (isIdleExpired()) {
    clearSession();
    return null;
  }

  let email = localStorage.getItem(EMAIL_KEY);
  if (!email) {
    email = parseJwtEmail(token);
    if (email) localStorage.setItem(EMAIL_KEY, email);
  }

  return email ? { token, email } : null;
}

export function saveSession(token, email) {
  localStorage.setItem(TOKEN_KEY, token);
  if (email) localStorage.setItem(EMAIL_KEY, email);
  touchActivity();
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EMAIL_KEY);
  sessionStorage.removeItem(LAST_ACTIVITY_KEY);
  clearAppRoute();
}
