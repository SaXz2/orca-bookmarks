/**
 * 收藏夹文件夹树：纯标签分类（无域名兜底）。
 *
 * 分类规则（用户明确要求）：
 *  1. 纯标签分类：
 *     - "网址" 标签 → 归入 "网址" 文件夹
 *     - "哔哩哔哩" 标签 → 归入 "哔哩哔哩" 文件夹
 *     - "Youtube" 标签 → 归入 "Youtube" 文件夹
 *  2. 严格无域名兜底（即使域名为 bilibili/youtube，无对应标签也归入 other）
 *  3. 其余所有未携带上述三标签的 HTTP 笔记链接 → 归入 "other"
 */
import type { UrlEntry } from "../mcp/client";

export interface BookmarkNode {
  /** 叶子节点 */
  kind: "bookmark";
  entry: UrlEntry;
}

export interface FolderNode {
  kind: "folder";
  name: FolderName;
  children: BookmarkNode[];
}

export type TreeNode = FolderNode | BookmarkNode;

/** 文件夹输出顺序 */
export const FOLDER_ORDER = ["网址", "哔哩哔哩", "Youtube", "other"] as const;
export type FolderName = (typeof FOLDER_ORDER)[number];

function hasTag(e: UrlEntry, tag: string): boolean {
  return e.tags.some((t) => t.toLowerCase() === tag.toLowerCase());
}

/**
 * 纯标签分类（严格无域名兜底）：
 * - 含 "网址" 标签 → "网址"
 * - 含 "哔哩哔哩" 标签 → "哔哩哔哩"
 * - 含 "Youtube" 标签 → "Youtube"
 * - 其余 → "other"
 */
export function classify(e: UrlEntry): FolderName {
  if (hasTag(e, "网址")) return "网址";
  if (hasTag(e, "哔哩哔哩") || hasTag(e, "bilibili")) return "哔哩哔哩";
  if (hasTag(e, "Youtube") || hasTag(e, "youtube")) return "Youtube";
  return "other";
}

/** 构建文件夹树（按 FOLDER_ORDER 排序，始终输出全部文件夹，空文件夹 children 为空数组） */
export function buildBookmarkTree(entries: UrlEntry[]): FolderNode[] {
  const byFolder = new Map<FolderName, BookmarkNode[]>();
  for (const name of FOLDER_ORDER) {
    byFolder.set(name, []);
  }
  for (const e of entries) {
    const f = classify(e);
    byFolder.get(f)!.push({ kind: "bookmark", entry: e });
  }
  return FOLDER_ORDER.map((name) => ({
    kind: "folder" as const,
    name,
    children: byFolder.get(name) ?? [],
  }));
}
