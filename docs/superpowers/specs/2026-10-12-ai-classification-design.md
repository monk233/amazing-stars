# AI 分类与提示词设计

日期：2026-10-12
状态：经用户确认后编写，作为实现依据。
范围：让用户配置的 AI 服务根据未分类收藏生成分类建议并直接写入本地分类；同时提供可编辑的系统准则、用户提示词与整理配置（请求超时、私有仓库范围）。

## 1. 原始需求与已确认决策

用户提出两项需求：

1. 使用 AI 根据未分类的 Stars 创建分类；系统提示词由系统提供默认值，并提供用户提示词方便扩展。
2. 允许用户自定义 AI 分类功能的系统提示词与用户提示词。

实现前确认的七个决策：

| 议题 | 决策 |
| --- | --- |
| 建议落地方式 | 每批通过校验后直接写入本地分类，不做预览确认；中断不影响已经写入的部分 |
| 提示词边界 | 系统提示词分层：输出契约与安全约束固定在代码中不可编辑，分类准则部分可编辑；用户提示词单独一层 |
| 分类范围 | 优先归入已有分类，确实没有合适的才新建分类 |
| 私有仓库 | 默认跳过，提供单独开关；开启后界面必须写明发送范围 |
| 批量方式 | 分批自动跑完，可中断；关页后重开可继续 |
| 置信度 | 不再按阈值筛选，全部写入；`confidence` 与 `reason` 仍然解析校验，但不影响是否落地 |
| 入口与交互 | 收藏页按钮「AI 整理」，点击后按钮内显示进度与旋转图标；结果与失败用右下角提示条反馈，没有对话框与关闭动作 |
| 整理配置 | 放在「AI 服务 → 整理配置」子标签：请求超时与私有仓库开关 |
| 架构 | 管理页驱动分批 + 草稿落既有 `jobs` 表，复用 Git 同步已验证的中断与原子提交模式 |

触发方式为手动：本轮不实现「同步后自动分类」与后台定时分类。后台自主发起可能产生费用的请求需要额外授权。

## 2. 现有基础

- `src/ai/service.ts` 目前只做 `GET {Base URL}/models` 与连通性判断，没有生成调用。
- 配置（Base URL、模型名、是否记住凭证）存 `chrome.storage.local`，API Key 走 `CredentialVault`，按规范化 Base URL 派生凭证 ID。
- 分类是本地概念：`List`（`source: 'remote' | 'manual'`，`tracked`）与 `Membership`。远端 Lists 只读。
- 同步草稿已经用 `jobs` 表（`keyPath: ['accountId','id']`，`accountId` 索引）保存游标与草稿；`JobState` 已包含 `running`、`needs_review`、`cancelled`、`failed`。
- `Job.type` 已包含 `'classify'`。

因此本轮不升级 IndexedDB 版本，不新增表，不新增权限，不新增运行时依赖。

## 3. 提示词模型

### 3.1 存储

`chrome.storage.local`，键 `ai:prompt:v1`：

```ts
interface AiPrompt {
  version: 1;
  /** 系统提示词中可编辑的分类准则部分。 */
  systemGuideline: string;
  /** 用户提示词，作为附加要求追加。 */
  userPrompt: string;
}
```

- 两个字段各不超过 8000 字符，且不得包含控制字符（`U+0000`–`U+0008`、`U+000B`、`U+000C`、`U+000E`–`U+001F`、`U+007F`）。
- 键缺失时使用代码内默认值；键存在但版本或内容无效时抛错，不覆盖原值。
- 「恢复默认」把两个字段写回默认值。
- 私有开关与超时不在这个键内，见 §7。

### 3.2 不可编辑的固定契约

以下内容写在代码常量中，界面只读展示，不落存储、不可修改：

- 角色：为给定的未分类项目分配分类。
- 只能输出约定的 JSON 结构，不得输出解释性正文、代码块或多余字段。
- 只能使用输入中出现的 `repositoryId` 与已有分类 ID。
- 不取消 Star、不删除或重命名分类、不移除已有归属。
- 不确定时降低 `confidence` 并在 `reason` 中说明，不得猜测。
- 不索取或输出任何凭证，不要求执行网络请求。

### 3.3 组装

```
system 消息 = 固定契约 + "\n\n## 分类准则\n" + (systemGuideline 或默认准则)
user   消息 = 本批项目与已有分类清单 + "\n\n## 附加要求\n" + (userPrompt 或默认用户提示词)
```

