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
  async queryBlocks(
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

  /**
   * 按标签块 ID 查引用它的 block id（kind:6 引用查询）
   * 实测：
   * - 网址 (tag 43) -> 23 条
   * - 哔哩哔哩 (tag 6560) -> 320 条
   * - Youtube (tag 7659) -> 19 条
   */
  async queryBlocksByTagId(repoId: string, tagId: number, page = 1, pageSize = 2000): Promise<number[]> {
    const res = await this.queryBlocks(repoId, {
      kind: 100,
      conditions: [{ kind: 6, blockId: tagId }],
    }, page, pageSize);
    return res.resultIds;
  }

  /**
   * 批量查询块所在页面的名称/日志日期
   * get_page 返回 { results: [{ blockId, pageId, pageName }] }
   * 从 pageName 提取 YYYY-MM-DD 日志时间
   */
  async getPages(repoId: string, blockIds: number[]): Promise<Record<number, string>> {
    if (!blockIds.length) return {};
    try {
      const res = (await this.mcp.call("get_page", { repoId, blockIds })) as {
        success?: boolean;
        results?: { blockId: number; pageName?: string }[];
      };
      const map: Record<number, string> = {};
      for (const r of res.results ?? []) {
        const match = /(\d{4}-\d{2}-\d{2})/.exec(r.pageName ?? "");
        if (match) map[r.blockId] = match[1]!;
      }
      return map;
    } catch (err) {
      console.warn(`[mcp] get_page 失败：`, err);
      return {};
    }
  }

  /** 内部：按标签名查 block id（优先用 tagId 查询） */
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

/** 判断块是否是链接条目：含 markdown 链接，或含 http URL 且非纯本地图片 */
export function isLinkBlock(text: string): boolean {
  if (/\]\((https?:\/\/[^)\s]+)\)/.test(text)) return true;
  if (/\[([^\]]*)\]\((https?:\/\/[^)]+)\)/.test(text)) return true;
  if (/(https?:\/\/[^\s),，;；]+)/.test(text)) {
    // 排除纯本地相对图片引用（如 image: ./PixPin...）
    if (/^\s*image:\s*\.\//.test(text)) return false;
    return true;
  }
  return false;
}

/**
 * 从文本提取标题与 URL。
 * 1. 优先提取 Markdown 链接：](https?://...)，向前回溯匹配对应层次的 [，完美支持 [[双重括号]标题](url) 或 [标题 [ 内嵌括号 ]](url)。
 * 2. 次优先提取裸 URL 与周围第一行作为标题（如 柯南 #番剧... 或 ZERO-G #动画公司...）。
 */
export function extractTitleUrl(text: string): { title: string; url: string } | null {
  // 1. Markdown 链接回溯解析
  const linkPattern = /\]\((https?:\/\/[^)\s]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(text)) !== null) {
    const url = match[1];
    const closeBracketIdx = match.index; // ']' 所在位置
    let depth = 0;
    let openBracketIdx = -1;
    for (let i = closeBracketIdx; i >= 0; i--) {
      if (text[i] === "]") depth++;
      else if (text[i] === "[") {
        depth--;
        if (depth === 0) {
          openBracketIdx = i;
          break;
        }
      }
    }
    if (openBracketIdx !== -1) {
      let title = text.slice(openBracketIdx + 1, closeBracketIdx).trim();
      // 清理前缀未配对的单个 [
      if (title.startsWith("[") && !title.includes("]")) {
        title = title.slice(1).trim();
      }
      return { title: title || url, url };
    }
  }

  // 兜底一般 markdown 正则
  const simpleM = /\[([^\]]*)\]\(([^)]+)\)/.exec(text);
  if (simpleM) {
    return { title: simpleM[1].trim() || simpleM[2].trim(), url: simpleM[2].trim() };
  }

  // 2. 裸 URL 场景：提取 URL，并将周围有效文本作为标题
  const u = /(https?:\/\/[^\s),，;；]+)/.exec(text);
  if (u) {
    const url = u[1];
    // 寻找标题：在包含 URL 或前面的文本中提取
    const lines = text.split("\n");
    for (const line of lines) {
      let clean = line.replace(/https?:\/\/[^\s),，;；]+/g, "").trim();
      // 提取标签前的主标题（例如 "ZERO-G #动画公司" 或 "名侦探柯南 #番剧"）
      if (clean.includes("#")) {
        clean = clean.split("#")[0].trim();
      }
      // 提取属性冒号前的标题
      clean = clean.replace(/[a-zA-Z0-9_\u4e00-\u9fa5]+:\s*[^;\n]+;?/g, "").trim();
      // 取第一个逗号前的词
      if (clean.includes(",") || clean.includes("，")) {
        clean = clean.split(/[,，]/)[0].trim();
      }
      if (clean && clean.length >= 2 && !clean.toLowerCase().startsWith("image:")) {
        return { title: clean, url };
      }
    }
    return { title: url, url };
  }

  return null;
}

/**
 * 从文本与 URL 提取封面：
 * 1. img: http... 属性
 * 2. 海报: http... 属性
 * 3. Youtube 视频 URL 自动生成高清缩略图 (https://i.ytimg.com/vi/${id}/hqdefault.jpg)
 * 4. 文本中的 i.ytimg.com 或图片扩展名 URL (jpg, jpeg, png, webp, avif, gif)
 */
