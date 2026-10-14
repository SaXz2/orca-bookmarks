/** options：endpoint / MCP Token / repoId 配置与连接测试 */
import { loadConfig, saveConfig } from "../../store/config";
import { testConnection } from "../../mcp/client";

async function main() {
  const endpointEl = document.getElementById("endpoint") as HTMLInputElement;
  const tokenEl = document.getElementById("token") as HTMLInputElement;
  const repoIdEl = document.getElementById("repoId") as HTMLInputElement;
  const msgEl = document.getElementById("msg")!;
  const form = document.getElementById("form") as HTMLFormElement;
  const testBtn = document.getElementById("test") as HTMLButtonElement;

  const cfg = await loadConfig();
  endpointEl.value = cfg.endpoint;
  tokenEl.value = cfg.token;
  repoIdEl.value = cfg.repoId;

  function currentCfg() {
    return {
      endpoint: endpointEl.value.trim(),
      token: tokenEl.value.trim(),
      repoId: repoIdEl.value.trim(),
    };
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    await saveConfig(currentCfg());
    msgEl.textContent = "已保存 ✓";
    setTimeout(() => (msgEl.textContent = ""), 2000);
  });

  testBtn.addEventListener("click", async () => {
    msgEl.textContent = "测试中…";
    try {
      // 裸 initialize 握手：看可达性 + Token 有效性
      await testConnection(currentCfg());
      msgEl.textContent = "连接正常 ✓";
    } catch (err) {
      msgEl.textContent = `连接失败：${err instanceof Error ? err.message : String(err)}`;
    }
  });
}

main();
