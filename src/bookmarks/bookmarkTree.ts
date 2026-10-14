/**
 * 收藏夹文件夹树：网址标签条目 → 文件夹分组。
 * 分组规则（@0 拍板 + @18 补充标签）：
 *  1. 标签优先：bilibili > youtube > vimeo > 网址（含子类）> other；
 *  2. 标签全未命中 → 域名兜底：b 站/vimeo/youtube 域名；
 *  3. 其余 → other。
 * 只改 TAG_RULES / DOMAIN_RULES / FOLDER_ORDER 三处即可调整分组。
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
 * 标签规则，顺序即优先级。
 * 视频类：bilibili > youtube > vimeo（@18 补充：Vimeo 结构同 Youtube 且有封面）。
 * 网址类：网址 + 子类（游戏网址/下载网址，@18 补充）。
 * 双标签归 bilibili（@0 拍板）。
 */
const TAG_RULES: { folder: string; tag: string }[] = [
  { folder: "bilibili", tag: "哔哩哔哩" },
  { folder: "youtube", tag: "Youtube" },
  { folder: "vimeo", tag: "Vimeo" },
  { folder: "网址", tag: "网址" },
  { folder: "网址", tag: "游戏网址" },
  { folder: "网址", tag: "下载网址" },
];

/** 域名兜底规则（标签未命中时） */
const DOMAIN_RULES: { folder: string; domains: string[] }[] = [
  { folder: "bilibili", domains: ["bilibili.com", "b23.tv"] },
  { folder: "youtube", domains: ["youtube.com", "youtu.be"] },
  { folder: "vimeo", domains: ["vimeo.com"] },
];

/** 文件夹输出顺序 */
const FOLDER_ORDER = ["bilibili", "youtube", "vimeo", "网址", "other"];

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
