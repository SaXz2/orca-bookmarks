/**
 * 真实 MCP 客户端：实现 McpClient 接口，内部走 OrcaMcp 连接层。
 *
 * ⚠ query_blocks 参数结构（实测 2026-10-15）：
 * - 标签查询（嵌套版，✅ 可用）：`{q:{kind:100, conditions:[{kind:4, name:tagName}]}}`
 * - 文本搜索（平铺版，✅ 可用）：`{q:{kind:8, text:"http", raw:true}}`
 * - ❌ 标签查询平铺版 `{q:{kind:4, name:tagName}}`：不报错但静默返回 0 条
 * - ❌ 把 q/kind/name 放到 arguments 顶层：报 invalid_arguments
 *
 * ⚠ 标签数据现状（实测）：Youtube=18 条（嵌套版可查），网址/哔哩哔哩=0 条（两版均 0）。
 * 数据源用 kind:8 文本搜 "http"（raw:true），分页拉全量；域名兜底分组。
 *
 * 坑（@0 要求写进注释）：
 * - totalCount 被 pageSize 截断，不能当总数；分页要拉到 resultIds 长度 < pageSize。
 * - initialize 无 session id（无状态），OrcaMcp 兼容写法保留。
 * - kind:13 格式查询找不到链接；other 数据源 = kind:8 + raw:true + 搜 "http"。
 * - 所有工具必须传 repoId；无仓库枚举工具（resources/list 404）。
 * - 不存在的 repoId 返回空成功、与空仓库无法区分。
 */
import type { McpClient, McpConfig, UrlEntry } from "./client";
import { OrcaMcp, backgroundHttp } from "./transport";

/** 真实标签名（@12 调研实测） */
export const TAG_URL = "网址";
export const TAG_BILIBILI = "哔哩哔哩";
export const TAG_YOUTUBE = "Youtube";

export class RealMcpClient implements McpClient {
  private mcp: OrcaMcp;
  protected repoId: string;
  protected repoName: string;

  constructor(cfg: McpConfig, repoName = "") {
    this.mcp = new OrcaMcp({ endpoint: cfg.endpoint, token: cfg.token, http: backgroundHttp });
    this.repoId = cfg.repoId;
    this.repoName = repoName;
  }

  /** 裸 initialize 握手，看是否可达 + Token 是否有效 */
  async ping(): Promise<boolean> {
    await this.mcp.ping();
    return true;
  }

  /**
   * 按标签查询条目（query_blocks 嵌套版 → get_blocks_text → 解析）。
   * ⚠ 参数结构：`{q:{kind:100, conditions:[{kind:4, name:tagName}]}}`（嵌套版）。
   * 平铺版 `{q:{kind:4, name:tagName}}` 不报错但静默返回 0 条。
   * ⚠ 实测：Youtube=18 条可查；网址/哔哩哔哩=0 条（标签数据可能已变）。
   * 保留此方法供交叉校验，数据源用 queryByText（kind:8）。
   */
  async queryByTag(tag: string): Promise<UrlEntry[]> {
    const ids = await this.queryBlockIds(tag);
    if (!ids.length) return [];
    const texts = await this.getBlocksText(this.repoId, ids);
    return parseEntries(texts, this.repoId, this.repoName);
  }

  /** 文本搜索 block id 列表（kind:8 raw:true） */
  async queryByText(repoId: string, text: string, page: number, pageSize: number): Promise<{ resultIds: number[]; totalCount: number }> {
    return this.queryBlocks(repoId, { kind: 8, text, raw: true }, page, pageSize);
  }

  /** 批量取块正文（JSON 字符串） */
  async getBlocksText(repoId: string, blockIds: number[]): Promise<string> {
    const texts = await this.mcp.call("get_blocks_text", { repoId, blockIds });
    return typeof texts === "string" ? texts : JSON.stringify(texts);
  }

  /** 跨库枚举：无仓库枚举工具，只能按 repoId 逐个查 */
  async listRepos(): Promise<{ id: string; name: string }[]> {
    return [{ id: this.repoId, name: this.repoName }];
  }

