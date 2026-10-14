/**
 * options：endpoint / MCP Token / repoId 配置 + 测试连接。
 * 测试连接 = 裸 initialize 握手（可达性 + Token 有效性），反馈四态：
 * 成功（ok）/ 失败（error）/ 缺配置（warn，不调接口）/ 测试中（pending）。
 */
import { loadConfig, saveConfig, isConfigured } from "../../store/config";
import { testConnection } from "../../mcp/client";

// ?theme=dark 供预览/无头截图强制暗色
if (new URLSearchParams(location.search).get("theme") === "dark") {
  document.documentElement.dataset.theme = "dark";
}

async function main(): Promise<void> {
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

  function setMsg(text: string, kind: "" | "ok" | "error" | "warn" | "pending" = ""): void {
    msgEl.textContent = text;
    msgEl.className = kind ? `options-msg options-msg--${kind}` : "options-msg";
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    await saveConfig(currentCfg());
    setMsg("已保存 ✓", "ok");
    setTimeout(() => setMsg(""), 2000);
  });

  testBtn.addEventListener("click", async () => {
    if (testBtn.disabled) return;
    const c = currentCfg();
    if (!isConfigured(c)) {
      setMsg("请先填写 MCP Token 与 repoId", "warn");
      return;
    }
    testBtn.disabled = true;
    setMsg("测试中…", "pending");
    try {
      await testConnection(c);
      setMsg("连接正常 ✓（握手成功，Token 有效）", "ok");
    } catch (err) {
      setMsg(`连接失败：${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      testBtn.disabled = false;
    }
  });
}

main();
