/** prompts registry 기준 doc_type → category 라벨 */

export function buildCategoryLabelMap(registry) {
  const map = new Map();
  for (const c of registry?.categories || []) {
    if (c.id) map.set(c.id, c.label || c.id);
  }
  map.set("default", "일반");
  return map;
}

/** type id → category id (types[].category, 레거시로 type id가 category인 경우 포함) */
export function buildTypeToCategoryMap(registry) {
  const map = new Map();
  const categoryIds = new Set((registry?.categories || []).map((c) => c.id));

  for (const t of registry?.types || []) {
    if (t.id) {
      map.set(t.id, t.category || "default");
    }
  }
  for (const id of categoryIds) {
    if (!map.has(id)) map.set(id, id);
  }
  map.set("default", "default");
  return map;
}

/** docsinfos doc_type별 건수 → category별 합산 후 상위 N개 */
export function aggregateTopCategories(typeCounts, registry, limit = 3) {
  const typeToCategory = buildTypeToCategoryMap(registry);
  const categoryCounts = new Map();

  const entries =
    typeCounts && typeof typeCounts === "object" && !Array.isArray(typeCounts)
      ? Object.entries(typeCounts)
      : [];

  for (const [docType, count] of entries) {
    const n = Number(count) || 0;
    if (n <= 0) continue;
    const categoryId = typeToCategory.get(docType) || "default";
    categoryCounts.set(categoryId, (categoryCounts.get(categoryId) || 0) + n);
  }

  const labelMap = buildCategoryLabelMap(registry);
  return [...categoryCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .slice(0, limit)
    .map(([categoryId, count]) => ({
      categoryId,
      label: labelMap.get(categoryId) || categoryId,
      count,
    }));
}