默认准则表达：按主要用途分类，语言与框架作为辅助信号；优先使用已有分类，避免名称相近的重复分类；同名项目归入同一分类；理由简短并给出置信度；信息不足时标记不确定。

默认用户提示词为空字符串，此时不追加「附加要求」段落。

## 4. 请求契约

- 方法：`POST {Base URL}/chat/completions`
- 请求体：`{ model, messages, temperature: 0.2, response_format: { type: 'json_object' } }`
- 请求头：`Authorization: Bearer <apiKey>`、`Accept: application/json`
- 网络约束沿用模型目录请求：`credentials: 'omit'`、`redirect: 'manual'`、`cache: 'no-store'`、`referrerPolicy: 'no-referrer'`；重定向、被拦截响应、非 2xx 均按既有分类给出可读错误。
- 超时取自整理配置（默认 120 秒，范围 15–600），响应体上限 1 MiB，逐块读取。超时后服务端可能仍在处理，界面提示可以重试本批或在整理配置里放大超时。
- 发送前检查主机权限与凭证是否就绪，任一缺失即拒绝，不降级为无凭证请求。

请求中的项目字段：`repositoryId`、`fullName`、`description`、`language`、`topics`。不发送 README、不发送仓库文件、不发送令牌。项目清单与已有分类清单都以 JSON 文本写入消息内容，便于模型稳定解析；已有分类清单只包含分类 ID 与名称。

## 5. 响应契约与校验

期望内容为 `choices[0].message.content` 中的 JSON：

```ts
interface RawSuggestion {
  repositoryId: string;
  categoryId: string | null;
  newCategoryName: string | null;
  reason: string;
  confidence: number;
}
```

校验规则（任一不满足即整批失败，不写入草稿）：

1. 响应体是合法 JSON，顶层含 `suggestions` 数组，长度不超过本批项目数。
2. 每条的 `repositoryId` 必须在本批输入集合中。
3. `categoryId` 为 `null` 或该账号已有分类的 ID。
4. `categoryId` 为 `null` 时 `newCategoryName` 必须通过既有 `categoryName()` 校验（1–80 字符、去掉首尾空白后非空、无控制字符）；`categoryId` 非 `null` 时忽略 `newCategoryName`。
5. `reason` 为字符串，不超过 200 字符，无控制字符。
6. `confidence` 为有限数且在 0 与 1 之间。
7. 每条建议的字段集合恰好是上述五个；出现未定义字段即拒绝整个批次。

归一化：

- 同一 `repositoryId` 出现多条时保留第一条。
- 新建分类名与已有分类名完全相同时（去首尾空白后比较），改为归入该已有分类，不新建。
- 同一批内多个项目建议同名新分类时合并为一个新分类。

归一化后的建议在本批内直接写入，不再按置信度分栏。

## 6. 草稿与状态机

草稿存 `jobs` 表，`accountId` 为账号 ID，`id` 为固定值 `classify:ai`，`type` 为 `'classify'`。扩展字段：

```ts
interface ClassificationDraft {
  mode: 'ai-classify';
  queue: string[];                 // 待处理的未分类 repositoryId，稳定顺序
  processed: number;               // 已处理数量
  batchSize: number;               // 常量 30
  includePrivate: boolean;         // 本次运行是否包含私有项目
  skippedPrivate: number;          // 因开关关闭而跳过的私有项目数
  applied: number;                 // 累计写入的项目数
  categoriesCreated: number;       // 累计新建的分类数
  failures: { batch: number; message: string }[];
}
```

草稿只在运行期间存在，`state` 固定为 `running`：

- 队列清空：删除草稿，返回本轮的 `applied` 与 `categoriesCreated` 供界面给出摘要。
- 单批失败：删除草稿并把可读原因抛给界面，已经写入的分类保留；下次点击按钮按当前的未分类项目重新建立队列，已处理的不会被重复整理。
- 运行期间关闭管理页：停止后续请求，草稿留在本地。

队列只包含开始时刻的未分类项目，按 `starredAt` 倒序排列、缺失时按 `id` 升序排列，保证同一状态下的顺序可复现；运行期间本地新增的未分类项目不自动加入，需再次运行。

## 7. 整理配置

放在设置页「AI 服务 → 整理配置」，存储在 `chrome.storage.local` 的 `ai:classify:v2`：

