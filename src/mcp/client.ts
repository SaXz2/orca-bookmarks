/**
 * MCP 连接与查询客户端（接口层）。
 * 真实实现：RealMcpClient（连接层 OrcaMcp + 查询层，按 @12 调研落地）。
 * Mock 实现：MockMcpClient（无后端场景/UI 联调）。
 */

/** OrcaNote 里的一个「网址标签」条目（字段名待调研报告确认，先用内部统一模型）。 */
export interface UrlEntry {
  /** 条目 id */
  id: string;
  /** 标题 */
  title: string;
  /** URL */
  url: string;
  /** 封面图 URL；无封面则为 null */
  cover: string | null;
  /** 所属标签名（原始拼写，如 "哔哩哔哩" / "网址"） */
  tags: string[];
  /** 所属笔记库 id 与名称（跨库来源标识） */
  repoId: string;
  repoName: string;
  /** 收藏日志日期（如 2026-09-08，从所在日志页提取） */
  date?: string;
}

export interface McpConfig {
  /** MCP HTTP 端点，默认 http://localhost:18672/mcp */
  endpoint: string;
  /** MCP Token */
  token: string;
  /** repoId */
  repoId: string;
}

export interface McpClient {
  /** 测试连接（initialize 握手），返回是否可用 */
  ping(): Promise<boolean>;
  /** 按标签查询全部条目 */
  queryByTag(tag: string): Promise<UrlEntry[]>;
  /** 枚举所有库/笔记（跨库能力受限，无枚举工具，只能按 repoId 逐个查） */
  listRepos(): Promise<{ id: string; name: string }[]>;
}

// ---------------------------------------------------------------------------
// Mock 实现：数据来自 src/mock/mockData.ts，供无后端场景/UI 联调。
// ---------------------------------------------------------------------------

import { mockEntries, mockRepos } from "../mock/mockData";
import { RealMcpClient } from "./realClient";

export class MockMcpClient implements McpClient {
  constructor(private cfg: McpConfig) {}

  async ping(): Promise<boolean> {
    return Boolean(this.cfg.endpoint && this.cfg.token);
  }

  async queryByTag(tag: string): Promise<UrlEntry[]> {
    const t = tag.toLowerCase();
    return mockEntries.filter((e) => e.tags.some((x) => x.toLowerCase() === t));
  }

  async listRepos() {
    return mockRepos;
  }
}

/** 根据配置创建客户端。默认 RealMcpClient（查询层已按 @12 调研落地）；MockMcpClient 保留给无后端场景。 */
export function createMcpClient(cfg: McpConfig, repoName = ""): McpClient {
  // 真实客户端已就绪；如需要回退 mock，改这一行：
  // return new MockMcpClient(cfg);
  return new RealMcpClient(cfg, repoName);
}

/** 测试连接专用：真实裸 initialize 握手（不依赖查询层） */
export function testConnection(cfg: McpConfig): Promise<boolean> {
  return new RealMcpClient(cfg).ping();
}
