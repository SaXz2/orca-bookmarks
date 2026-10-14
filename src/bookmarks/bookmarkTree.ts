/**
 * 收藏夹文件夹树：网址标签条目 → 文件夹分组。
 * 分组规则（已拍板 2026-10-15）：
 *  1. 标签优先：bilibili > youtube（双标签归 bilibili，首个命中）；
 *  2. 标签全未命中 → 域名兜底：b 站域名 → bilibili，youtube 域名 → youtube；
 *  3. 其余 → other。
 * 注意：bilibili/youtube 的真实标签命名待 @12 调研确认，只改 TAG_RULES 一处。
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

/**
 * 标签规则，顺序即优先级（真实 tag 名来自 @12 调研实测）。
 * 顺序：bilibili > youtube > 网址（双标签归 bilibili，@0 拍板）。
 * 注意：实测当前 网址/哔哩哔哩 标签下 0 条，仅 Youtube 有 2 条；
 * 域名兜底（见 DOMAIN_RULES）实际承担主要分组。
 */
const TAG_RULES: { folder: string; tag: string }[] = [
  { folder: "bilibili", tag: "哔哩哔哩" },
  { folder: "youtube", tag: "Youtube" },
  { folder: "网址", tag: "网址" },
];

/** 域名兜底规则（标签未命中时） */
const DOMAIN_RULES: { folder: string; domains: string[] }[] = [
  { folder: "bilibili", domains: ["bilibili.com", "b23.tv"] },
  { folder: "youtube", domains: ["youtube.com", "youtu.be"] },
];

/** 文件夹输出顺序 */
const FOLDER_ORDER = ["bilibili", "youtube", "other"];

function hasTag(e: UrlEntry, tag: string): boolean {
  return e.tags.some((t) => t.toLowerCase() === tag);
}

function hasDomain(e: UrlEntry, domains: string[]): boolean {
  try {
    const host = new URL(e.url).hostname.toLowerCase();
    return domains.some((d) => host === d || host.endsWith("." + d));
  } catch {
    return false; // 非法 URL 不兜底
  }
}

/**
 * 分类：标签全局优先于域名兜底。
 * 即：任一规则的标签命中 → 按 TAG_RULES 顺序首个命中（双标签归 bilibili）；
 * 所有标签都未命中 → 再按域名兜底（防止 youtube 标签 + b 站域名的条目被域名规则抢走）。
 */
export function classify(e: UrlEntry): string {
  for (const r of TAG_RULES) {
    if (hasTag(e, r.tag)) return r.folder;
  }
  for (const r of DOMAIN_RULES) {
    if (hasDomain(e, r.domains)) return r.folder;
  }
  return "other";
}

/** 构建文件夹树（按 FOLDER_ORDER 排序，始终输出全部文件夹，空文件夹 children 为空数组） */
export function buildBookmarkTree(entries: UrlEntry[]): FolderNode[] {
  const byFolder = new Map<string, BookmarkNode[]>();
  for (const e of entries) {
    const f = classify(e);
    if (!byFolder.has(f)) byFolder.set(f, []);
    byFolder.get(f)!.push({ kind: "bookmark", entry: e });
  }
  return FOLDER_ORDER.map((name) => ({
    kind: "folder" as const,
    name,
    children: byFolder.get(name) ?? [],
  }));
}
