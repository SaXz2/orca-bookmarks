/**
 * 数据加载编排：从 MCP 拉取链接条目 → 供 popup/分组/搜索使用。
 *
 * 核心机制（实测 2026-10-15）：
 * 1. 目标标签引用查询：
 *    - 网址 (tag 43) -> 23 条
 *    - 哔哩哔哩 (tag 6560) -> 320 条
 *    - Youtube (tag 7659) -> 19 条
 *    走 query_blocks {q:{kind:100, conditions:[{kind:6, blockId:tagId}]}}
 * 2. other 分组：通过 kind:8 搜 "http" / "https" 提取散落链接，排除上述三类标签块。
 * 3. 收藏日期：批量调用 get_page 获取块所在日志页日期（YYYY-MM-DD）。
 * 4. 排序：按日志日期降序排列（最新收藏的排在最前）。
 */
import type { McpConfig, UrlEntry } from "./client";
import { RealMcpClient, parseEntries } from "./realClient";

/** 目标标签与其固定块 ID */
const TARGET_TAGS = [
  { name: "网址", tagId: 43 },
  { name: "哔哩哔哩", tagId: 6560 },
  { name: "Youtube", tagId: 7659 },
] as const;

const BATCH_SIZE = 150;

/** 分批查询 */
function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/** 拉取单个仓库的全部条目 */
async function fetchRepoEntries(client: RealMcpClient, repoId: string, repoName: string): Promise<UrlEntry[]> {
  const extraTagsMap = new Map<number, string[]>();
  const targetTagIds = new Set<number>();

  // 1. 并发查询三个目标标签的块 ID
  await Promise.all(
    TARGET_TAGS.map(async ({ name, tagId }) => {
      try {
        const ids = await client.queryBlocksByTagId(repoId, tagId, 1, 2000);
        for (const id of ids) {
          targetTagIds.add(id);
          const list = extraTagsMap.get(id) ?? [];
          if (!list.includes(name)) list.push(name);
          extraTagsMap.set(id, list);
        }
      } catch (err) {
        console.warn(`[loader] 标签 ${name}(${tagId}) 查询失败：`, err);
      }
    }),
  );

  // 2. 并发查询 other 散落链接（文本搜 http / https）
  const otherIds = new Set<number>();
  await Promise.all(
    ["http", "https"].map(async (term) => {
      try {
        const res = await client.queryByText(repoId, term, 1, 2000);
        for (const id of res.resultIds ?? []) {
          if (!targetTagIds.has(id)) {
            otherIds.add(id);
          }
        }
      } catch (err) {
        console.warn(`[loader] other 搜索 (${term}) 失败：`, err);
      }
    }),
  );

  // 3. 合并所有需要解析的块 ID（去重）
  const allBlockIds = Array.from(new Set([...targetTagIds, ...otherIds]));
  if (!allBlockIds.length) return [];

  // 4. 并发受控拉取正文与日志时间（每组 3 批并发拉取，提速 3 倍）
  const chunks = chunkArray(allBlockIds, BATCH_SIZE);
  const allEntries: UrlEntry[] = [];
  const seenEntries = new Set<string>();

  const CONCURRENCY = 3;
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const slice = chunks.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      slice.map(async (chunk) => {
        try {
          const [rawText, dateMap] = await Promise.all([
            client.getBlocksText(repoId, chunk),
            client.getPages(repoId, chunk),
          ]);
          return parseEntries(rawText, repoId, repoName, extraTagsMap, dateMap);
        } catch (err) {
          console.warn(`[loader] 分批解析块数据失败（块数：${chunk.length}）：`, err);
          return [];
        }
      }),
    );

    for (const batch of results) {
      for (const e of batch) {
        if (!seenEntries.has(e.id)) {
          seenEntries.add(e.id);
          allEntries.push(e);
        }
      }
    }
  }

  // 5. 按日志日期降序排列（最新在前），日期相同或缺失时按 blockId 降序
  allEntries.sort((a, b) => {
    const da = a.date ?? "";
    const db = b.date ?? "";
    if (da && db) {
      if (da !== db) return db.localeCompare(da);
    } else if (da) {
      return -1;
    } else if (db) {
      return 1;
    }
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  });

  return allEntries;
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
      const entries = await fetchRepoEntries(client, repo.id, repo.name);
      for (const e of entries) {
        if (!all.has(e.id)) all.set(e.id, e);
      }
    } catch (err) {
      console.warn(`[loader] repo ${repo.id} 加载失败：`, err);
    }
  }

  const result = Array.from(all.values());

  // 最终整体保证按日志日期倒序
  result.sort((a, b) => {
    const da = a.date ?? "";
    const db = b.date ?? "";
    if (da && db) {
      if (da !== db) return db.localeCompare(da);
    } else if (da) {
      return -1;
    } else if (db) {
      return 1;
    }
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  });

  return result;
}