  /** 调研确认工具名后可用 */
  async listTools() {
    return this.mcp.listTools();
  }

  /** 内部：query_blocks 通用 */
  protected async queryBlocks(
    repoId: string,
    q: Record<string, unknown>,
    page: number,
    pageSize: number,
  ): Promise<{ resultIds: number[]; totalCount: number }> {
    const res = (await this.mcp.call("query_blocks", {
      repoId,
      description: { q, page, pageSize },
    })) as { resultIds?: number[]; totalCount?: number };
    return { resultIds: res.resultIds ?? [], totalCount: res.totalCount ?? 0 };
  }

  /** 内部：按标签名查 block id（嵌套版 kind:100） */
  protected async queryBlockIds(tagName: string): Promise<number[]> {
    const res = await this.queryBlocks(this.repoId, {
      kind: 100,
      conditions: [{ kind: 4, name: tagName }],
    }, 1, 2000);
    return res.resultIds;
  }
}

// ---------------------------------------------------------------------------
// 正文解析（从 get_blocks_text 的 JSON 字符串提取条目）
// ---------------------------------------------------------------------------

interface RawBlock {
  id: number;
  text?: string;
  links?: unknown[];
  children?: unknown[];
  type?: string;
}

/** 判断块是否是链接条目：含 markdown 链接，或含裸 URL 且非纯 image 块 */
export function isLinkBlock(text: string): boolean {
  if (/\[([^\]]*)\]\(([^)]+)\)/.test(text)) return true;
  if (/^https?:\/\/\S+$/m.test(text.trim())) return true;
  return false;
}

/** 从块文本提取标题/URL（markdown 链接优先，否则第一个 http URL） */
export function extractTitleUrl(text: string): { title: string; url: string } | null {
  const m = /\[([^\]]*)\]\(([^)]+)\)/.exec(text);
  if (m) return { title: m[1] || m[2], url: m[2] };
  const u = /(https?:\/\/[^\s)]+)/.exec(text);
  if (u) return { title: u[1], url: u[1] };
  return null;
}

/** 从块文本提取封面（img: 追加行） */
export function extractCover(text: string): string | null {
  const m = /^img:\s*(.+?);/m.exec(text);
  return m ? m[1]!.trim() : null;
}

/**
 * 从块文本提取标签（#tag）。
 * 含冒号的（如 #哔哩UP：夏日幻听MCE）也提取冒号后部分进 tags——
 * 分组不受影响（classify 只查固定标签名），但搜索可覆盖 UP 主名。
 */
export function extractTags(text: string): string[] {
  const tags: string[] = [];
  const re = /#([^\s,#]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const t = m[1]!;
    if (/[:：]/.test(t)) {
      // #哔哩UP：xxx → 提取冒号后部分（UP 主名）供搜索
      const afterColon = t.split(/[:：]/).slice(1).join(":").trim();
      if (afterColon) tags.push(afterColon);
    } else {
      tags.push(t);
    }
  }
  return tags;
}

/** 解析 get_blocks_text 返回的 JSON 字符串 → UrlEntry 列表（去重 + 过滤非链接块） */
export function parseEntries(rawText: string, repoId: string, repoName: string): UrlEntry[] {
  const parsed = JSON.parse(rawText);
  const results: { id?: number; blocks?: RawBlock[] }[] = parsed.results ?? [];
  const seen = new Set<number>();
  const entries: UrlEntry[] = [];
  for (const r of results) {
    for (const b of r.blocks ?? []) {
      const text = b.text ?? "";
      if (!isLinkBlock(text)) continue;
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      const tu = extractTitleUrl(text);
      if (!tu) continue;
      entries.push({
        id: String(b.id),
        title: tu.title,
        url: tu.url,
        cover: extractCover(text),
        tags: extractTags(text),
        repoId,
        repoName,
      });
    }
  }
  return entries;
}
