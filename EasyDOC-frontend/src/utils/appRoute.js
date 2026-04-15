const ROUTE_KEY = "easydoc_app_route";

/**
 * @typedef {{ page: "upload" | "mypage", viewerDocId?: number | null, activeMenu?: string }} AppRoute
 */

export function saveAppRoute(route) {
  try {
    localStorage.setItem(ROUTE_KEY, JSON.stringify(route));
  } catch {
    /* quota / private mode */
  }
}

export function loadAppRoute() {
  try {
    const raw = localStorage.getItem(ROUTE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && (data.page === "upload" || data.page === "mypage")) return data;
    return null;
  } catch {
    return null;
  }
}

export function clearAppRoute() {
  try {
    localStorage.removeItem(ROUTE_KEY);
  } catch {
    /* ignore */
  }
}
