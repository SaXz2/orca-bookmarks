/**
 * background service worker（MV3, module）。
 * 1. MCP HTTP 代理：页面侧 fetch localhost 受 CORS 限制，统一走 SW（host_permissions 绕 CORS）。
 *    消息形状：{type:'orca:http', url, method, headers, body?, timeout?} → {status, text, headers}。
 * 2. OrcaMcp 客户端实例按 SW 生命周期缓存（同配置复用会话，省重复握手）。
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
      // 网络错误/超时 → status 0，调用方按非 2xx 处理
      sendResponse({ status: 0, text: e instanceof Error ? e.message : String(e), headers: {} });
    })
    .finally(() => clearTimeout(timer));
  return true; // 异步 sendResponse
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("[orca-bookmarks] installed");
});
