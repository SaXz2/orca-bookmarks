/** 本地搜索：对标题 + URL 做简单倒排/子串匹配（先实现最简可用，后续可换轻量索引） */
import type { UrlEntry } from "../mcp/client";

export interface SearchIndex {
  entries: UrlEntry[];
}

export function buildIndex(entries: UrlEntry[]): SearchIndex {
  return { entries };
}

/** 子串匹配搜索，大小写不敏感；query 为空返回全部 */
export function search(index: SearchIndex, query: string): UrlEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return index.entries;
  return index.entries.filter(
    (e) =>
      e.title.toLowerCase().includes(q) ||
      e.url.toLowerCase().includes(q) ||
      e.tags.some((t) => t.toLowerCase().includes(q)),
  );
}