export function extractCover(text: string, mainUrl?: string): string | null {
  // 1. img: 属性
  const imgM = /img:\s*(https?:\/\/[^\s;]+)/i.exec(text);
  if (imgM) return imgM[1].trim();

  // 2. 海报: 属性
  const posterM = /海报:\s*(https?:\/\/[^\s;]+)/i.exec(text);
  if (posterM) return posterM[1].trim();

  // 3. Youtube 链接自动计算封面
  if (mainUrl) {
    const ytM = /(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/.exec(mainUrl);
    if (ytM) {
      return `https://i.ytimg.com/vi/${ytM[1]}/hqdefault.jpg`;
    }
  }

  // 4. 文本中的 Youtube 缩略图
  const ytImg = /(https?:\/\/i\.ytimg\.com\/vi\/[^\s,;#)]+)/.exec(text);
  if (ytImg) return ytImg[1].trim();

  // 5. 文本中的其他通用图片 URL
  const anyImg = /(https?:\/\/[^\s,;#)]+?\.(?:jpg|jpeg|png|webp|avif|gif))/i.exec(text);
  if (anyImg) return anyImg[1].trim();

  return null;
}

/** 提取文本中的标签属性键值对（例如 key: value;） */
export function extractTagProperties(text: string): Record<string, string> {
  const props: Record<string, string> = {};
  const re = /([a-zA-Z0-9_\u4e00-\u9fa5]+):\s*([^;\n]+);?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const k = m[1].trim();
    const v = m[2].trim();
    if (k && v && !/^https?$/i.test(k)) {
      props[k] = v;
    }
  }
  return props;
}

/**
 * 从块文本提取标签（#tag）。
 * 清理掉括号中的 URL（避免将 URL 的 #hash 误识别为标签）；
 * 支持提取冒号后半部分（如 #哔哩UP：小太阳 → 提取 哔哩UP：小太阳 与 小太阳）。
 */
export function extractTags(text: string): string[] {
  // 过滤括号内的 URL，防止 https://xxx#anchor 造成误判
  const clean = text
    .replace(/\]\([^\)]+\)/g, "]")
    .replace(/\(https?:\/\/[^\)]+\)/g, "");

  const tags: string[] = [];
  const re = /#([^\s,#，]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) !== null) {
    let t = m[1].trim().replace(/[),;，。]+$/, "").trim();
    if (!t) continue;
    if (!tags.includes(t)) tags.push(t);

    if (/[:：]/.test(t)) {
      const afterColon = t.split(/[:：]/).slice(1).join(":").trim();
      if (afterColon && !tags.includes(afterColon)) {
        tags.push(afterColon);
      }
    }
  }
  return tags;
}

/** 解析 get_blocks_text 返回的 JSON 字符串 → UrlEntry 列表（按请求块去重，不重复生成子块） */
export function parseEntries(
  rawText: string,
  repoId: string,
  repoName: string,
  extraTagsMap?: Map<number, string[]>,
  dateMap?: Record<number, string>,
): UrlEntry[] {
  const parsed = JSON.parse(rawText);
  const results: { id?: number; blocks?: RawBlock[] }[] = parsed.results ?? [];
  const seen = new Set<string>();
  const entries: UrlEntry[] = [];

  for (const r of results) {
    const targetId = r.id;
    const blocks = r.blocks ?? [];
    if (!blocks.length) continue;

    // 优先取目标主块，找不到则取第一块
    const mainBlock = (targetId ? blocks.find((b) => b.id === targetId) : null) ?? blocks[0];
    const mainText = mainBlock.text ?? "";

    // 收集全部关联文本（主块 + 子块）作为检索上下文
    const allTexts = blocks.map((b) => b.text ?? "").filter(Boolean);
    const combinedText = allTexts.join("\n");

    // 检查是否有链接
    let tu = isLinkBlock(mainText) ? extractTitleUrl(mainText) : null;
    let chosenBlock = mainBlock;

    // 如果主块无链接，但在子块中有链接（例如任务容器块），尝试从首个有链接的子块提取
    if (!tu) {
      for (const b of blocks) {
        const bt = b.text ?? "";
        if (isLinkBlock(bt)) {
          tu = extractTitleUrl(bt);
          if (tu) {
            chosenBlock = b;
            break;
          }
        }
      }
    }

    if (!tu) continue;

    const blockIdStr = String(chosenBlock.id || targetId || 0);
    if (seen.has(blockIdStr)) continue;
    seen.add(blockIdStr);

    // 提取封面（优先主块，主块没有再看子块与全局上下文）
    let cover = extractCover(chosenBlock.text ?? "", tu.url);
    if (!cover && combinedText !== (chosenBlock.text ?? "")) {
      cover = extractCover(combinedText, tu.url);
    }

    // 提取标签
    const tags = extractTags(chosenBlock.text ?? "");
    const blockNum = Number(blockIdStr);
    if (extraTagsMap) {
      const extra1 = extraTagsMap.get(blockNum);
      if (extra1) {
        for (const t of extra1) if (!tags.includes(t)) tags.push(t);
      }
      if (targetId && targetId !== blockNum) {
        const extra2 = extraTagsMap.get(targetId);
        if (extra2) {
          for (const t of extra2) if (!tags.includes(t)) tags.push(t);
        }
      }
    }

    // 提取标签属性
    const tagProperties = extractTagProperties(combinedText);

    // 日期
    const date = dateMap ? dateMap[blockNum] || (targetId ? dateMap[targetId] || "" : "") : undefined;

    entries.push({
      id: blockIdStr,
      title: tu.title,
      url: tu.url,
      cover,
      tags,
      tagProperties,
      rawText: combinedText,
      repoId,
      repoName,
      date: date || undefined,
    });
  }

  return entries;
}
