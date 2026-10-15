/**
 * popup：搜索框 + 文件夹切换 + 条目卡片列表。
 * 数据流：loadConfig → loadBookmarkEntries（真实 MCP 数据）。
 * 分组：只读导入 bookmarks/bookmarkTree 的 classify()（不改逻辑层）。
 * 文件夹固定为 bilibili / youtube / vimeo / 网址 / other；空文件夹也展示
 * （@0 拍板 A：「网址」当前 0 条时显示空态）。
 */
import { loadBookmarkEntries } from "../../mcp/loader";
import { loadConfig, isConfigured } from "../../store/config";
import { loadCachedEntries, saveCachedEntries, loadUiState, saveUiState } from "../../store/cache";
import { classify, FOLDER_ORDER, type FolderName } from "../../bookmarks/bookmarkTree";
import { buildIndex, search, type SearchIndex } from "../../search/search";
import { renderCover, renderFavicon } from "../cover";
import type { UrlEntry } from "../../mcp/client";

/** 文件夹顺序（与 bookmarkTree 纯标签分组规则一致） */
const FOLDERS = FOLDER_ORDER;
type FolderId = FolderName;
type TabId = FolderId | "all";

// ?theme=dark 供预览/无头截图强制暗色
if (new URLSearchParams(location.search).get("theme") === "dark") {
  document.documentElement.dataset.theme = "dark";
}

let entries: UrlEntry[] = [];
let index: SearchIndex = buildIndex([]);
let activeTab: TabId = "all";
let query = "";
const collapsedFolders = new Set<FolderId>();

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 状态条：加载中（spinner）/ 同步中 / 未配置（链接）/ 错误（重试按钮） */
function setStatus(text: string, kind: "" | "loading" | "syncing" | "error" = ""): void {
  const statusEl = el("status");
  statusEl.textContent = "";
  statusEl.className = kind ? `popup-status popup-status--${kind}` : "popup-status";
  if (text) statusEl.append(text);
}

async function load(): Promise<void> {
  // 1. 本地秒开：并行读取缓存条目与上次操作状态
  const [cachedEntries, uiState] = await Promise.all([
    loadCachedEntries(),
    loadUiState(),
  ]);

  let hasCached = false;
  if (cachedEntries && cachedEntries.length > 0) {
    hasCached = true;
    entries = cachedEntries;
    index = buildIndex(entries);

    // 恢复历史浏览状态
    if (uiState) {
      if (uiState.activeTab) activeTab = uiState.activeTab as TabId;
      if (uiState.query) {
        query = uiState.query;
        el<HTMLInputElement>("search").value = query;
      }
      if (uiState.collapsedFolders) {
        collapsedFolders.clear();
        uiState.collapsedFolders.forEach((f) => collapsedFolders.add(f as FolderId));
      }
    }

    // 0ms 即时渲染页面
    renderTabs();
    renderList();

    if (uiState?.scrollTop) {
      el("list").scrollTop = uiState.scrollTop;
    }

    setStatus("后台同步中…", "syncing");
  } else {
    // 首次无缓存，展示全量加载骨架态
    el("list").textContent = "";
    el("folder-tabs").textContent = "";
    setStatus("首次加载中…", "loading");
  }

  // 2. 校验配置
  let cfg;
  try {
    cfg = await loadConfig();
  } catch (err) {
    if (!hasCached) {
      setStatus(`配置读取失败：${errMsg(err)}`, "error");
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "popup-status__retry";
      retry.textContent = "重试";
      retry.addEventListener("click", () => void load());
      el("status").appendChild(retry);
    }
    return;
  }

  if (!isConfigured(cfg)) {
    if (!hasCached) {
      setStatus("请先配置 MCP Token / repoId");
      const link = document.createElement("a");
      link.className = "popup-status__link";
      link.href = "#";
      link.textContent = "去配置 →";
      link.addEventListener("click", (ev) => {
        ev.preventDefault();
        void chrome.runtime.openOptionsPage();
      });
      el("status").appendChild(link);
    }
    return;
  }

  // 3. 静默拉取最新数据（不打断用户界面浏览）
  try {
    const freshEntries = await loadBookmarkEntries(cfg);

    const isDifferent =
      !hasCached ||
      entries.length !== freshEntries.length ||
      !entries.every(
        (e, i) =>
          e.id === freshEntries[i]?.id &&
          e.title === freshEntries[i]?.title &&
          e.url === freshEntries[i]?.url,
      );

    if (isDifferent) {
      const currentScroll = el("list").scrollTop;
      entries = freshEntries;
      await saveCachedEntries(entries);
      index = buildIndex(entries);
      renderTabs();
      renderList();
      el("list").scrollTop = currentScroll;
    }

    setStatus("");
  } catch (err) {
    if (!hasCached) {
      setStatus(`加载失败：${errMsg(err)}`, "error");
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "popup-status__retry";
      retry.textContent = "重试";
      retry.addEventListener("click", () => void load());
      el("status").appendChild(retry);
    } else {
      console.warn("[popup] 后台静默同步失败（沿用缓存数据）：", err);
      setStatus("");
    }
  }
}

