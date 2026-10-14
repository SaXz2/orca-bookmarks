/**
 * 数据加载编排：从 MCP 拉取链接条目 → 供 popup/分组/搜索使用。
 *
 * ⚠ 实测修正（2026-10-15，与 @12 调研有出入）：
 * 1. query_blocks 的 description.q 结构是 `{kind:4/8, ...}` 直接平铺，
 *    @12 报告里的 `{kind:100, conditions:[...]}` 实测报 invalid_arguments（schema 无 100）。
 * 2. 标签数据现状：网址=0 条、哔哩哔哩=0 条（所有 repoId 实测），Youtube=2 条。
 *    @12 报告的 23/320 条已不存在（疑似调研后被清理）。故不按标签查作数据源。
 * 3. get_blocks_text 返回 {success, repoId, results:[{id, blocks:[...]}]}，
 *    blocks 是树形展开（含 children 子块），需按 id 去重 + 过滤非链接块。
 * 4. 数据源 = kind:8 文本搜 "http"（raw:true），分页拉全量；分组按 URL 域名。
 *
 * 分组规则（@0 拍板）：标签优先 > 域名兜底 > other。标签当前不可靠，实际生效的是域名兜底。
 */
import type { McpConfig, UrlEntry } from "./client";
import { RealMcpClient, parseEntries } from "./realClient";

const PAGE_SIZE = 2000;
const MAX_PAGES = 100;

/** 分页拉全量链接条目（kind:8 搜 http，翻到空页或满页） */
async function fetchAllLinks(client: RealMcpClient, repoId: string): Promise<UrlEntry[]> {
  const all = new Map<string, UrlEntry>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await client.queryByText(repoId, "http", page, PAGE_SIZE);
    const ids: number[] = res.resultIds ?? [];
    if (!ids.length) break;
    const rawText = await client.getBlocksText(repoId, ids);
    for (const e of parseEntries(rawText, repoId, "")) {
      if (!all.has(e.id)) all.set(e.id, e);
    }
    if (ids.length < PAGE_SIZE) break; // 最后一页
  }
  return [...all.values()];
}

/** 按配置加载全部链接条目（支持多 repoId，逗号分隔） */
export async function loadBookmarkEntries(cfg: McpConfig): Promise<UrlEntry[]> {
  const repos = cfg.repoId
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id, i) => ({ id, name: `repo-${i + 1}` }));
  if (!repos.length) return [];
  const all = new Map<string, UrlEntry>();
  for (const repo of repos) {
    const client = new RealMcpClient({ endpoint: cfg.endpoint, token: cfg.token, repoId: repo.id }, repo.name);
    try {
      const entries = await fetchAllLinks(client, repo.id);
      for (const e of entries) {
        if (!all.has(e.id)) all.set(e.id, e);
      }
    } catch (err) {
      console.warn(`[loader] repo ${repo.id} 加载失败：`, err);
    }
  }
  return [...all.values()];
}
