/**
 * 独立的后台常驻音乐播放器标签页逻辑：
 * 1. 作为真实的浏览器页面运行，享有完整的 Autoplay 音频发声权限，绝不静音。
 * 2. 关闭扩展弹窗也能持续播放，只要不关闭本标签页就一直循环播放歌单。
 * 3. 支持顺序/随机切换、上一首/下一首，遇到播放故障或无法访问自动切歌。
 */
import { loadCachedEntries, loadUiState, saveUiState } from "../../store/cache";
import type { UrlEntry } from "../../mcp/client";

interface MusicPlayerState {
  playlist: UrlEntry[];
  currentIndex: number;
  isPlaying: boolean;
  mode: "order" | "random";
}

const state: MusicPlayerState = {
  playlist: [],
  currentIndex: 0,
  isPlaying: false,
  mode: "order",
};

let playTimeoutTimer: number | undefined;

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function isMusicEntry(e: UrlEntry): boolean {
  const hasMusicTag = (e.tags ?? []).some((t) =>
    /音乐|music|song|bgm|网易云/i.test(t)
  );
  const isMusicUrl =
    /music\.163\.com/i.test(e.url) ||
    ((e.tags ?? []).some((t) => /音乐|bgm/i.test(t)) &&
      (/bilibili\.com\/video/i.test(e.url) || /youtube\.com|youtu\.be/i.test(e.url)));
  return hasMusicTag || isMusicUrl;
}

