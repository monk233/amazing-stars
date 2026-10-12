# AGENTS.md

本文件面向在此仓库中工作的自动化代理与协作者，说明项目结构、不可越过的边界，以及必须遵守的工程与界面约定。

## 项目概览

Amazing Stars 是一个无自建后端、以本地数据为主的 Chrome 扩展（Manifest V3），用于管理 GitHub 与 Gitee 的 Stars：手动分类、多维度标签、本地手册、用户自配的 AI 能力。界面主要语言为简体中文。

- 产品边界与未决项：[PRODUCT.md](./PRODUCT.md)
- 使用与开发说明：[README.md](./README.md)
- 产品设计：[docs/superpowers/specs/2026-10-09-amazing-stars-design.md](./docs/superpowers/specs/2026-10-09-amazing-stars-design.md)
- Git provider 与分类设计：[docs/superpowers/specs/2026-10-10-git-providers-and-categories-design.md](./docs/superpowers/specs/2026-10-10-git-providers-and-categories-design.md)
- 实施计划：[docs/superpowers/plans/](./docs/superpowers/plans/)
- 视觉方向与候选：[docs/design/visual-direction.md](./docs/design/visual-direction.md)
- 验证记录：[docs/acceptance.md](./docs/acceptance.md)

## UI 规范（强制）

**本项目全部前端实现必须遵守 [docs/design/ui-spec.md](./docs/design/ui-spec.md)。** 该规范规定 UI 实现、布局实现、交互实现、动效实现与文案表达，涉及 `entrypoints/manager/` 与 `src/ui/` 的任何改动在动手前必须先读它。

规范的核心硬性要求（细则以规范原文为准）：

- **Token 优先**：颜色、字号、圆角、层级、动效时长必须取自语义 token 或规范内固定阶梯，禁止硬编码色值与游离数值。
- **双主题四组合**：`data-theme`（folio、observatory）乘 `data-mode`（light、dark），四套组合都必须单独成立，改动后逐套检查。
- **单一强调色**：每套主题只有一个强调色，禁止第二个强调色与 AI 紫蓝渐变、霓虹外发光。
- **布局外壳**：视口用 `100dvh`；页面外壳不滚动，滚动只发生在声明的容器上；结构用 CSS Grid，不用 flex 百分比凑列宽。
- **断点固定**：1800、1100、900、760、360 与高度 720；多列布局必须在同组件内显式声明 `≤760px` 的降级。
- **完整交互状态**：默认、hover、active、focus-visible、选中、禁用、忙碌、错误八态齐备；焦点环始终可见；关键操作不得只靠 hover 暴露。
- **动效克制**：只动画 `transform` 与 `opacity` 及颜色类属性；禁止滚动监听、视差、粒子、无限装饰动画；每处动效必须能一句话说明动机；减少动画偏好下完全静态。
- **可访问性**：正文对比度不低于 4.5:1；全部操作可仅用键盘完成；拖拽必须有等价入口；图标按钮必须有 `aria-label`。
- **诚实状态**：不使用假数据、假统计、假在线状态；未连接不写"已就绪"，未同步不写"最新"。
- **文案**：简体中文，无 emoji，无营销腔，错误文案写清"发生了什么、影响了什么、下一步做什么"。
- **依赖约束**：不新增运行时依赖（UI 库、CSS-in-JS、状态库、动画库、图标库）与第三方外链资源，需要时先取得用户确认。
- **提交前检查**：完成 `docs/design/ui-spec.md` §13 的检查清单，并在 1440×900、1366×768、390×844 三个尺寸下确认主要操作可见可点。

规范 §15 记录了当前实现与规范的已知偏离项（颜色来源重复、圆角与字号游离值、动效与层级未变量化等）。这些条目是待收敛项，不代表已经修复；不要在无授权的情况下顺带重构它们。

## 技术栈与命令

已确认栈：Manifest V3、WXT、React 19、TypeScript、Vitest、pnpm（版本见 `package.json` 的 `packageManager`）、Node.js 22.18 及以上。

```powershell
pnpm install --frozen-lockfile
pnpm typecheck      # wxt prepare && tsc --noEmit
pnpm test           # vitest run
pnpm build          # 产物在 .output/chrome-mv3
pnpm dev            # 开发模式，WXT 调试服务器
pnpm preview:design # 视觉稿预览，http://127.0.0.1:4317/
pnpm icons          # 重新生成扩展图标
```

`.output/`、`.wxt/`、`artifacts/`、`node_modules/` 是构建与本地工件，不作为交付内容或规范依据。

## 代码组织

```
entrypoints/   扩展入口：background、github.content、manager 管理页
src/ai/        AI 服务配置与模型目录请求
src/data/      IndexedDB、设置、凭证存储与类型定义
src/git/       Git provider 抽象与同步控制器
src/github/    GitHub 客户端、适配与分页同步
src/gitee/     Gitee 客户端、适配与同步
src/library/   本地分类与收藏库操作
src/ui/        React 组件与样式（tokens.css、library.css、settings.css）
docs/          设计与实施文档、视觉稿、配置说明
tests/         Vitest 测试
scripts/       图标生成与预览脚本
```

约定：

- UI 组件与数据层分离。组件不直接读写扩展存储，通过 hook 或控制器。
- 样式统一走 `src/ui/` 下的 CSS 文件，选择器以 `.manager-workspace` 或 `.manager-stage` 开头。
- 消息传递使用受信任上下文允许列表，不提供任意请求或凭证读取接口。
- 注释、文档、提交信息使用中文书面表达。

## 数据与隐私边界（不可越过）

- 不静默取消 Star、不删除分类、不覆盖手动修改、不发送私有资料。
- 凭证与 API Key 不回显、不写入项目文件、不进入提交历史。默认仅保留到浏览器会话结束。
- 令牌验证失败不覆盖旧凭证；同步失败不提交部分快照。
- 演示数据必须明确标注为演示，不得表示真实连接状态。
- 不自动提交、不推送、不注册 OAuth App、不发布扩展。
- 涉及真实账号、真实凭证或可能产生费用的请求，必须先取得用户授权。

## 变更流程

1. 先读相关设计与实施文档，确认改动落在哪一层。
2. 涉及界面时先读 `docs/design/ui-spec.md`。
3. 小步实现，保持改动可审查，不做未授权的顺带重构。
4. 运行 `pnpm typecheck` 与 `pnpm test`；界面改动另按规范 §13 自检。
5. 只在用户要求时提交，提交信息使用 Conventional Commits。
