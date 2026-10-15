/**
 * background service worker（MV3, module）。
 * 1. MCP HTTP 代理：页面侧 fetch localhost 受 CORS 限制，统一走 SW（host_permissions 绕 CORS）。
 * 2. Offscreen 音频管理：负责创建与维护 offscreen document，弹窗关闭后音乐在后台继续播放。
 */

interface HttpMsg {
  type: "orca:http";
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

interface EnsureOffscreenMsg {
  type: "orca:music:ensure-offscreen";
}

const HTTP_TIMEOUT_DEFAULT = 30_000;

async function ensureOffscreenDocument(): Promise<void> {
  const OFFSCREEN_URL = "offscreen/offscreen.html";
  if (!chrome.offscreen) return;
  const existing = await chrome.offscreen.hasDocument();
  if (existing) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
    justification: "Background audio playback for bookmarks music player",
  });
}

chrome.runtime.onMessage.addListener((msg: HttpMsg | EnsureOffscreenMsg, _sender, sendResponse) => {
  if (msg?.type === "orca:music:ensure-offscreen") {
    ensureOffscreenDocument()
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
      // 网络错误/超时 → status 0，调用方按非 2xx 处理
      sendResponse({ status: 0, text: e instanceof Error ? e.message : String(e), headers: {} });
    })
    .finally(() => clearTimeout(timer));
  return true; // 异步 sendResponse
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("[orca-bookmarks] installed");
});
