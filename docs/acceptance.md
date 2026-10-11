# M0 / M1 验证记录

日期：2026-10-09。范围：视觉候选与基础工程，不是完整产品验收。

## 已实际执行

| 项目 | 结果 | 边界 |
| --- | --- | --- |
| 依赖安装 | 已生成 pnpm-lock.yaml，最终安装成功 | 初次 postinstall 早于入口文件创建而失败；入口齐备后 wxt prepare 成功 |
| `pnpm typecheck` | 通过 | 首次缺少 JSX 编译选项；配置 react-jsx 后通过 |
| `pnpm test` | 5 个文件、36 个测试全部通过 | 使用 fake-indexeddb 和内存 StorageArea，不是 Chrome 真实权限验收 |
| `pnpm build` | 通过，构建产物总计约 259.76 kB | 未压缩的文件合计，不等于商店安装包大小 |
| `git diff --check` | 通过 | 没有执行提交或推送 |
| Manifest 内容检查 | storage 与 github.com 主机范围，四类入口已生成 | 尚未加载到真实 Chrome 扩展环境 |
| 视觉浏览器操作 | 两个方向的收藏、详情、设置页已查看和截图 | 运行于 Codex 内置浏览器中的独立 HTML 预览 |
| 搜索 | 输入 syncthing 仅显示一条演示结果 | 本地关键词搜索，不是 AI 自然语言检索 |
| 分类筛选 | 选择“设计”仅显示 penpot 演示项 | 不代表远端分类已实现 |
| 主题 | 两种方向均能分别切换亮色和暗色 | 系统变化逻辑有单元测试；未修改操作系统外观来做端到端测试 |
| 响应式 | 1440×900、1366×768 与 390×844 检查，无观察到的横向溢出 | 窄屏额外检查详情与设置 |
| 浏览器控制台 | 检查时未记录 error 日志 | 仅代表本次预览交互 |

## 测试覆盖

- 所有计划数据表初始化为空，不注入模拟账号。
- 相同记录 ID 在不同账号间隔离。
- 拒绝跨账号写入和替换。
- 快照替换为单一事务，重复 ID 和不能序列化的数据不会破坏旧快照。
- 不能写入的数据不会留下未处理的事务 Promise 拒绝。
- 不支持的数据库和设置版本不会被自动重置。
- 默认凭证只进入 session，取消记住凭证会移除持久副本。
- 并发凭证写入按顺序处理，账号和凭证类型隔离。
- UI 与内容脚本消息能力分离，任意 URL 请求、伪造来源、额外字段均被拒绝。
- 系统模式解析与手动明暗设置保持一致。

## 视觉证据

截图保存在本机 `artifacts/visual/`，该目录被 Git 忽略；可版本化的视觉来源是 `docs/design/preview.html`、CSS、JS 与字体资源。

- `folio-library.jpg`、`folio-detail.jpg`、`folio-settings.jpg`
- `observatory-library.jpg`、`observatory-detail.jpg`、`observatory-settings.jpg`
- `folio-narrow.jpg`

截图为浏览器真实渲染结果，不是 AI 生成图片。

Impeccable 机械检查因缺少 HTML/CSS 解析模块而降级为正则扫描，报告了一项 Fraunces 常见字体警告。没有安装额外解析器，也没有把降级结果当作对比度或可访问性通过证明。完整无障碍审计仍未执行。

## 尚未验证或实现

- Chrome 中实际加载扩展、工具栏弹窗与 Service Worker 生命周期。
- 真实 GitHub OAuth、scope 最小化、完整分页、Lists 读写。
- 真实 AI 兼容性、费用、Token/API Key 输入、主机权限请求。
- 自动分类、任务队列、手册、语义检索、项目对比、动态跟踪。
- 最终艺术方向和全部生产界面。

没有创建 OAuth App，没有修改任何 GitHub Stars/Lists，没有执行付费请求，没有推送代码或发布扩展。

## 2026-10-10：M2 GitHub 登录与读取同步

本轮实现 Device Flow、凭证生命周期、账号识别、Stars / Lists / items 分页、暂停后继续、原子快照替换与正式工作区入口。未实现 Lists 远端写入。

验证方式：自动化测试使用模拟 GitHub HTTP/GraphQL 响应；UI 使用生产构建及独立 localhost 消息夹具，无真实凭证、无外部请求，不替代真实 OAuth 验收。

- `pnpm test`：11 个文件，110 项通过。
- `pnpm typecheck`：通过。
- `pnpm build`：通过，产物 `.output/chrome-mv3`。
- 授权：默认会话存储、可选持久保存、等待间隔、slow_down、取消、拒绝、过期、重新识别账号和 Refresh Token 轮换。
- 完整性：101 个 Stars、101 个 Lists、单 List 101 个项目均完成分页，后台服务实例重建后继续。
- 失败保护：401/403/404/429/500、GraphQL 部分错误、重复记录、数量不一致、空节点、账号不符与服务端截断均保留原快照。
- 数据：多表写入失败原子回滚；仓库改名、取消 Star 均保留已有本地标签与手册；其他账号数据不受影响。
- UI：空 Client ID 禁止登录；离线授权码展示与取消正常；同步中、失败提示正常；本地测试页无 console error。

