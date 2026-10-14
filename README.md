# Orca Bookmarks

Chrome MV3 插件：读取虎鲸笔记(OrcaNote) MCP 端点（默认 `http://localhost:18672/mcp`）里「网址标签」条目，作为浏览器收藏夹展示。

- bilibili / youtube 标签条目单独成文件夹；其他笔记库散落链接归入 `other`
- 本地搜索（标题 / URL / 标签）
- 条目带封面时显示缩略图

## 技术栈

TypeScript + esbuild（无框架），产物为纯 MV3 静态文件。

## 目录结构

```
src/
  manifest.json        MV3 manifest（构建时拷贝到 dist/）
  background.ts        service worker
  mcp/
    client.ts          MCP 客户端接口 + Mock 实现（真实实现待调研接入 realClient.ts）
  store/
    config.ts          endpoint / Token / repoId 存取（chrome.storage.sync）
  bookmarks/
    bookmarkTree.ts    网址标签 → 文件夹树（bilibili/youtube/other 分组规则）
  search/
    search.ts          本地搜索索引
  ui/
    cover.ts           封面渲染（含加载失败降级）
    popup/             弹窗：搜索 + 文件夹树列表
    options/           配置页：endpoint / Token / repoId + 测试连接
  mock/
    mockData.ts        开发用 mock 数据
```

## 构建

```bash
npm install
npm run build     # 产物在 dist/
npm run watch     # 开发监听模式
```

Chrome → 扩展程序 → 开发者模式 → 加载已解压的扩展程序 → 选择 `dist/`。

## 状态

骨架阶段：数据层为 Mock。真实 MCP 连接等待两份调研报告（OrcaNote MCP 查询能力、shunshou 连接层）落地后接入 `src/mcp/realClient.ts`。
