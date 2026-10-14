/** popup：搜索框 + 文件夹树列表（当前使用 Mock 数据层，真实数据等 MCP 调研接入） */
import { createMcpClient } from "../../mcp/client";
import { loadConfig } from "../../store/config";
import { buildBookmarkTree } from "../../bookmarks/bookmarkTree";
import { buildIndex, search } from "../../search/search";
import { renderCover } from "../cover";

async function main() {
  const listEl = document.getElementById("list")!;
  const searchEl = document.getElementById("search") as HTMLInputElement;
  const statusEl = document.getElementById("status")!;

  const cfg = await loadConfig();
  const client = createMcpClient(cfg);

  statusEl.textContent = "加载中…";
  let entries: Awaited<ReturnType<typeof client.queryByTag>> = [];
  try {
    // TODO: 真实实现按「网址标签」tag 全量拉取（tag 名等 @12 调研确认）
    entries = await client.queryByTag("网址标签");
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