| 视口 | 文档尺寸 | 主内容高度 / 内容高度 | 滚动结果 |
| --- | --- | --- | --- |
| 1280 × 720 | 1280 × 720 | 671 / 2197 | 授权码显示时仅内容区滚动，无横向溢出 |
| 1243 × 1244 | 1243 × 1244 | 1195 / 2256 | 已连接与同步状态下仅内容区滚动 |
| 3840 × 2160 | 3840 × 2160 | 2111 / 2256 | 4K 无额外文档滚动，内容超高时内滚动 |
| 390 × 844 | 375 × 2308（含原生滚动条占宽） | overflow: visible | 窄屏整页滚动，无横向溢出 |

边界：浏览器工具拒绝直接访问 `chrome-extension://`，因此本轮未操控真实扩展页面。未注册 OAuth App，未使用真实 Client ID、Token 或用户账户数据；`read:user` 下的实际可见范围、组织限制与真实 Chrome 权限加载仍需人工联调。

## 2026-10-10：改用 Personal Access Token

经用户确认，GitHub 连接方式调整为“填写 Access Token → 验证并保存 → 同步收藏”，替代上一节的 Device Flow 入口。移除客户端授权轮询和刷新请求，保留既有分页同步与账号隔离。

- `pnpm test`：11 个文件，124 项通过。
- `pnpm typecheck`、`pnpm build`：通过。
- 新增验证覆盖：REST 与 GraphQL 身份一致性、Stars / Lists / items 读取探测、空收藏账号、权限及 HTTP 错误拒绝保存、不覆盖旧凭证、会话／持久存储切换、Token 替换取消旧分页、401 清理及旧 OAuth 缓存兼容。
- 消息边界拒绝内容脚本、弹窗、旧 OAuth 命令、非法 Token 与额外字段；返回状态不包含凭证。
- 离线 UI 验证：密码输入、默认不记住、提交后清空、显示账号与同步入口，无 Client ID 或授权码表单，无 console error。
- 已连接状态的 390 × 844 视口无横向溢出，主内容 overflow 为 visible；3840 × 2160 文档高度为 2160，主内容高度／内容高度为 2111 / 2230，维持内容区内滚动。

验证仅使用模拟 HTTP 响应和独立 localhost UI 夹具，未读取或使用真实 Token。Token 类型、权限及组织策略下的真实可见范围仍待联调；连接探测通过不等于所有分页或私有资源均可访问。

## 2026-10-10：Git provider（GitHub / Gitee）与本地分类

本轮把仅支持 GitHub 的同步链路扩展为 Git provider 抽象，并让同步结果成为可在本地管理的分类体系。设计见 `docs/superpowers/specs/2026-10-10-git-providers-and-categories-design.md`，实施计划见同名 plans 文档。

验证方式：单元与集成测试使用模拟 HTTP / GraphQL 响应与 fake-indexeddb；界面部分使用 `react-dom/server` 的服务端渲染；没有使用真实令牌，没有修改任何远端数据。

- `pnpm test`：14 个文件、163 项通过。
- `pnpm typecheck`：通过。
- `pnpm build`：通过，产物 `.output/chrome-mv3`，列出的文件合计 494.79 kB（未压缩，不等于商店安装包大小）。
- 消息边界：`GIT_*` 命令字段数量与取值、分类名长度与控制字符、说明长度、非法分类 ID、未知 provider、非法令牌均被拒绝；内容脚本与弹窗无法调用这些命令。
- 账号与凭证：GitHub 与 Gitee 账号各自独立保存凭证（`credential:<accountId>:<provider>`），一个账号断开不影响另一个；令牌失效时清理凭证但保留账号与快照；Gitee 账号 ID 使用 `gitee:` 前缀避免与 GitHub node id 冲突。
- Gitee 同步：身份与读取能力验证、整页后追加空页结束、重复记录、401 清理凭证、403 限流分类、缺少账号标识的响应被拒绝；请求使用 `Authorization: Bearer`，令牌不进入 URL。
- 同步规则：`stars` 规则不读取 Lists、不改动任何分类；`stars+lists` 规则下跟随远端的分类按远端结果更新或删除，用户改过名称/说明/归属的分类与手动分类保持原样，指向已移除仓库的归属被清理。
- 分类操作：创建、改名、修改说明、删除（归属一并移除，项目回到未分类）、移动（离开原分类、进入目标分类、相关分类脱离远端跟踪）；非法名称、超长说明、不存在或跨账号的目标被拒绝。
- 渲染：Git 设置页（主标签 Git、子标签 GitHub / Gitee、账号面板）与收藏页外壳在服务端渲染下无异常，关键文案与结构存在。

未执行或未验证：

