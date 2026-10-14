/**
 * 收藏夹文件夹树：网址标签条目 → 文件夹分组。
 * 分组规则（任务定义）：
 *  - bilibili 标签条目 → "bilibili" 文件夹
 *  - youtube 标签条目 → "youtube" 文件夹
 *  - 其他笔记库里散落的链接（不属于「网址标签」分类的）→ "other" 文件夹
 * 注意：bilibibili/youtube 的真实标签命名待 @12 调研确认；
 * 分组优先级（同时带 bilibili+youtube 标签时归谁）待任务发起人确认，暂定按 FOLDER_RULES 顺序首个命中。
 */
import type { UrlEntry } from "../mcp/client";

export interface BookmarkNode {
  /** 叶子节点 */
  kind: "bookmark";
  entry: UrlEntry;
}

export interface FolderNode {
  kind: "folder";
  name: string;
  children: BookmarkNode[];
}

export type TreeNode = FolderNode | BookmarkNode;

/** 文件夹分组规则，顺序即优先级 */
export const FOLDER_RULES: { folder: string; match: (e: UrlEntry) => boolean }[] = [
  { folder: "bilibili", match: (e) => e.tags.some((t) => t.toLowerCase() === "bilibili") },
  { folder: "youtube", match: (e) => e.tags.some((t) => t.toLowerCase() === "youtube") },
  // 「网址标签」以外的散落链接 → other（「网址标签」的真实 tag 名待调研确认，暂用占位常量）
  { folder: "other", match: () => true },
];

/** 单条目归入哪个文件夹 */
export function classify(e: UrlEntry): string {
  for (const r of FOLDER_RULES) {
    if (r.match(e)) return r.folder;
  }
  return "other";
}

/** 构建文件夹树（文件夹按 FOLDER_RULES 顺序，空文件夹不输出） */
export function buildBookmarkTree(entries: UrlEntry[]): FolderNode[] {
  const byFolder = new Map<string, BookmarkNode[]>();
  for (const e of entries) {
    const f = classify(e);
    if (!byFolder.has(f)) byFolder.set(f, []);
    byFolder.get(f)!.push({ kind: "bookmark", entry: e });
  }
  const order = FOLDER_RULES.map((r) => r.folder);
  return [...byFolder.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([name, children]) => ({ kind: "folder", name, children }));
}
