# AI 分类与提示词实施计划

日期：2026-10-12
设计依据：`../specs/2026-10-12-ai-classification-design.md`。
目标：让用户配置的 AI 服务根据未分类收藏生成分类建议，用户确认后写入本地分类；同时提供可编辑的系统准则与用户提示词。

## 执行原则

- 按依赖顺序推进，每一步完成后 `pnpm typecheck` 与 `pnpm test` 都必须可运行。
- 不引入新的第三方依赖，不新增扩展权限，不升级 IndexedDB 版本，不新增数据库表。
- 不调用真实 AI 服务，不产生付费请求；真实服务验收需要单独授权。
- 界面改动在动手前先读 `docs/design/ui-spec.md`，完成后按该规范 §13 自检。
- 不修改 Git 同步链路，不触碰远端 Lists。

## 阶段 1：提示词与偏好存储

文件：`src/ai/prompt.ts`（新增）、`src/ai/config.ts`、`tests/ai/prompt.test.ts`（新增）。

1. 定义固定契约常量、默认系统准则、默认用户提示词。
2. 实现 `ai:prompt:v1` 的读取、保存与恢复默认；字段各自不超过 8000 字符，拒绝控制字符。
3. 实现 `ai:classify:v1`（`{ version: 1, includePrivate: boolean }`，默认 `false`）。
4. 键缺失时返回默认值；键存在但版本或内容无效时抛错，不覆盖原值。

验收：默认值、长度越界、控制字符、损坏数据不覆盖、恢复默认各有单测。

## 阶段 2：分类契约与纯逻辑

文件：`src/ai/classification.ts`（新增）、`tests/ai/classification.test.ts`（新增）。

1. 输入构造：本批项目清单与已有分类清单的 JSON 文本、私有过滤、队列排序（`starredAt` 倒序，缺失按 `id` 升序）。
2. 响应解析与校验：设计 §5 的七条规则逐条实现。
3. 归一化：同项目重复建议取首条；新分类名与已有分类同名时改为归入已有分类；同批同名新分类合并。
4. 草稿类型与纯状态推进函数（不入库，便于测试）。

验收：非法输入八类、归一化三分支、私有过滤、队列排序、批次切分各有单测。

## 阶段 3：AI 请求与草稿读写

文件：`src/ai/service.ts`、`src/ai/classify.ts`（新增）、`tests/ai/classify.test.ts`（新增）。

1. `AiService` 增加生成请求：`POST {Base URL}/chat/completions`，60 秒超时，响应上限 1 MiB 逐块读取，重定向、被拦截、非 2xx、非 JSON、超时分别给出可读错误。
2. 批次执行：读取草稿、取一批队列、构造请求、校验响应、更新草稿；草稿存放在 `jobs` 表（`id` 为 `classify:ai`、`type` 为 `classify`）。
3. 状态机：`running` → 队列空转 `needs_review`；取消清空为初始状态；单批失败保留已完成批次并记录原因；运行中凭证失效或账号消失转 `failed`。
4. 开始前拦截：未配置服务、缺少 Key、缺少主机权限、账号不存在、没有未分类项目。

验收：多批推进、`needs_review`、取消、失败保留、后台实例重建后继续、401/403/429/超时/形态错误分类、开始前拦截各分支。

## 阶段 4：确认写入

文件：`src/library/apply-suggestions.ts`（新增）、`tests/library/apply-suggestions.test.ts`（新增）。

1. `accepted` 校验：全部来自当前草稿、去重后非空、未知 ID 拒绝整次调用。
2. 单事务提交：新建分类（`local:<uuid>`、`source: manual`、`tracked: false`）、写入归属（`source: manual`）、归入已有分类、被写入的远端分类置 `tracked: false`、已存在归属跳过。
3. 事务失败保持原数据。

验收：新建与归入两条路径、`tracked` 语义、重复归属、未知 ID、跨账号隔离、失败保留原数据。

## 阶段 5：消息与后台接入

文件：`src/messaging.ts`、`entrypoints/background.ts`、`tests/messaging.test.ts`。

1. 七个新命令的严格校验（字段数量固定、类型与长度限制），加入管理页允许列表。
2. 后台分发到 AI 与分类服务。

验收：字段数量与取值校验、内容脚本与弹窗不可调用、返回内容不含 API Key、伪造来源被拒。

## 阶段 6：界面

文件：`src/ui/use-ai.ts`（新增）、`src/ui/PromptSettings.tsx`（新增）、`src/ui/ClassifyView.tsx`（新增）、`src/ui/SettingsTabs.tsx`、`src/ui/Library.tsx`、`src/ui/library.css`、`src/ui/settings.css`、`tests/ui/render.test.ts`。

1. AI 面板拆为 `服务配置` 与 `分类提示词` 两个子分区；提示词编辑、字符计数、恢复默认、固定契约只读展示。
2. 收藏页头部加入口按钮，禁用时写明原因（未配置服务、无 Key、无已连接账号、无未分类项目）。
3. `#classify` 视图：状态与进度、私有开关与发送范围说明、`开始整理`/`取消`/`结束并预览`、两栏预览（`建议采纳` 与 `需要你确认`）、全选与清空、`写入 N 个项目`、`放弃本次整理`、失败批次说明。
4. 四套主题组合、八种交互状态、键盘可达、减少动画。

验收：`react-dom/server` 渲染断言、禁用与错误态文案、ui-spec §13 清单、1440×900 与 1366×768 与 390×844 三个尺寸下主要操作可见可点。

## 阶段 7：验证与文档

1. `pnpm typecheck`、`pnpm test`、`pnpm build` 全部通过。
2. 真实 Chrome 端到端：以本机 loopback 的模拟 `chat/completions` 服务作为 AI 服务（不产生真实费用），验证从开始整理到确认写入的完整链路与中断恢复；沿用已验证的 CDP 加载方式。
3. 更新 `docs/acceptance.md` 记录实际执行的验证与未验证项。
4. 更新 `README.md` 与 `PRODUCT.md` 的功能状态表述。

验收：报告实际执行的验证层级；未使用真实 AI 服务与真实凭证的部分明确标注未验证。

## 边界与未做

- 不写回远端 Lists，远端仍只读。
- 每个项目最多一条 AI 建议，不做多分类、维度标签、分类合并与排序。
- 不做同步后自动触发与后台定时触发。
- 不做向量检索、README 抓取、项目对比与手册。
- 真实 AI 服务的兼容性与费用未验证，需要用户提供配置并授权后才能执行。