- 未在真实 Chrome 中加载本轮构建的扩展。本机 Chrome 154 使用 `--load-extension` 加载未打包扩展时，无头与有窗口模式都没有注册扩展（自动化脚本读取不到 background service worker target），因此真实浏览器中的页面渲染、拖拽与 IPC 交互均未验证；组件渲染只由服务端渲染测试覆盖。
- 未使用真实 GitHub Token 或 Gitee 私人令牌：真实账号下的分页规模、私有资源可见范围、组织策略与限流退避仍未联调。
- Gitee 的集合接口没有总量字段，只能按返回条数推断结束；页数上限 200 页仅用于防止失控循环，超大数据量下的分页稳定性未验证。
- 未实现把分类写回远端 Lists；远端仍为只读。

## 2026-10-11：分类入口、分类模态框与 Git 设置布局

按浏览器批注调整三处界面：

- 收藏页「新建分类」从分类列表下方的大号虚线按钮改为分类标题行的小号 + 图标按钮；标题、数量与 + 图标统一按行中心对齐。分类行的编辑入口由三点图标改为铅笔图标。所有收藏、分类标题、分类行与未分类共用同一条右对齐数字列与操作图标列；分类列表不再保留常驻滚动条槽位，溢出滚动时行宽会随滚动条变化。
- 分类编辑由结果上方的内联表单改为居中模态框：打开时聚焦名称输入，Esc 或点击遮罩关闭，Tab 在框内循环，关闭后焦点回到触发按钮。
- Git 设置改为两张分区卡片：「添加账号」集中令牌表单与多账号说明；「已连接账号」显示数量与账号卡片列表，每个账号独立成卡，凭证移除收进卡片底部并使用两步确认。

验证方式：`pnpm test`（14 个文件、163 项通过）、`pnpm typecheck`、`pnpm build` 通过。使用临时 localhost 夹具加载本轮 `.output/chrome-mv3` 产物并以 mock 消息提供两个 GitHub 账号：收藏页分类标题行显示 + 入口；模态框打开、Esc 关闭、焦点回到入口；Git 页显示「GitHub 2」「已连接账号 2」与两张账号卡片，移除凭证展开两步确认。未使用真实令牌，未修改远端数据；浏览器工具仍拒绝直接访问 `chrome-extension://`，真实扩展页需手动刷新查看。

## 2026-10-11（续）：同步互斥状态与取消按钮

- `useGit` 增加 `pending`（当前在途消息类型）；Git 设置页的「验证并保存」只在 `GIT_CONNECT` 在途时显示「处理中…」，点击同步不再改变其文案。
- 「取消同步」不再受 `busy` 禁用；分页步进在途时点击会进入既有的排队逻辑，当前步结束后立即发送 `GIT_CANCEL_SYNC`。
- 回归测试：新增 2 项渲染断言（运行中保持「验证并保存」、取消按钮不带 disabled、`GIT_CONNECT` 在途时才显示「处理中…」），`pnpm test` 14 个文件、165 项通过；`pnpm typecheck`、`pnpm build` 通过。
- 夹具实测（mock 运行中状态）：同步期间保存按钮文案不变；连续点击取消同步，夹具记录到 `GIT_CANCEL_SYNC` 计数 1、2，确认在途排队路径可达。

## 2026-10-11（续）：AI 模型目录请求的失败诊断与 Key 清洗

现象：Base URL `https://opencode.ai/zen/go/v1` 获取模型目录报「网络请求失败，请检查服务地址、权限和网络；不允许重定向。」

- 服务端实测：本机请求 `GET https://opencode.ai/zen/go/v1/models` 返回 HTTP 200 与 `{data:[...]}` 模型列表；OPTIONS 预检允许 `Authorization` 头；无重定向。故障在浏览器/扩展一侧，不在服务地址本身。
- `src/ai/service.ts`：`redirect` 从 `'error'` 改为 `'manual'`，重定向、被拦截（opaque / status 0）分别报告；TypeError 现在附带浏览器给出的原因（消息含 Key 时丢弃原因，避免回显凭证）。
- 保存 API Key 时剔除零宽字符（U+200B–U+200F、U+2060、U+FEFF），避免粘贴带入的不可见字符让浏览器判定请求头非法。
- 测试：`pnpm test` 14 个文件、167 项通过；`pnpm typecheck`、`pnpm build` 通过。
- 待真实环境复测：需在 chrome://extensions 重新加载扩展后重试；新的错误文案会指明具体原因（Failed to fetch / 请求被浏览器拦截 / 重定向）。

## 2026-10-11（续）：AI fetch 的 Illegal invocation 修复

真实环境重试后错误变为 `Failed to execute 'fetch' on 'WorkerGlobalScope': Illegal invocation`，根因是 `AiService` 把原生 `fetch` 存为实例属性并以 `this.fetcher(...)` 调用，接收者变成实例；Chrome 对原生函数做 brand check 直接拒绝，而 Node/undici 与 mock 不检查，所以既有单测从未暴露。

- 修复：构造时保存 `(input, init) => fetch(input, init)` 包装，无接收者调用；GitHub/Gitee client 原本就 `const fetcher = this.fetcher; fetcher(...)`，无需改动。
- 新增回归测试：替换全局 fetch 记录调用接收者，断言不是服务实例。
- `pnpm test` 14 个文件、168 项通过；`pnpm typecheck`、`pnpm build` 通过；构建产物含包装调用。