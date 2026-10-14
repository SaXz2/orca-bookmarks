/** popup：搜索框 + 文件夹树列表（真实数据：kind:8 搜 http 拉全量链接，按标签/域名分组） */
import { loadBookmarkEntries } from "../../mcp/loader";
import { loadConfig, isConfigured } from "../../store/config";
import { buildBookmarkTree } from "../../bookmarks/bookmarkTree";
import { buildIndex, search } from "../../search/search";
import { renderCover } from "../cover";
import type { UrlEntry } from "../../mcp/client";

async function main() {
  const listEl = document.getElementById("list")!;
  const searchEl = document.getElementById("search") as HTMLInputElement;
  const statusEl = document.getElementById("status")!;

  const cfg = await loadConfig();

  if (!isConfigured(cfg)) {
    statusEl.innerHTML = "请先配置 <a href=\"#\" id=\"go-options\">MCP Token / repoId</a>";
    statusEl.querySelector("#go-options")!.addEventListener("click", (ev) => {
      ev.preventDefault();
      void chrome.runtime.openOptionsPage();
    });
    return;
  }

  statusEl.textContent = "加载中…";
  let entries: UrlEntry[];
  try {
    entries = await loadBookmarkEntries(cfg);
  } catch (err) {
    statusEl.textContent = `加载失败：${err instanceof Error ? err.message : String(err)}`;
    return;
  }
  statusEl.textContent = "";

  const index = buildIndex(entries);

  function render(query: string) {
    listEl.textContent = "";
    const matched = search(index, query);
    const folders = buildBookmarkTree(matched);
    for (const folder of folders) {
      const fEl = document.createElement("div");
      fEl.className = "folder";
      const h = document.createElement("div");
      h.className = "folder-name";
      h.textContent = `${folder.name} (${folder.children.length})`;
      fEl.appendChild(h);
      for (const node of folder.children) {
        const e = node.entry;
        const item = document.createElement("a");
        item.className = "item";
        item.href = e.url;
        item.target = "_blank";

        const cover = document.createElement("div");
        cover.className = "cover";
        renderCover(cover, e.cover);

        const title = document.createElement("div");
        title.className = "item-title";
        title.textContent = e.title || e.url;

        item.append(cover, title);
        fEl.appendChild(item);
      }
      listEl.appendChild(fEl);
    }
    if (!folders.length) {
      statusEl.textContent = "无匹配结果";
    }
  }

  document.getElementById("open-options")!.addEventListener("click", (ev) => {
    ev.preventDefault();
    void chrome.runtime.openOptionsPage();
  });

  render("");
  searchEl.addEventListener("input", () => render(searchEl.value));
}

main();
