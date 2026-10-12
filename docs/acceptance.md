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

## 2026-10-12：本机环境实测与真实 Chrome 加载

本轮只做验证与文档一致性修正，未改动运行时代码。环境：Windows，Chrome 154.0.8037.98，pnpm 12.5.1。

工程命令：

- `pnpm install --frozen-lockfile`：新工作区安装成功，156 个包，`postinstall` 的 `wxt prepare` 通过。本机 pnpm 的版本管理器在 Windows 上调用自身缓存副本时路径解析失败（`bin\..\node_modules\pnpm\pnpm` 无法被 cmd 执行），改用 store 内同版本的 `pnpm/bin/pnpm.mjs` 直接运行；安装结果与三条命令的结论不受影响。
- `pnpm typecheck`：通过。
- `pnpm test`：14 个文件、168 项通过，与 2026-10-11 记录一致。
- `pnpm build`：通过，产物 `.output/chrome-mv3`，列出的文件合计 498.75 kB（未压缩，不等于商店安装包大小）。

真实 Chrome 加载：

`--load-extension` 在 Chrome 154 已失效。带 `--disable-features=DisableLoadExtensionCommandLineSwitch` 启动后，profile 的 `Secure Preferences` 中没有任何本扩展记录，CDP target 列表也没有对应 service worker。改用 DevTools Protocol 的 `Extensions.loadUnpacked` 加载 `.output/chrome-mv3`，返回扩展 ID `fcceakjmniakgpbjhhdfohopmkljihbg`。

- Service Worker：CDP target 出现 `chrome-extension://<id>/background.js`，此前记录中“自动化脚本读取不到 background service worker target”的阻塞解除。
- 管理页渲染：`manager.html` 标题为「Amazing Stars · 收藏管理」，`h1` 为「所有收藏」，分类区、筛选区、空态与设置入口均存在；无 console error，无未捕获异常。
- 只读 IPC：`GET_STATUS`、`AI_READ`、`LIBRARY_READ` 返回预期结构（数据库 ready、AI 未配置、收藏为空）。
- 消息边界：`AI_MODELS` 带额外字段被后台拒绝并返回「消息来源或内容不受信任。」；`SET_APPEARANCE` 传入字符串被拒，按接口要求传 `{ theme, mode }` 后写入成功且可读回。

拖拽与本地写入：

临时 profile 中写入一条本地种子记录（1 个账号、1 个仓库、1 个手动分类），随后在页面内派发真实的 `dragstart` / `dragover` / `drop` 事件序列，把项目行拖到分类行。

- 拖拽前分类计数 0，拖拽后为 1，未分类计数归零，项目行出现「验证分类」标记。
- `LIBRARY_READ` 返回归属记录 `local:seed-category:seed-repo-1`，`source` 为 `manual`，与 `moveRepository` 的写入约定一致，说明 `GIT_CATEGORY_MOVE` 经真实后台与真实 IndexedDB 完成。

边界：

- 种子记录只写入 `artifacts/chrome-profile` 这个临时 profile（该目录被 Git 忽略），源码与构建产物不含演示数据。
- 仍未使用真实 GitHub / Gitee 令牌：真实分页规模、私有资源可见范围、组织策略、限流退避与真实远端写入均未验收。
- 拖拽使用合成 `DragEvent` 与 `DataTransfer`，不是操作系统级鼠标拖拽；指针捕获、拖拽影像与触摸路径仍未验证。
- 验证脚本位于 `artifacts/chrome-check/`，不进入版本库。

## 2026-10-12：AI 分类与提示词

本轮实现经用户确认的 AI 分类功能：按未分类收藏生成分类建议，用户逐项确认后写入本地分类；系统提示词的分类准则部分与用户提示词可编辑，输出契约与安全约束固定在代码中。设计与计划见 `docs/superpowers/specs/2026-10-12-ai-classification-design.md` 与同名 plans 文档。

新增 `src/ai/prompt.ts`、`src/ai/classification.ts`、`src/ai/classify.ts`、`src/library/apply-suggestions.ts`、`src/ui/use-ai.ts`、`src/ui/PromptSettings.tsx`、`src/ui/ClassifyView.tsx`；`LocalDatabase` 增加按主键删除单条记录的方法，用于清理草稿。未新增运行时依赖、未新增扩展权限、未升级 IndexedDB 版本。

验证方式：单元与集成测试使用模拟 HTTP 与 fake-indexeddb；界面使用 `react-dom/server` 渲染断言；真实环境使用本机 Chrome 154 经 DevTools Protocol 加载 `.output/chrome-mv3`，数据为临时 profile 中的本地种子记录。

