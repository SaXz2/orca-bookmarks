/**
 * background service worker（MV3, module）。
 * MCP HTTP 代理：页面侧 fetch localhost 受 CORS 限制，统一走 SW（host_permissions 绕 CORS）。
 */

interface HttpMsg {
  type: "orca:http";
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

const HTTP_TIMEOUT_DEFAULT = 30_000;

chrome.runtime.onMessage.addListener((msg: HttpMsg, _sender, sendResponse) => {
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
