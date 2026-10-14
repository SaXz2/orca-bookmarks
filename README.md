# Orca Bookmarks

Chrome MV3 插件：读取虎鲸笔记(OrcaNote) MCP 端点（默认 `http://localhost:18672/mcp`）里的链接条目，作为浏览器收藏夹展示。

- 四个文件夹：`网址`（网址标签条目）、`bilibili`（哔哩哔哩标签/域名）、`youtube`（Youtube标签/域名）、`other`（散落链接）
- 本地搜索（标题 / URL / 标签）
- 条目带封面时显示缩略图

## 技术栈

TypeScript + esbuild（无框架），产物为纯 MV3 静态文件。

## 目录结构

```
src/
  manifest.json        MV3 manifest（构建时拷贝到 dist/）
  background.ts        service worker（orca:http fetch 代理）
  mcp/
    client.ts          McpClient 接口 + Mock + createMcpClient/testConnection
    transport.ts       OrcaMcp 连接层（streamable HTTP，initialize→tools/call）
    realClient.ts      真实客户端（query_blocks/get_blocks_text，正文解析）
    loader.ts          数据编排（kind:8 搜 http 分页拉全量 + 解析 + 去重）
  store/
    config.ts          endpoint / Token / repoId 存取（chrome.storage.sync）
  bookmarks/
    bookmarkTree.ts    条目 → 文件夹树（标签优先 > 域名兜底 > other）
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

## MCP 连接层说明

### 连接方式
streamable HTTP 单 POST + JSON-RPC 2.0：
`initialize`（protocolVersion `2025-06-18`）→ `notifications/initialized`（无 id，202 空体）→ `tools/call`。
请求头：`Content-Type: application/json`、`Accept: application/json, text/event-stream`、`Authorization: Bearer <Token>`。
响应 JSON/SSE 双兼容（SSE 取最后一条 `data:` 行），结果解包优先 `structuredContent`。

### query_blocks 参数结构（实测 2026-10-15）
| 查询类型 | 结构 | 实测结果 |
|---|---|---|
| **标签查询** | `{q:{kind:100, conditions:[{kind:4, name:"标签"}]}}` | ✅ 嵌套版可用（Youtube=18 条） |
| **文本搜索** | `{q:{kind:8, text:"http", raw:true}}` | ✅ 平铺版可用（363 条） |
| 标签查询平铺版 | `{q:{kind:4, name:"标签"}}` | ❌ 不报错但**静默返回 0 条** |
| 参数放 arguments 顶层 | `{kind:4, name:"标签"}` | ❌ 报 `invalid_arguments` |

⚠ **坑：平铺版标签查询静默返回 0 条**——不报错但永远空结果，是 @12 报告与实测差异的根因。

### 已知坑
- `totalCount` 被 `pageSize` 截断，不能当总数；分页拉到 `resultIds.length < pageSize` 为止
- `initialize` 实测无 `Mcp-Session-Id`（无状态）；兼容写法保留（有则回传，无则跳过）
- `kind:13` 格式查询找不到链接；散落链接用 `kind:8` 文本搜 `"http"`
- 所有工具必须传 `repoId`；无仓库枚举工具（`resources/list` 404）
- 不存在的 repoId 返回空成功、与空仓库无法区分
- 标签数据现状（2026-10-15 实测）：`Youtube`=18 条（嵌套版可查）；`网址`=0 条、`哔哩哔哩`=0 条（两版均 0，标签数据可能已变）；数据源用 `kind:8` 文本搜 http

### 分组规则（@0 拍板）
1. 标签优先：`哔哩哔哩` > `Youtube` > `网址`（双标签归 bilibili）
2. 域名兜底：bilibili.com/b23.tv → bilibili；youtube.com/youtu.be → youtube
3. 其余 → other
4. 「网址」文件夹保留（当前 0 条，空态文案提示「该标签下暂无条目」）
