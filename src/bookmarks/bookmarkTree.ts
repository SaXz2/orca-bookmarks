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

/** 基础内置文件夹顺序 */
export const DEFAULT_FOLDERS = ["网址", "哔哩哔哩", "Youtube", "other"] as const;
export const FOLDER_ORDER = DEFAULT_FOLDERS;
export type FolderName = string;

function hasTag(e: UrlEntry, tag: string): boolean {
  return (e.tags ?? []).some((t) => t.toLowerCase() === tag.toLowerCase());
}

/**
 * 标签分类（支持自定义标签优先归入对应文件夹）：
 * 1. 若配置了自定义标签（例如 ["游戏网址", "番剧"]），且条目命中该标签，则归入该自定义文件夹；
 * 2. 否则按基础标签：
 *    - 含 "网址" 标签 → "网址"
 *    - 含 "哔哩哔哩" 标签 → "哔哩哔哩"
 *    - 含 "Youtube" 标签 → "Youtube"
 *    - 其余 → "other"
 */
export function classify(e: UrlEntry, customFolders: string[] = []): FolderName {
  if (customFolders && customFolders.length > 0) {
    for (const cf of customFolders) {
      if (hasTag(e, cf)) {
        return cf;
      }
    }
  }

  if (hasTag(e, "网址")) return "网址";
  if (hasTag(e, "哔哩哔哩") || hasTag(e, "bilibili")) return "哔哩哔哩";
  if (hasTag(e, "Youtube") || hasTag(e, "youtube")) return "Youtube";
  return "other";
}

/** 获取全部文件夹列表（自定义标签文件夹排在 other 之前） */
export function getAllFolders(customFolders: string[] = []): string[] {
  const custom = customFolders.filter((c) => !DEFAULT_FOLDERS.includes(c as any));
  return ["网址", "哔哩哔哩", "Youtube", ...custom, "other"];
}

/** 构建文件夹树（始终输出全部文件夹，空文件夹 children 为空数组） */
export function buildBookmarkTree(entries: UrlEntry[], customFolders: string[] = []): FolderNode[] {
  const folders = getAllFolders(customFolders);
  const byFolder = new Map<string, BookmarkNode[]>();
  for (const name of folders) {
    byFolder.set(name, []);
  }
  for (const e of entries) {
    const f = classify(e, customFolders);
    if (!byFolder.has(f)) {
      byFolder.set(f, []);
    }
    byFolder.get(f)!.push({ kind: "bookmark", entry: e });
  }
  return folders.map((name) => ({
    kind: "folder" as const,
    name,
    children: byFolder.get(name) ?? [],
  }));
}