/** 文件夹 tabs：全部 + 四个固定文件夹，计数基于全量数据（不随搜索变化） */
function renderTabs(): void {
  const tabsEl = el("folder-tabs");
  const counts = new Map<FolderId, number>(FOLDERS.map((f) => [f, 0]));
  for (const e of entries) {
    const f = classify(e);
    counts.set(f, (counts.get(f) ?? 0) + 1);
  }

  tabsEl.textContent = "";
  const mk = (id: TabId, label: string, count: number): void => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "popup-tabs__tab" + (id === activeTab ? " popup-tabs__tab--active" : "");
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(id === activeTab));
    b.dataset.tab = id;
    b.textContent = `${label} (${count})`;
    b.addEventListener("click", () => {
      activeTab = id;
      void saveUiState({ activeTab });
      renderTabs();
      renderList();
    });
    tabsEl.appendChild(b);
  };
  mk("all", "全部", entries.length);
  for (const f of FOLDERS) mk(f, f, counts.get(f) ?? 0);

  // tablist 无障碍：左右方向键移动焦点
  const tabs = [...tabsEl.querySelectorAll<HTMLButtonElement>(".popup-tabs__tab")];
  tabs.forEach((b, i) => {
    b.addEventListener("keydown", (ev) => {
      if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
      ev.preventDefault();
      const next =
        ev.key === "ArrowRight" ? (i + 1) % tabs.length : (i - 1 + tabs.length) % tabs.length;
      tabs[next]!.focus();
    });
  });
}

/** 列表：全部 tab 显示文件夹分组；单个文件夹 tab 显示扁平列表 */
function renderList(): void {
  const listEl = el("list");
  listEl.textContent = "";
  const matched = search(index, query);
  const visible =
    activeTab === "all" ? matched : matched.filter((e) => classify(e) === activeTab);

  if (activeTab === "all") {
    for (const f of FOLDERS) {
      listEl.appendChild(renderFolderGroup(f, visible.filter((e) => classify(e) === f)));
    }
  } else {
    for (const e of visible) listEl.appendChild(renderItem(e));
    if (!visible.length) {
      listEl.appendChild(renderEmpty(query.trim() ? "无匹配结果" : "该标签下暂无条目"));
    }
  }
}

function renderFolderGroup(folder: FolderId, group: UrlEntry[]): HTMLElement {
  const wrap = document.createElement("section");
  const isCollapsed = collapsedFolders.has(folder);
  wrap.className = "popup-folder" + (isCollapsed ? " popup-folder--collapsed" : "");

  const h = document.createElement("div");
  h.className = "popup-folder__header";
  h.setAttribute("role", "button");
  h.setAttribute("tabindex", "0");
  h.setAttribute("aria-expanded", String(!isCollapsed));

  const arrow = document.createElement("span");
  arrow.className = "popup-folder__arrow";
  arrow.textContent = isCollapsed ? "▸" : "▾";

  const title = document.createElement("span");
  title.className = "popup-folder__title";
  title.textContent = `${folder} (${group.length})`;

  h.append(arrow, title);

  const toggle = () => {
    if (collapsedFolders.has(folder)) {
      collapsedFolders.delete(folder);
      wrap.classList.remove("popup-folder--collapsed");
      arrow.textContent = "▾";
      h.setAttribute("aria-expanded", "true");
    } else {
      collapsedFolders.add(folder);
      wrap.classList.add("popup-folder--collapsed");
      arrow.textContent = "▸";
      h.setAttribute("aria-expanded", "false");
    }
    void saveUiState({ collapsedFolders: Array.from(collapsedFolders) });
  };

  h.addEventListener("click", toggle);
  h.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      toggle();
    }
  });

  wrap.appendChild(h);

  const content = document.createElement("div");
  content.className = "popup-folder__content";
  if (!group.length) {
    content.appendChild(renderEmpty(query.trim() ? "无匹配结果" : "该标签下暂无条目"));
  }
  for (const e of group) content.appendChild(renderItem(e));
  wrap.appendChild(content);

  return wrap;
}