- `pnpm typecheck`：通过。
- `pnpm test`：18 个文件、208 项通过。
- `pnpm build`：通过，列出的文件合计 541.78 kB（未压缩）。
- 真实 Chrome：service worker target 正常注册；管理页渲染出「AI 整理未分类」入口；0 console error、0 未捕获异常。
- 提示词：`AI_PROMPT_READ` 返回的当前值与默认值一致；保存「只按用途分类 / 分类名用中文」后原样读回并写入本地存储。
- 草稿：两个未分类项目中私有项目被跳过（队列只含公开项目，`skippedPrivate` 为 1），候选总数含私有项目（2）。
- 失败路径：未配置 AI 服务时单批请求失败被记录为「第 1 批」并保留原因，游标不推进、建议不写入；`结束并预览` 后草稿转为 `needs_review`。
- 写入：未知项目 ID 被拒绝并返回具体原因（修复了先前退回通用文案的行为）；确认后 `applied` 为 1、`categoriesCreated` 为 1，分类与归属写入真实 IndexedDB，草稿记录被删除；重新加载后分类列表出现新分类，未分类计数相应减少。
- 视口检查：整理视图在 1440×900、1366×768、390×844 三个尺寸与 folio-light、observatory-dark 两套主题下均无横向溢出，「写入 N 个项目」按钮都在视口内；收藏页的入口按钮与提示词面板的保存按钮同样可见可点。截图用于本地核对，不进入版本库。
- 界面加载：进入整理视图时会主动读取当前账号的草稿并渲染两栏建议；该缺陷在首轮视口检查中发现并修复。

未执行或未验证：

- 没有发出真实模型请求。可选主机权限需要用户在浏览器里确认，自动化无法代替；从模型返回到建议落地的环节由测试中的模拟响应与直接注入的草稿覆盖。
- 未使用真实 AI 服务的 Base URL、API Key 与模型名；供应商兼容性、费用与限流行为未验证。
- 未通过鼠标与键盘手动完成一次完整整理（脚本走的是真实 IPC 与真实 IndexedDB，不是真实指针操作）。
- 「整理过程中用户自行移动项目」的冲突路径只有单元测试覆盖。

## 2026-10-12（续）：生成请求 400 的定位能力与自定义请求头

现象：在真实 AI 服务（OpenCode Zen）上整理收藏时报「生成请求失败（HTTP 400）。请检查服务状态。」，且看不到任何原因。

调查发现两点：

1. 扩展自己有缺陷：生成请求的错误分支执行 `response.body.cancel()`，把服务端返回的说明丢掉了，所以界面只能给通用文案。
2. 服务端实际原因是缺少请求头：`Request is missing x-opencode-session and cannot be routed efficiently.` 该服务要求除 `Authorization` 之外的额外会话头，而扩展此前只发送固定的三个头。

修复与新增：

- 生成请求被拒时会读取服务端说明：只取 `error` / `message` / `detail` 字段，去掉控制字符、截断 300 字符，内容含 API Key 时整体丢弃；无法解析（例如 HTML 错误页）时退回通用提示。400/422 的提示改为明确指向模型名或请求参数。
- AI 服务配置新增「自定义请求头」：每行一个「名称: 值」，同时作用于模型目录与生成请求；头名须为合法 token，值限可见 ASCII 且不能换行，最多 20 行、2000 字符；`Authorization`、`Content-Type`、`Accept`、`Host`、`Cookie`、`Origin`、`Referer`、`User-Agent`、`Content-Length`、`Connection`、`Transfer-Encoding` 由扩展管理，写入会被拒绝并说明原因。旧配置缺少该字段时按空处理，不需要迁移。
- 自定义头按普通配置随 Base URL 与模型名保存在 `chrome.storage.local`，界面写明不适合存放长期凭证。

验证：

- `pnpm typecheck`：通过。`pnpm test`：18 个文件、218 项通过。`pnpm build`：通过，产物合计 544.58 kB。
- 服务端错误说明的呈现、Key 不回显、控制字符清理、超长截断、HTML 错误页、自定义头进入模型目录与生成请求、受保护头与非法格式被拒、旧配置兼容，均有测试覆盖；其中自定义头在真实本机 HTTP 服务上确认已被发出。
- 未执行：没有在真实 OpenCode Zen 上复测修复后的完整整理流程，真实服务的会话头取值与有效期未验证。

## 2026-10-12（续）：批次失败后的状态与生成超时

现象：在真实服务上首批请求超时（60 秒），并且失败后界面仍显示「正在请求模型」，需要手动点取消才有反应。

