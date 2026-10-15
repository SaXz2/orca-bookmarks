/** 配置存储：endpoint / MCP Token / repoId → chrome.storage.sync */
import type { McpConfig } from "../mcp/client";

const KEY = "mcpConfig";

export const DEFAULT_CONFIG: McpConfig = {
  endpoint: "http://localhost:18672/mcp",
  token: "orca-mcp",
  repoId: "iwy5nfalj9l1y",
};

export async function loadConfig(): Promise<McpConfig> {
  const obj = await chrome.storage.sync.get(KEY);
  return { ...DEFAULT_CONFIG, ...(obj[KEY] as Partial<McpConfig> | undefined) };
}

export async function saveConfig(cfg: McpConfig): Promise<void> {
  await chrome.storage.sync.set({ [KEY]: cfg });
}

/** 配置是否完整（token/repoId 非空即可用；endpoint 有默认值） */
export function isConfigured(cfg: McpConfig): boolean {
  return Boolean(cfg.token && cfg.repoId);
}
