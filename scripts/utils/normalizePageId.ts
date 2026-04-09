export function normalizePageId(pageId: string): string {
  return pageId.replace(/-/g, "").toLowerCase();
}