调查结论：

1. 状态机设计错了。单批失败时草稿保持 `running`，服务端没有表达「这一轮已经停下来」，界面据此继续显示正在请求，用户无法判断任务是否结束。
2. 60 秒超时是没有实测依据的初始取值，首批 30 个项目的生成在该服务上 60 秒内没有返回。

修复：

- 单批请求失败时草稿立即转入 `needs_review`，界面显示「已停止，已处理 X / 共 Y」，并给出「重试本批」「结束并预览」「放弃本次整理」；失败批次不推进游标，重试即重新请求同一批。
- `step` 允许在 `needs_review` 且仍有未处理项目时继续推进，重试不需要额外命令；页面重新打开后停在半途的草稿同样可以继续。
- 生成请求超时从 60 秒放宽到 120 秒，错误文案改为说明服务端可能仍在处理、可重试本批或改用更快的模型。
- 界面不再把「草稿处于 running」当作「正在请求」：区分客户端是否真的在发请求，避免关页重开后显示假进度。

验证：`pnpm typecheck` 通过；`pnpm test` 18 个文件、220 项通过；`pnpm build` 通过，产物合计 545.29 kB。失败后状态、失败记录与游标、重试推进、结束预览保留失败记录、120 秒超时，均有测试覆盖。未在真实服务上复测 120 秒是否足够。

## 2026-10-12（续）：移除预览、整理配置与模态框入口

按用户要求调整 AI 整理的交互与配置：

- 移除预览确认环节：每批建议通过校验后直接写入本地分类，不再有「建议采纳 / 需要你确认」两栏与逐条勾选；写入发生在 `AI_CLASSIFY_STEP` 内部，`AI_CLASSIFY_APPLY` 命令被删除。
- 新增「AI 服务 → 整理配置」子标签：请求超时（15–600 秒，默认 120）与私有仓库开关从整理界面移到这里；存储键升级为 `ai:classify:v2`，读取时兼容旧的 `ai:classify:v1`。
- 收藏页入口改名 `AI 整理`，点击原地打开大号模态框（宽度上限 920px、高度上限 80vh），不再切换 `#classify` 路由；`ClassifyView.tsx` 删除，新增 `ClassifyDialog.tsx` 与 `ClassifyConfig.tsx`。
- 失败语义与上一轮一致：单批失败即停止本轮、不推进游标，界面显示「已停止」并提供「重试本批」；因为改为每批直接写入，中断不会回滚已经写入的分类。
- `docs/design/ui-spec.md` §4.7 的对话框尺寸上限改为两档（确认类 520px、内容类 920px / 80vh），几十条结果与进度信息装不进原来的 520px。

验证：`pnpm typecheck` 通过；`pnpm test` 18 个文件、225 项通过；`pnpm build` 通过，产物合计 546.72 kB。真实 Chrome 中确认：点击入口不改变 `#library` 路由、模态框居中显示、`Esc` 关闭、AI 服务下存在三个子标签、超时输入默认 120 且 min/max 为 15/600、整理窗口内不再出现私有开关；1440×900、1366×768、390×844 三个尺寸与 folio-light、observatory-dark 两套主题下均无横向溢出、主要操作可见。

首轮检查发现一个问题：整理窗口因为渲染在 `.manager-workspace` 之外，`.dialog-backdrop` 的 `position: fixed` 没有匹配到，模态框落进文档流底部。修正后第二轮确认居中。这个问题服务端渲染测试看不出来，只有真实浏览器能暴露。

未执行：仍未在真实 AI 服务上跑通完整整理流程。直接写入意味着建议未经人工确认即落库，这是本次需求的明确取舍。

## 2026-10-12（续）：整理入口改为按钮进度与提示条

按用户要求取消整理窗口，把反馈直接放在触发按钮与右下角提示条上：

- 点击 `AI 整理` 不再打开任何对话框，也不改变路由（仍是 `#library`）；按钮在运行期间显示 `整理中 X / Y` 与旋转图标并进入禁用态。
- 结果反馈改为提示条：成功给出「已整理 N 个项目，新建 M 个分类。」（`role="status"`，4 秒），失败给出「整理中断：<原因>。已经处理的 N 个项目保留在本地。」（`role="alert"`，6 秒），都可手动关闭，最多同时三条。
- 取消中断功能：没有停止、重试、放弃入口，也没有 `AI_CLASSIFY_FINISH` 与 `AI_CLASSIFY_CANCEL` 命令。单批失败时服务端删除草稿并抛出可读原因，队列清空时同样删除草稿并返回本轮结果；已经被分类的项目不会在下次运行中被重复处理。
- 删除 `ClassifyDialog.tsx`，新增 `Toast.tsx` 与 `use-toasts.ts`。
- `docs/design/ui-spec.md` 记录两处有意例外：新增 §4.10 结果提示条（含"不用 toast 掩盖长期失败"的限定例外说明），§4.1 允许按钮内部的进度图标（§12 禁止转圈的唯一例外）；层级表新增 `--z-toast`。§4.7 收回上一轮为大对话框放宽的尺寸上限。