```ts
interface ClassifyConfig {
  includePrivate: boolean;   // 是否把私有项目交给 AI，默认 false
  timeoutSeconds: number;    // 单次生成请求超时，默认 120，范围 15–600
  batchSize: number;         // 每批请求包含多少项目，默认 30，范围 1–100
}
```

- `batchSize` 决定每次请求带多少个项目；数量越大，单次请求越慢、越容易触发超时。一次运行仍然处理全部未分类项目，只是分批的粒度可调。
- 读取时兼容旧键 `ai:classify:v1`（只含 `includePrivate`）与更早的 `ai:classify:v2` 记录（无 `batchSize`），缺失字段取默认值。
- 关闭私有发送时，私有项目不进入请求，整理窗口写明「已跳过 N 个私有项目」。
- 开启时，配置面板必须写明「私有项目的名称、描述、语言与 topics 会发送到 AI 服务地址」。
- 已开始的运行沿用开始时的取值；改变配置需要重新开始。

## 8. 消息接口

新增命令，沿用 `authorizeMessage` 的严格风格（固定字段数量、取值范围校验），仅管理页可用：

| 命令 | 字段 | 返回 |
| --- | --- | --- |
| `AI_PROMPT_READ` | 无 | `{ prompt: AiPrompt, defaults: AiPrompt }` |
| `AI_PROMPT_SAVE` | `systemGuideline`、`userPrompt` | `AiPrompt` |
| `AI_CLASSIFY_CONFIG_READ` | 无 | `ClassifyConfig` |
| `AI_CLASSIFY_CONFIG_SAVE` | `includePrivate`、`timeoutSeconds` | `ClassifyConfig` |
| `AI_CLASSIFY_START` | `accountId` | 草稿状态 |
| `AI_CLASSIFY_STEP` | `accountId` | 草稿状态；执行一批并在成功后立即写入 |
| `AI_CLASSIFY_READ` | `accountId` | `{ draft, unclassified: number, config, result }` |

写入发生在 `AI_CLASSIFY_STEP` 内部；没有确认命令，也没有中断命令。队列清空或某一批失败时草稿被删除，界面在完成后通过既有 `LIBRARY_READ` 让收藏页刷新。

## 9. 写入语义

每批建议通过校验后立即单事务提交（`LocalDatabase.commitLibrary`）：

- 新建分类：ID 为 `local:<uuid>`、`source: 'manual'`、`tracked: false`、`isPrivate: false`、`syncedAt` 为当前时间、`description` 为 `null`。
- 新建归属：ID 为 `<categoryId>:<repositoryId>`、`source: 'manual'`。
- 归入已有分类：写入同形状的归属。
- 被写入的远端来源分类（`source` 为 `remote` 且 `tracked` 非 `false`）同时置 `tracked: false`，与 `moveRepository` 的既有语义一致：本地动过就不再被远端同步覆盖。
- 已存在相同归属时不重复写入。
- 事务失败时原数据保持不变，错误内联呈现。

## 10. 界面

### 10.1 AI 设置

AI 面板拆为三个子分区，沿用 `settings-subtabs` 模式：

- `服务配置`：服务地址、API Key、模型名、自定义请求头。
- `分类提示词`：系统准则文本框、用户提示词文本框、字符计数、`恢复默认`、一段说明「输出格式与安全约束固定在扩展内，不随提示词改变」。固定契约以只读形式展示。
- `整理配置`：请求超时与私有仓库开关，见 §7。

### 10.2 收藏页入口与进度

`library-header` 增加次级按钮 `AI 整理`：

- 空闲：文案为 `AI 整理`。
- 运行中：文案为 `整理中 X / Y` 并带旋转图标，按钮禁用；不打开对话框，也不切换页面路由。
- 没有已连接账号时点击会给出提示条说明原因，不静默失败。

### 10.3 结果反馈

没有确认与预览环节，结果通过顶部居中的提示条横幅反馈：

- 成功：`已整理 N 个项目，新建 M 个分类。`（`role="status"`，4 秒后消失，可手动关闭）
- 失败：`整理中断：<原因>。已经处理的 N 个项目保留在本地。`（`role="alert"`，6 秒后消失，可手动关闭）
- 提示条最多同时三条，横幅会短暂覆盖页面顶部内容，因此不承载必须点击的内容；层级与写法见 `docs/design/ui-spec.md` §4.10。
- 整理结束后收藏页自动刷新，用户不需要额外操作。

