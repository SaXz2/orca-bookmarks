/**
 * 本地缓存与状态持久化模块 (chrome.storage.local)
 *
 * 功能：
 * 1. 缓存书签条目（cached_entries）：下次点击打开弹窗秒开（0ms），无需等待网络请求
 * 2. 记住用户上次浏览状态（ui_state）：恢复上次选中的标签（activeTab）、搜索关键词（query）、
 *    滚动位置（scrollTop）、文件夹展开/折叠状态（collapsedFolders）
 */
import type { UrlEntry } from "../mcp/client";

export interface UiState {
  activeTab?: string;
  query?: string;
  scrollTop?: number;
  collapsedFolders?: string[];
  popupWidth?: number;
  popupHeight?: number;
  customFolders?: string[];
  musicMode?: "order" | "random";
  musicCurrentIndex?: number;
  musicIsOpen?: boolean;
}

interface CacheWrapper {
  entries: UrlEntry[];
  cachedAt: number;
}

const CACHE_ENTRIES_KEY = "orca_cached_bookmarks_v1";
const UI_STATE_KEY = "orca_ui_state_v1";

/** 读取已缓存的书签列表（秒开用） */
export async function loadCachedEntries(): Promise<UrlEntry[] | null> {
  try {
    const res = await chrome.storage.local.get(CACHE_ENTRIES_KEY);
    const wrapper = res[CACHE_ENTRIES_KEY] as CacheWrapper | undefined;
    if (wrapper && Array.isArray(wrapper.entries) && wrapper.entries.length > 0) {
      return wrapper.entries;
    }
  } catch (err) {
    console.warn("[cache] loadCachedEntries error:", err);
  }
  return null;
}

/** 保存最新的书签列表到本地缓存 */
export async function saveCachedEntries(entries: UrlEntry[]): Promise<void> {
  try {
    const wrapper: CacheWrapper = {
      entries,
      cachedAt: Date.now(),
    };
    await chrome.storage.local.set({ [CACHE_ENTRIES_KEY]: wrapper });
  } catch (err) {
    console.warn("[cache] saveCachedEntries error:", err);
  }
}

/** 读取上一次的 UI 操作状态（分类、搜索词、滚动位置、折叠状态） */
export async function loadUiState(): Promise<UiState | null> {
  try {
    const res = await chrome.storage.local.get(UI_STATE_KEY);
    return (res[UI_STATE_KEY] as UiState) || null;
  } catch (err) {
    console.warn("[cache] loadUiState error:", err);
  }
  return null;
}

/** 保存当前的 UI 操作状态 */
export async function saveUiState(state: UiState): Promise<void> {
  try {
    // 浅合并已有状态，避免覆盖未提供的字段
    const current = (await loadUiState()) || {};
    const merged = { ...current, ...state };
    await chrome.storage.local.set({ [UI_STATE_KEY]: merged });
  } catch (err) {
    console.warn("[cache] saveUiState error:", err);
  }
}