验证：`pnpm typecheck` 通过；`pnpm test` 18 个文件、224 项通过；`pnpm build` 通过，产物合计 544.55 kB。真实 Chrome 中确认：点击整理时按钮变为「整理中 0 / 0」且页面不存在 `.dialog-backdrop`；未配置 AI 时提示条以错误语义出现并显示「整理中断：请先保存 AI 服务配置。 已经处理的 0 个项目保留在本地。」；失败后按钮回到「AI 整理」、路由仍是 `#library`；AI 服务下三个子标签与整理配置的默认值（120 / 15 / 600）不变；1440×900 与 390×844 下提示条都在视口内且无横向溢出；0 console error、0 异常。

未执行：仍未在真实 AI 服务上跑通完整整理；提示条的自动消失没有被自动化断言覆盖（截图与 DOM 读取在消失前完成）。

## 2026-10-12（续）：整理上限、顶部横幅、未分类隐藏与自动保存

按用户要求做四处调整：

- 整理配置新增「一次最大整理数量」：单次运行处理的项目上限，默认 0 表示不限，范围 0–5000。建立草稿时截断队列，多出来的项目留到下次点击；候选总数仍然显示全部未分类项目。
- 结果提示条从右下角改为顶部居中横幅（宽度 `min(720px, 100vw - 32px)`），保留成功 4 秒、失败 6 秒与手动关闭；横幅会短暂覆盖页面顶部内容，已在规范里写明它不承载必须点击的内容。
- 侧栏「未分类」在计数为 0 且未被选中时不再渲染；正在查看该视图时保留，避免选中态突然消失。
- 设置页改为自动保存：分类准则、用户提示词、整理配置（超时、最大数量、私有开关）、AI 的模型名与自定义请求头在停止输入 800 毫秒后自动写入，保存按钮删除。Base URL 与 API Key、Git 令牌保留「验证并保存」，因为更换地址会让旧凭证失效、凭证必须先验证才能落库。
- 顺带修掉一个真问题：`PromptSettings` 与 `ClassifyConfig` 的读取 effect 依赖每次渲染新建的控制器对象，会反复触发读取请求；改为依赖稳定的 `useCallback` 引用。

验证：`pnpm typecheck` 通过；`pnpm test` 18 个文件、226 项通过；`pnpm build` 通过，产物合计 546.56 kB。真实 Chrome 中确认：最大数量字段默认 0、上限 5000；整理配置面板内的提交按钮数量为 0；把超时改成 200 后不点任何按钮，后台配置在防抖窗口后即为 200；提示条在 1440×900 下宽 720、top 16，在 390×844 下宽 366、top 10；把所有项目归入分类后侧栏未分类行消失；0 console error、0 异常。

未执行：仍未在真实 AI 服务上跑通完整整理；自动保存的防抖与提示条的自动消失只在真实浏览器中人工确认，没有自动化断言覆盖计时行为。

## 2026-10-12（续）：每批整理数量

更正上一节：用户所指的「最大整理数量」是**每批请求的项目数**（原先固定 30），不是单次运行的项目总量。已改名并改为可配置：

- `ClassifyConfig.maxPerRun` 改为 `batchSize`，默认 30、范围 1–100；建立草稿时写入，`step` 按它切分每批。
- 上一版实现里的「截断队列」行为已删除：一次运行仍然处理全部未分类项目，只是分批粒度可调。
- 存储兼容：更早的 v2 记录若只有 `maxPerRun` 而没有 `batchSize`，读取时按默认 30 处理（该字段不再有含义）。
- 设置界面字段改为「每批整理数量」，提示写明「数量越大，单次请求越慢、越容易触发超时」。

验证：`pnpm typecheck` 通过；`pnpm test` 18 个文件、226 项通过；`pnpm build` 通过，产物合计 546.52 kB。真实 Chrome 中确认字段默认 30、min 1、max 100；改超时后自动保存生效（后台读到 `timeoutSeconds: 200, batchSize: 30`）；整理配置面板内提交按钮数为 0。