### 10.4 自动保存

设置页除凭证外的字段都自动保存，没有保存按钮：

- 分类准则、用户提示词：停止输入 800 毫秒后保存。
- 整理配置（超时、每批整理数量、私有开关）：同样在停止输入后保存。
- AI 服务的模型名与自定义请求头：停止输入后保存，但只在 Base URL 未改变、且没有待保存的 API Key 时执行。
- Base URL 与 API Key、以及 Git 令牌：保留显式的「验证并保存」，因为更换地址会让旧凭证失效、凭证必须先验证才能落库。这条约束优先于自动保存。

界面实现必须满足 `docs/design/ui-spec.md`：颜色、字号、圆角、层级、动效时长取自 token 或固定阶梯；四套主题组合（folio/observatory × light/dark）分别成立；八种交互状态齐备；文案使用三段式错误说明，不使用 emoji 与营销腔。

## 11. 错误与中断

- 未配置服务、缺少 Key、缺少主机权限：提示条说明原因与下一步（到设置里配置），不发起请求。
- 单批失败：草稿被删除，提示条给出可读原因与已保留的项目数；已经写入的批次保持生效。
- 401/403 提示检查 API Key 与访问权限；429 提示限流并建议稍后重试；超时提示可重新点击或放大超时；400/422 附带服务端说明；形态错误提示服务可能不支持该接口。
- 运行期间关闭管理页会停止后续请求，草稿留在本地；再次点击按钮按当前的未分类项目重新建立队列。
- 切换账号：草稿按 `accountId` 隔离，互不影响。
- 账号被断开：草稿保留，但新一轮运行要求账号存在。

## 12. 边界与未做

- 不写回远端：不创建、不修改远端 Lists，与既有边界一致。
- 每个项目最多一个 AI 建议分类；本轮不做多分类、不做维度标签、不做分类合并与排序。
- 不做自动触发（同步后自动分类、后台定时分类）。
- 不做向量检索、不做 README 抓取、不做项目对比与手册。
- 不引入新的运行时依赖、不新增权限、不升级 IndexedDB 版本。
- 提示词不能解除固定契约：即使编辑准则要求输出其他格式，校验层仍按 §5 拒绝。

## 13. 验证

单元与集成测试（模拟 HTTP 与 fake-indexeddb）：

- 提示词：默认值、长度与控制字符校验、损坏数据不覆盖原值、恢复默认。
- 请求组装：固定契约始终存在、准则与用户提示词按顺序追加、私有关闭时请求体不含私有项目、私有项目在关闭时不出现在候选中。
- 响应校验：合法响应、越界 `repositoryId`、未知 `categoryId`、重复建议、缺失字段、未定义字段、非 JSON、`confidence` 越界、超长 `reason`、`newCategoryName` 非法。
- 归一化：同名归入已有分类、同批同名新分类合并。
- 草稿状态机：多批推进、队列清空后删除草稿并返回结果、单批失败删除草稿并抛出可读原因、已写入分类保留、中断后重新开始不重复处理。
- 写入：每批成功即写入、新建分类与归属一次提交、归入已有分类、远端分类置 `tracked: false`、重复归属不重复写入、跨账号隔离、事务失败保留原数据。
- 整理配置：默认值、范围校验、旧键兼容、超时传入生成请求。
- 消息边界：新命令字段数量与取值校验、内容脚本与弹窗无法调用、返回内容不含 API Key。
- 界面：使用 `react-dom/server` 渲染断言提示词面板字段、整理视图两栏与计数、禁用态文案。

工程验证：`pnpm typecheck`、`pnpm test`、`pnpm build`。

真实服务验收需要用户提供的 AI 服务与 API Key，并明确授权后才执行；模拟响应通过不代表真实供应商兼容。

## 14. 参考依据

- OpenAI 兼容的 `POST /chat/completions` 与 `response_format` 约定；具体供应商行为以真实调用结果为准，本文件不表示已完成真实集成测试。
- 仓库内既有实现：`src/ai/service.ts` 的网络与校验风格、`src/git/service.ts` 的分页与中断恢复、`src/library/categories.ts` 的分类写入语义、`docs/superpowers/specs/2026-10-09-amazing-stars-design.md` 第 7 节。
