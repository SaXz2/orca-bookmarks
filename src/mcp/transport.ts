/**
 * MCP streamable HTTP 连接层。
 * 实现依据：《shunshou MCP 连接层分析》§5.3 骨架 + §5 建议（补 401/session 重握手）。
 * - 单 POST + JSON-RPC 2.0：initialize → notifications/initialized → tools/call
 * - Mcp-Session-Id 响应头带回、后续请求带上（大小写不敏感）
 * - 响应体 JSON / SSE 双兼容（SSE 取最后一条 data: 行）
 * - 结果解包：structuredContent > 单条 text 尝试 JSON.parse > 多条 text 数组
 * - HTTP 经 background service worker 代理（host_permissions 绕 CORS），见 background.ts
 */

const PROTOCOL = "2025-06-18";

export interface HttpResult {
  status: number;
  text: string;
  headers: Record<string, string>;
}

export interface HttpOpts {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timeout?: number;
}

export type HttpFn = (opts: HttpOpts) => Promise<HttpResult>;

/** 走 background SW 的 fetch 代理 */
export const backgroundHttp: HttpFn = (opts) =>
  chrome.runtime.sendMessage({ type: "orca:http", ...opts });

export class McpError extends Error {
  constructor(
    message: string,
    /** 会话失效类错误，可清状态重握手后重试一次 */
    public retryable = false,
  ) {
    super(message);
    this.name = "McpError";
  }
}

function pickHeader(headers: Record<string, string>, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === target) return v;
  }
  return undefined;
}

/** JSON / SSE 双格式解析；SSE 取最后一条 data: 行 */
function parseBody(raw: string): unknown {
  const t = raw.trim();
  if (!t) throw new McpError("虎鲸 MCP 返回空响应");
  if (t.startsWith("{") || t.startsWith("[")) return JSON.parse(t);
  const dataLines = t
    .split(/\r?\n/)
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim())
    .filter(Boolean);
  if (!dataLines.length) throw new McpError(`无法解析虎鲸 MCP 响应：${t.slice(0, 200)}`);
  return JSON.parse(dataLines[dataLines.length - 1]!);
}

function tryJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

/** 解包 tools/call 结果；识别 isError 与业务层 {success:false} */
function unwrapResult(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const r = result as { structuredContent?: unknown; content?: { type?: string; text?: unknown }[]; isError?: boolean };
  let out = r.structuredContent;
  if (out === undefined && Array.isArray(r.content)) {
    const texts = r.content
      .filter((c) => c?.type === "text" && typeof c.text === "string")
      .map((c) => c.text as string);
    out = texts.length === 1 ? tryJsonParse(texts[0]!) : texts;
  }
  if (r.isError) throw new McpError(`虎鲸工具执行失败：${JSON.stringify(out)}`);
  if (out && typeof out === "object" && (out as { success?: boolean }).success === false) {
    throw new McpError(`虎鲸工具返回失败：${JSON.stringify((out as { error?: unknown }).error ?? out)}`);
  }
  return out;
}

export interface OrcaMcpOpts {
  endpoint: string;
  token: string;
  http: HttpFn;
}

export class OrcaMcp {
  private endpoint: string;
  private token: string;
  private http: HttpFn;
  private sessionId: string | null = null;
  private id = 1;
  private ready = false;

  constructor({ endpoint, token, http }: OrcaMcpOpts) {
    this.endpoint = endpoint || "http://localhost:18672/mcp";
    this.token = token;
    this.http = http;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${this.token}`,
    };
    if (this.sessionId) h["Mcp-Session-Id"] = this.sessionId;
    return h;
  }

  private async rpc(
    body: unknown,
    { timeout = 30000, parse = true }: { timeout?: number; parse?: boolean } = {},
  ): Promise<any> {
    let res: HttpResult;
    try {
      res = await this.http({
        url: this.endpoint,
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        timeout,
      });
    } catch (err) {
      throw new McpError(`网络错误：${err instanceof Error ? err.message : String(err)}`, true);
    }
    if (res.status === 401) {
      this.ready = false;
      throw new McpError("Token 无效或缺失（HTTP 401）");
    }
    if (res.status < 200 || res.status >= 300) {
      this.ready = false;
      const e = new McpError(`HTTP ${res.status}: ${String(res.text || "").slice(0, 200)}`);
      e.retryable = /session/i.test(String(res.text)) || res.status === 404;
      throw e;
    }
    const sid = pickHeader(res.headers, "mcp-session-id");
    if (sid) this.sessionId = sid;
    return parse ? parseBody(res.text) : null;
  }

  /** 握手：initialize + notifications/initialized（通知无 id、202 空体、不解析） */
  async init(): Promise<void> {
    this.ready = false;
    await this.rpc({
      jsonrpc: "2.0",
      id: this.id++,
      method: "initialize",
      params: {
        protocolVersion: PROTOCOL,
        capabilities: {},
        clientInfo: { name: "orca-bookmarks", version: "0.1.0" },
      },
    });
    await this.rpc(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { timeout: 10000, parse: false },
    );
    this.ready = true;
  }

  private async ensure(): Promise<void> {
    if (!this.ready) await this.init();
  }

  /** 会话失效自愈：retryable 错误 → 清状态重握手再试一次 */
  private async withSession<T>(fn: () => Promise<T>): Promise<T> {
    await this.ensure();
    try {
      return await fn();
    } catch (err) {
      if (err instanceof McpError && err.retryable) {
        this.sessionId = null;
        this.ready = false;
        await this.ensure();
        return fn();
      }
      throw err;
    }
  }

  /** 测试连接用：裸握手，成功即 true */
  async ping(): Promise<void> {
    await this.init();
  }

  async listTools(): Promise<{ name: string; description?: string; inputSchema?: unknown }[]> {
    return this.withSession(async () => {
      const r = await this.rpc({ jsonrpc: "2.0", id: this.id++, method: "tools/list" });
      if (r?.error) throw new McpError(`${r.error.code}: ${r.error.message}`);
      return r?.result?.tools ?? [];
    });
  }

  async call(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.withSession(async () => {
      const r = await this.rpc({
        jsonrpc: "2.0",
        id: this.id++,
        method: "tools/call",
        params: { name, arguments: args },
      });
      if (r?.error) throw new McpError(`${r.error.code}: ${r.error.message}`);
      return unwrapResult(r?.result);
    });
  }
}
