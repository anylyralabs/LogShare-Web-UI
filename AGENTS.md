# LogShare.CN Web UI — Agent Guide

Vue 3 + TypeScript 5 + Vite 7 前端，Minecraft/Hytale 日志分享与分析平台；后端为 `~/LogShare/` 的 PHP API。

## 开发命令

- 包管理器是 **npm**（`packageManager: npm@11.12.1`，`package-lock.json` 已提交）；不要用 pnpm/yarn。
- `npm run dev`：Vite 开发服务器；`/v1` 由 `vite.config.ts` 代理到 `https://api.test.logshare.cn`。
- `npm run build`：固定链路 `vue-tsc -b` → 客户端构建 → SSR 构建到 `dist-ssr/` → `scripts/prerender.mjs` 预渲染并清理 `dist-ssr/`。单独 `vite build` 不含类型检查/预渲染。
- 无测试框架。验证改动通常 `npm run build`；`npm run lint` 带 `--fix` 会直接改文件。用户未明确要求时不要主动运行 build/lint。
- SDK 源码在 `public/sdk/{js,php,java,dotnet}`；修改后必须同步重打包 `public/sdk/logshare-*-sdk.zip`（`mclogs-js-sdk.zip`/`mclogs-php-sdk.zip` 是同一 JS/PHP 源的旧下载名）。

## 编码约定

- TS `strict` + `noUnusedLocals/Parameters`；`erasableSyntaxOnly` 禁止 `enum`/`namespace`；类型导入用 `import type`。
- Prettier：无分号、单引号、行宽 100、无尾逗号、LF；ESLint flat config 中 Prettier 仅 warn。`public/**` 被 ESLint/Prettier 忽略，改 `sw.js` 不会被检查。
- `@` 映射到 `src/`；基础 UI 组件在 `src/components/ui/`，不要引入 shadcn/Radix。

## 路由、SSG 与标题

- 路由定义在 `src/router/index.ts`。增改页面时按需同步：
  - `src/App.vue` 与 `src/components/MobileNav.vue` 的 `navLinks`
  - `src/lib/pageTitle.ts` 的 `pageTitleTemplates` + `getCurrentPageTemplate()` switch
  - `src/lib/i18nConfig.ts` 的 `zhCN`/`zhTW` 文案
  - 静态页还要加入 `scripts/prerender.mjs` 的 `routesToPrerender`
- SSG 页：`/`、`/api-docs`、`/sponsor`、`/tutorials` 与文章、`/groups`、`/launchers`、`/terms`、`/privacy` 及其别名，产物为 `dist/<path>/index.html`。`/:id`（日志页）和 404 保持 CSR。
- 教程文章 ID 与内容硬编码在 `TutorialArticleView.vue`；新增文章还要把 `/tutorials/<id>` 加入 prerender 列表。
- 静态页路由普遍带 `/index`、`.html` 别名，路由守卫再做兼容重定向；新增静态页时沿用同一模式。
- 客户端入口是 `createApp`（不是 `hydrate`），SSG 只负责首屏 HTML/SEO；不要假设客户端会水合服务端 DOM。
- `scripts/prerender.mjs` 对单个页面失败只打印 `✗`，不会让构建非零退出；新增页面后检查输出中的 `✓` 列表。

## PWA

- 更新链路唯一：`src/main.ts` 的 `updatefound` → `window.dispatchEvent(new CustomEvent('pwa-update-available'))` → `src/components/PwaUpdateToast.vue` 监听。改动需保留事件名与载荷。
- `public/sw.js` 不经过 ESLint/Prettier；缓存策略分三档（导航 network-first + 离线兜底、`/assets/` cache-first、其余同源 GET network-first）。改策略时同步提升 `CACHE_NAME`（当前 `logshare-runtime-v2`），否则旧缓存不会失效。

## 日志解析与渲染

- `src/lib/logParser.ts` 只是 Worker 桥接层；真正解析在 `src/lib/logParser.worker.ts`，输出逐行 `ParsedLogRow[]`（每行含行号与 HTML）。其 `COLOR_STYLE_MAP` 的 `format-*` 必须与 `src/assets/LogsAnalysis.css` 同步。
- 日志正文由 `src/components/VirtualLog.vue` 虚拟化渲染：窗口大小 = 当前可渲染行数 × 3；`wrapLines` 或“只看错误”时回退完整渲染。搜索结果可能不在 DOM 中，导航统一走 `VirtualLog.scrollToLine()`，不要直接依赖 `getElementById`。
- 日志正文经 `v-html` 注入：worker 先 `escapeHtml` 再拼标签。新增渲染路径必须保持转义，不要直接注入原始日志文本。

## API 层

