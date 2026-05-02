const BOOKMARK_PREFIX = "easydoc_bookmark_v1";

function makeKey(userEmail, docId) {
  if (!userEmail || docId == null) return null;
  return `${BOOKMARK_PREFIX}:${String(userEmail)}:${String(docId)}`;
}

/**
 * @typedef {{ page: number, updatedAt: number }} Bookmark
 */

export function loadBookmark(userEmail, docId) {
  const key = makeKey(userEmail, docId);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const page = Number(data?.page);
    const updatedAt = Number(data?.updatedAt);
    if (!Number.isFinite(page) || page < 1) return null;
    return {
      page,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
    };
  } catch {
    return null;
  }
}

export function saveBookmark(userEmail, docId, page) {
  const key = makeKey(userEmail, docId);
  if (!key) return;
  const p = Number(page);
  if (!Number.isFinite(p) || p < 1) return;
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        page: p,
        updatedAt: Date.now(),
      }),
    );
  } catch {
    /* quota / private mode */
  }
}

export function clearBookmark(userEmail, docId) {
  const key = makeKey(userEmail, docId);
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

