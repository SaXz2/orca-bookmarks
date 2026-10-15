/**
 * 本地搜索：基于虎鲸笔记连通搜索特性构建。
 * 命中范围：
 * 1. 标题与 URL
 * 2. 关联标签（如 "哔哩哔哩", "网址", "游戏网址", "小太阳张二毛"）
 * 3. 标签属性（包括键名、属性值、以及以管道符 "|" 分隔的细分子标签，如 tags: 恋爱|相亲|街舞）
 * 4. 笔记正文与子块总结内容（rawText）
 *
 * 支持多词空格切分（AND 组合命中），大小写不敏感。
 */
import type { UrlEntry } from "../mcp/client";

export interface SearchItem {
  entry: UrlEntry;
  searchString: string;
}

export interface SearchIndex {
  items: SearchItem[];
}

export function buildIndex(entries: UrlEntry[]): SearchIndex {
  const items: SearchItem[] = entries.map((entry) => {
    const parts: string[] = [entry.title, entry.url, ...(entry.tags ?? [])];

    if (entry.tagProperties) {
      for (const [k, v] of Object.entries(entry.tagProperties)) {
        parts.push(k);
        parts.push(v);
        // 如果属性值包含竖线（例如 tags: 爱情|男生|恋爱|约会|单身|女孩|AA|相亲|婚姻）
        if (v.includes("|")) {
          parts.push(...v.split("|"));
        }
      }
    }

    if (entry.rawText) {
      parts.push(entry.rawText);
    }

    const searchString = parts
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return { entry, searchString };
  });

  return { items };
}

/** 虎鲸笔记连通搜索，支持多词空格切分；query 为空返回全部 */
export function search(index: SearchIndex, query: string): UrlEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return index.items.map((it) => it.entry);
  }

  const tokens = q.split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    return index.items.map((it) => it.entry);
  }

  return index.items
    .filter((it) => tokens.every((token) => it.searchString.includes(token)))
    .map((it) => it.entry);
}