- 业务 HTTP 统一走 `src/lib/ApiClient.ts`。`baseURL` 在 dev 为空（走 `/v1` 代理），生产为 `https://api.logshare.cn`。
- AI 深度分析已由外部服务承接；本前端不再包含 AI 面板、SSE 客户端或遥测 SDK。
- v1.8.5 起日志由文件列表组成：`POST /v1/log` 接受 `files`，同时兼容旧版 `content`（非空时映射为主文件，两者至少提供一个）；上传与元信息响应包含顶层 `raw`（单文件指向 `/v1/raw/{id}`；上传响应多文件指向 content 主文件，元信息响应多文件指向按名称排序的第一个文件）。`GET /v1/log/{id}` 返回 `files`/`requiresFileSelection`；多文件时 `GET /v1/raw/{id}` 与 `GET /v1/insights/{id}` 返回 200 + 文件列表，必须改用 `/{filename}` 端点。`POST /v1/analyse` 已移除。
- 其他端点：`DELETE /v1/log/{id}`（多 ID 逗号分隔，Bearer token）、`GET /v1/limits`、`GET /`。后端已移除 `/v1/ai/*`、`/v1/filters`、`/v1/telemetry/report`，不要重新引入。
- `GET /v1/limits` 当前契约是 `storageTime` / `maxFiles` / `maxTotalBytes` / `maxRequestBodyBytes`；旧线上实例可能仍返回 `maxLength` / `maxLines`，不要把它们写进新契约。`GET /v1/log/{id}` 不续期；raw/insights 的任意成功读取（包括多文件列表）会续期。
- 上传命中内容去重时返回 `deduplicated: true`；该响应中的 `token` 不能删除既有日志，前端不得覆盖首次上传者保存在 `log_token_<id>` 的凭证。
- `GET /v1/raw/{id}/{filename}` 与 `GET /v1/insights/{id}/{filename}` 的子路径分隔符不能编码，须按 `/` 分段 `encodeURIComponent`。
- 错误响应优先读 `error`，`message` 兜底。403 且响应体为 OpenLiteWaf HTML 卡片（`class="widget"`）时走全局弹窗，不要当普通业务 403。
- insights 是扁平结构：`title` + `analysis.problems/information`，没有 `success/data` 包装。
- `API.md`、`openapi.yaml` 与 `src/views/ApiDocsView.vue` 的端点/示例硬编码，改 API 时同步；前两者现在是上游 `~/LogShare/` 的副本。

## i18n 与硬编码数据

- i18n 是自研实现，不是 vue-i18n：文案在 `src/lib/i18nConfig.ts`（`zhCN`/`zhTW`），运行时用 `src/lib/i18n.ts` 的 `t(key)`。两套语言包必须同时补齐。
- 切换语言会 `window.location.reload()`；`localStorage.preferred_language` 决定语言。
- 硬编码数据：`ApiDocsView.vue`（端点/示例）、`TutorialArticleView.vue`（教程）、`src/data/sponsors.ts`、`src/data/launchers.ts`、`src/data/groups.ts`、`src/lib/announcementConfig.ts`（公告/日志更新）。
- 站内 API 文档是 VitePress 式三栏布局（左侧分组导航、正文、右侧本页目录；移动端为 select 目录），代码块统一用 `src/components/ApiCodeBlock.vue`；该组件用 highlight.js 高亮 JSON / bash / JavaScript。

## 样式

- Tailwind 3，`darkMode: 'class'`，通过 `<html class="dark">` 切换；颜色统一用 HSL CSS 变量（`hsl(var(--primary))`）。
- 显示模式仅 light/dark/system（`display_mode`），没有主题色/字体切换面板。
- 自托管字体：HarmonyOS Sans SC（界面）+ SauceCode Mono（等宽，4 字重）；Maple Mono/Fira Code 只是 `--font-mono` 的系统回退。
- 图标统一 `@phosphor-icons/vue`；`index.css` 对 `viewBox="0 0 256 256"` 全局放大 1.2，勿重复放大。

## 版本与部署

- 版本/tag 采用 `{年}.{月}.{commit hash-7}`（如 `2026.8.0f6c096`），语义化版本已废弃；`package.json` 没有 version。
- 构建时 `vite.config.ts` 用 `git rev-parse --short=7 HEAD` 注入 `__DEPLOY_HASH__`，由 `src/lib/deployInfo.ts` 导出给页脚/PWA 安装提示；不要找 `__APP_VERSION__`。
- `.cnb.yml` 只在 push 后强制同步到 GitHub 镜像（`anylyralabs/LogShare-Web-UI`），不构建/不测试；构建产物 `dist/` 手动上传腾讯 EdgeONE。
