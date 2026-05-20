/** 중요 페이지 API 응답 정규화: 동일 page 번호 중복 제거 */
export function normalizeImportantPages(pages) {
  if (!pages?.length) return [];

  const byPage = new Map();
  for (const p of pages) {
    const prev = byPage.get(p.page);
    if (!prev) {
      byPage.set(p.page, { ...p, keywords: [...(p.keywords || [])] });
      continue;
    }
    const keywords = [...(prev.keywords || [])];
    for (const kw of p.keywords || []) {
      if (!keywords.some((k) => k.keyword === kw.keyword)) keywords.push(kw);
    }
    const keep = p.importance > prev.importance ? p : prev;
    const drop = p.importance > prev.importance ? prev : p;
    byPage.set(p.page, {
      ...keep,
      keywords,
      importance: Math.max(p.importance, prev.importance),
      reason: keep.reason || drop.reason,
      summary: keep.summary || drop.summary,
    });
  }

  return [...byPage.values()].sort(
    (a, b) => b.importance - a.importance || a.page - b.page
  );
}
