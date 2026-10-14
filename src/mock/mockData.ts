import type { UrlEntry } from "../mcp/client";

/**
 * Mock 数据：仅用于开发/演示。
 * 标签名与真实库对齐（@12 调研）：网址 / 哔哩哔哩 / Youtube（Y 大写）。
 */

export const mockRepos = [
  { id: "repo-1", name: "默认库" },
  { id: "repo-2", name: "收集箱" },
];

export const mockEntries: UrlEntry[] = [
  {
    id: "e1",
    title: "【4K】虎鲸笔记官方介绍",
    url: "https://www.bilibili.com/video/BV1xx411c7mD",
    cover: "https://i0.hdslb.com/bfs/archive/example1.jpg",
    tags: ["哔哩哔哩"],
    repoId: "repo-1",
    repoName: "默认库",
  },
  {
    id: "e2",
    title: "How OrcaNote Works - Youtube",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    cover: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    tags: ["Youtube"],
    repoId: "repo-1",
    repoName: "默认库",
  },
  {
    id: "e3",
    title: "",
    url: "https://example.com/article-without-title",
    cover: null,
    tags: ["网址"],
    repoId: "repo-2",
    repoName: "收集箱",
  },
  {
    id: "e4",
    title: "散落在普通笔记里的链接",
    url: "https://developer.chrome.com/docs/extensions/reference/api/storage",
    cover: null,
    tags: ["读书笔记"],
    repoId: "repo-2",
    repoName: "收集箱",
  },
];
