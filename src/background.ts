/**
 * background service worker（MV3, module）。
 * 1. MCP HTTP 代理：页面侧 fetch localhost 受 CORS 限制，统一走 SW（host_permissions 绕 CORS）。
 * 2. 独立音乐播放标签页单例管理：通过 chrome.tabs 保持单个播放器后台页面，避免重复开多个。
 */

interface HttpMsg {
  type: "orca:http";
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

interface OpenPlayerMsg {
  type: "orca:music:open-player";
  trackIndex?: number;
}

const HTTP_TIMEOUT_DEFAULT = 30_000;
let playerTabId: number | null = null;

async function openOrFocusPlayerTab(trackIndex?: number): Promise<void> {
  const playerUrl = chrome.runtime.getURL(`player/player.html${typeof trackIndex === "number" ? `?index=${trackIndex}` : ""}`);

  if (playerTabId !== null) {
    try {
      const tab = await chrome.tabs.get(playerTabId);
      if (tab && tab.id) {
        // 已经在运行中：如果指定了新的切歌，更新其 URL
        if (typeof trackIndex === "number") {
          await chrome.tabs.update(tab.id, { url: playerUrl, active: false });
        }
        return;
      }
    } catch {
      playerTabId = null;
    }
  }

  // 创建一个后台静默标签页（active: false），不抢占用户当前正浏览的网页
  const created = await chrome.tabs.create({ url: playerUrl, active: false });
  playerTabId = created.id ?? null;
}

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === playerTabId) {
    playerTabId = null;
  }
});

chrome.runtime.onMessage.addListener((msg: HttpMsg | OpenPlayerMsg, _sender, sendResponse) => {
  if (msg?.type === "orca:music:open-player") {
    openOrFocusPlayerTab(msg.trackIndex)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (msg?.type !== "orca:http") return;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), msg.timeout ?? HTTP_TIMEOUT_DEFAULT);
  fetch(msg.url, {
    method: msg.method,
    headers: msg.headers,
    body: msg.body,
    signal: ctl.signal,
  })
    .then(async (r) => {
      const headers: Record<string, string> = {};
      r.headers.forEach((v, k) => (headers[k] = v));
      sendResponse({ status: r.status, text: await r.text(), headers });
    })
    .catch((e: unknown) => {
      sendResponse({ status: 0, text: e instanceof Error ? e.message : String(e), headers: {} });
    })
    .finally(() => clearTimeout(timer));
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("[orca-bookmarks] installed");
});
