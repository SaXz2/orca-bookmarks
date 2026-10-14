/**
 * MCP 连接与查询客户端（接口层）。
 * 真实实现依赖 @12（OrcaNote MCP 查询能力调研）与 @21（shunshou 连接层分析）的报告；
 * 此处先定义接口 + Mock 实现，保证 UI/Store 层可并行开发。
 */

/** OrcaNote 里的一个「网址标签」条目（字段名待调研报告确认，先用内部统一模型）。 */
export interface UrlEntry {
  /** 条目 id */
  id: string;
  /** 标题 */
  title: string;
  /** URL */
  url: string;
  /** 封面图 URL；无封面则为 null（字段名/取法待调研确认） */
  cover: string | null;
  /** 所属标签名（原始拼写，如 "bilibili" / "网址标签"） */
  tags: string[];
  /** 所属笔记库 id 与名称（跨库来源标识） */
  repoId: string;
  repoName: string;
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
  /** 枚举所有库/笔记（跨库能力待调研，不支持则抛错或返回单库） */
  listRepos(): Promise<{ id: string; name: string }[]>;
}

// ---------------------------------------------------------------------------
// Mock 实现：数据来自 src/mock/mockData.ts，供 UI 开发与演示。
// 真实实现（RealMcpClient）等调研报告落地后填充 src/mcp/realClient.ts。
// ---------------------------------------------------------------------------

import { mockEntries, mockRepos } from "../mock/mockData";

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

/** 根据配置创建客户端。默认 Mock；@12 tools/list 落地后切 RealMcpClient（src/mcp/realClient.ts，连接层已就绪）。 */
export function createMcpClient(cfg: McpConfig): McpClient {
  // TODO: 等 @12 调研确认工具签名后切换到 RealMcpClient
  return new MockMcpClient(cfg);
}

/** 测试连接专用：真实裸 initialize 握手（不依赖查询层） */
export async function testConnection(cfg: McpConfig): Promise<boolean> {
  const { RealMcpClient } = await import("./realClient");
  return new RealMcpClient(cfg).ping();
}