function renderEmpty(text: string): HTMLElement {
  const d = document.createElement("div");
  d.className = "popup-empty";
  d.textContent = text;
  return d;
}

/** 条目卡片：封面缩略图（无封面用 favicon）+ 标题 + 日志日期 + URL，点击新标签打开 */
function renderItem(e: UrlEntry): HTMLElement {
  const a = document.createElement("a");
  a.className = "popup-item";
  a.href = e.url;
  a.target = "_blank";
  a.rel = "noopener";

  const media = document.createElement("div");
  if (e.cover) {
    media.className = "popup-item__media";
    renderCover(media, e.cover);
  } else {
    media.className = "popup-item__media popup-item__media--favicon";
    renderFavicon(media, e.url);
  }

  const body = document.createElement("div");
  body.className = "popup-item__body";
  const title = document.createElement("div");
  title.className = "popup-item__title";
  const titleText = e.title || e.url;
  title.textContent = titleText;
  title.title = titleText;

  const meta = document.createElement("div");
  meta.className = "popup-item__meta";

  if (e.date) {
    const dateEl = document.createElement("span");
    dateEl.className = "popup-item__date";
    dateEl.textContent = e.date;
    meta.appendChild(dateEl);
  }

  const url = document.createElement("div");
  url.className = "popup-item__url";
  url.textContent = e.url;
  url.title = e.url;
  meta.appendChild(url);

  body.append(title, meta);

  // 渲染标签胶囊（展示前4个有效标签，点击可快速触发连通搜索）
  const validTags = (e.tags ?? []).filter((t) => t && t.length <= 25 && !/^https?:\/\//i.test(t));
  if (validTags.length > 0) {
    const tagsWrap = document.createElement("div");
    tagsWrap.className = "popup-item__tags";
    for (const tag of validTags.slice(0, 4)) {
      const tagEl = document.createElement("span");
      tagEl.className = "popup-tag";
      tagEl.textContent = `#${tag}`;
      tagEl.title = `点击筛选 #${tag}`;
      tagEl.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const sInput = el<HTMLInputElement>("search");
        sInput.value = tag;
        query = tag;
        void saveUiState({ query });
        renderList();
        sInput.focus();
      });
      tagsWrap.appendChild(tagEl);
    }
    body.appendChild(tagsWrap);
  }

  // 跳转到虎鲸笔记原笔记块的按钮（orca-note://<repoId>/block?blockId=<id>）
  const noteBtn = document.createElement("button");
  noteBtn.type = "button";
  noteBtn.className = "popup-item__action";
  noteBtn.title = "在虎鲸笔记中打开此条目";
  noteBtn.setAttribute("aria-label", "在虎鲸笔记中打开此条目");
  // 虎鲸/笔记小图标
  noteBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>`;
  noteBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const noteUri = `orca-note://${e.repoId || "iwy5nfalj9l1y"}/block?blockId=${e.id}`;
    // 通过 window.location.href 触发注册的协议 Handler，实现本地唤起
    window.location.href = noteUri;
  });

  a.append(media, body, noteBtn);
  return a;
}

function boot(): void {
  let searchTimer: number | undefined;
  el<HTMLInputElement>("search").addEventListener("input", (ev) => {
    query = (ev.target as HTMLInputElement).value;
    renderList();
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      void saveUiState({ query });
    }, 250);
  });

  let scrollTimer: number | undefined;
  el("list").addEventListener(
    "scroll",
    () => {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        void saveUiState({ scrollTop: el("list").scrollTop });
      }, 200);
    },
    { passive: true },
  );

  window.addEventListener("pagehide", () => {
    void saveUiState({
      activeTab,
      query,
      scrollTop: el("list").scrollTop,
      collapsedFolders: Array.from(collapsedFolders),
    });
  });

  el("open-options").addEventListener("click", (ev) => {
    ev.preventDefault();
    void chrome.runtime.openOptionsPage();
  });
  void load();
}

boot();