function getEmbedUrl(entry: UrlEntry): string | null {
  const url = entry.url;
  // 1. 网易云音乐
  const ncm = /id=(\d+)/.exec(url);
  if (/music\.163\.com/i.test(url) && ncm) {
    return `https://music.163.com/outchain/player?type=2&id=${ncm[1]}&auto=1&height=66`;
  }

  // 2. 哔哩哔哩
  const bvidM = /(BV[a-zA-Z0-9]+)/i.exec(url);
  if (/bilibili\.com/i.test(url) && bvidM) {
    return `https://player.bilibili.com/player.html?bvid=${bvidM[1]}&autoplay=1&muted=0&page=1&high_quality=1`;
  }

  // 3. YouTube
  const ytM = /(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/.exec(url);
  if ((/youtube\.com/i.test(url) || /youtu\.be/i.test(url)) && ytM) {
    return `https://www.youtube.com/embed/${ytM[1]}?autoplay=1&rel=0`;
  }

  return null;
}

function renderPlaylist(): void {
  const listEl = el("playlist");
  listEl.textContent = "";

  state.playlist.forEach((item, idx) => {
    const row = document.createElement("div");
    row.className = "player-playlist__item" + (idx === state.currentIndex ? " player-playlist__item--active" : "");
    row.addEventListener("click", () => playTrack(idx));

    const titleSpan = document.createElement("span");
    titleSpan.className = "player-playlist__title";
    titleSpan.textContent = `${idx + 1}. ${item.title || item.url}`;
    titleSpan.title = item.title || item.url;

    const tagSpan = document.createElement("span");
    tagSpan.className = "player-playlist__tag";
    if (/music\.163\.com/i.test(item.url)) tagSpan.textContent = "网易云音乐";
    else if (/bilibili\.com/i.test(item.url)) tagSpan.textContent = "哔哩哔哩";
    else if (/youtube\.com|youtu\.be/i.test(item.url)) tagSpan.textContent = "YouTube";
    else tagSpan.textContent = "其他";

    row.appendChild(titleSpan);
    row.appendChild(tagSpan);
    listEl.appendChild(row);
  });
}

function playTrack(index: number): void {
  if (!state.playlist.length) {
    el("player-title").textContent = "未找到带音乐标签的网址条目";
    el("player-meta").textContent = "0/0";
    return;
  }

  if (index < 0) index = state.playlist.length - 1;
  if (index >= state.playlist.length) index = 0;

  state.currentIndex = index;
  state.isPlaying = true;

  const cur = state.playlist[index];
  el("player-title").textContent = cur.title || cur.url;
  el("player-title").title = cur.title || cur.url;
  document.title = `🎵 ${cur.title || "Orca 音乐播放器"}`;

  let platform = "其他";
  if (/music\.163\.com/i.test(cur.url)) platform = "网易云音乐";
  else if (/bilibili\.com/i.test(cur.url)) platform = "哔哩哔哩";
  else if (/youtube\.com|youtu\.be/i.test(cur.url)) platform = "YouTube";

  el("player-meta").textContent = `[${platform}] ${index + 1} / ${state.playlist.length}`;
  el("player-play").textContent = "⏸ 暂停";
  el("player-status").textContent = "播放中";

  renderPlaylist();

  const wrap = el("player-frame-wrap");
  wrap.textContent = "";

  const embedUrl = getEmbedUrl(cur);
  if (!embedUrl) {
    console.warn("[player] 无法解析嵌入地址，尝试下一首：", cur.url);
    window.setTimeout(() => nextTrack(), 500);
    return;
  }

  const iframe = document.createElement("iframe");
  iframe.src = embedUrl;
  iframe.allow = "autoplay; encrypted-media; picture-in-picture";
  iframe.title = cur.title;

  window.clearTimeout(playTimeoutTimer);
  let hasLoaded = false;
  iframe.onload = () => {
    hasLoaded = true;
  };
  iframe.onerror = () => {
    console.warn("[player] 加载出错，自动切下一首：", cur.url);
    nextTrack();
  };

  if (/youtube/i.test(embedUrl)) {
    playTimeoutTimer = window.setTimeout(() => {
      if (!hasLoaded) {
        console.warn("[player] YouTube 连接超时，自动下一首：", cur.url);
        nextTrack();
      }
    }, 9000);
  }

  wrap.appendChild(iframe);
  void saveUiState({ musicCurrentIndex: index, musicIsPlaying: true });
}

function nextTrack(): void {
  if (!state.playlist.length) return;
  if (state.mode === "random") {
    let nextIdx = Math.floor(Math.random() * state.playlist.length);
    if (state.playlist.length > 1 && nextIdx === state.currentIndex) {
      nextIdx = (nextIdx + 1) % state.playlist.length;
    }
    playTrack(nextIdx);
  } else {
    playTrack((state.currentIndex + 1) % state.playlist.length);
  }
}

function prevTrack(): void {
  if (!state.playlist.length) return;
  playTrack((state.currentIndex - 1 + state.playlist.length) % state.playlist.length);
}

async function init(): Promise<void> {
  const [cached, uiState] = await Promise.all([
    loadCachedEntries(),
    loadUiState(),
  ]);

  if (cached && cached.length) {
    state.playlist = cached.filter(isMusicEntry);
  }

  el("playlist-count").textContent = String(state.playlist.length);

  // 读取查询参数中指定的切歌索引
  const urlParams = new URLSearchParams(window.location.search);
  const paramIndex = urlParams.get("index");
  if (paramIndex !== null) {
    state.currentIndex = parseInt(paramIndex, 10) || 0;
  } else if (uiState && typeof uiState.musicCurrentIndex === "number") {
    state.currentIndex = uiState.musicCurrentIndex;
  }

  if (uiState?.musicMode) {
    state.mode = uiState.musicMode;
    el("player-mode").textContent = state.mode === "order" ? "🔁 顺序播放" : "🔀 随机播放";
  }

  el("player-mode").addEventListener("click", () => {
    state.mode = state.mode === "order" ? "random" : "order";
    el("player-mode").textContent = state.mode === "order" ? "🔁 顺序播放" : "🔀 随机播放";
    void saveUiState({ musicMode: state.mode });
  });

  el("player-play").addEventListener("click", () => {
    if (state.isPlaying) {
      state.isPlaying = false;
      el("player-play").textContent = "▶ 播放";
      el("player-status").textContent = "已暂停";
      el("player-frame-wrap").textContent = "";
      window.clearTimeout(playTimeoutTimer);
      void saveUiState({ musicIsPlaying: false });
    } else {
      playTrack(state.currentIndex);
    }
  });

  el("player-next").addEventListener("click", nextTrack);
  el("player-prev").addEventListener("click", prevTrack);

  renderPlaylist();

  // 自动开始播放当前选中的首曲
  if (state.playlist.length > 0) {
    playTrack(state.currentIndex);
  }
}

void init();
