/**
 * 真实 MCP 客户端：实现 McpClient 接口，内部走 OrcaMcp 连接层。
 * 连接层已按 @21《shunshou MCP 连接层分析》落地；
 * ⚠ queryByTag / listRepos 的工具名与参数签名必须等 @12 的 tools/list 实测结果，
 * 在此之前 createMcpClient 仍默认返回 MockMcpClient。
 */
import type { McpClient, McpConfig, UrlEntry } from "./client";
import { OrcaMcp, backgroundHttp } from "./transport";

export class RealMcpClient implements McpClient {
  private mcp: OrcaMcp;
  private repoId: string;

  constructor(cfg: McpConfig) {
    this.mcp = new OrcaMcp({ endpoint: cfg.endpoint, token: cfg.token, http: backgroundHttp });
    this.repoId = cfg.repoId;
  }

  /** 裸 initialize 握手，看是否可达 + Token 是否有效 */
  async ping(): Promise<boolean> {
    await this.mcp.ping();
    return true;
  }

  /** 工具签名待 @12 tools/list 实测确认后实现 */
  async queryByTag(_tag: string): Promise<UrlEntry[]> {
    void this.repoId;
    throw new Error("按 tag 查询的工具签名待调研确认（@12 tools/list），查询层未接入");
  }

  /** 跨库枚举能力待 @12 确认（MCP 是否支持不传 repoId / 列库工具） */
  async listRepos(): Promise<{ id: string; name: string }[]> {
    throw new Error("库枚举能力待调研确认（@12 tools/list）");
  }

  /** 调研确认工具名后可用：const tools = await this.mcp.listTools(); */
  async listTools() {
    return this.mcp.listTools();
  }
}
