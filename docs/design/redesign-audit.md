# Amazing Stars 现有 UI 设计审计

> 审计对象：Chrome 扩展管理页（收藏目录、项目详情、设置四页）。
> 基线：分支 `hallmark-coral-redesign`；工作树含未提交的 Tailwind v4 / Rare UI 接入改动。下文行号以 **2026-10-28 20:25 工作树快照** 为准；Lead 仍在并行改动，行号继续漂移时以表中的**选择器与语义锚点**为准。
> 重要现状：审计进行中，Lead 已把 Tailwind v4、`@custom-variant dark` 和 3 个 Rare UI 组件接入工作树（AnimatedCounter → 收藏计数；GravityLetters → 空状态；ThemeSelector → 外观主题轴）。因此 §5 中对应条目写成"**已接入 + 收尾缺口**"，而不是"从零引入"。
> 审计方式：只读代码（`design.md`、`tokens.css`、`base.css`、`library.css`、`settings.css`、`Library.tsx`、`SettingsTabs.tsx`、`AppearanceSettings.tsx`、`GitSettings.tsx`、`AiSettings.tsx`、`Brand/WorkspaceIcon/ModeIcon/SelectMenu/InfoTip/DataBoundary.tsx`、`entrypoints/manager/main.tsx`、`src/ui/rare/*.tsx`），对照 `.hallmark/shots` 的 1280×800、1440×900、375 截图，并用 oklch→sRGB + WCAG 公式实算四套调色板对比度。
> 系统约束：`design.md` 是锁定规则。本审计**不提议**更换字体族、不推翻 oklch 四调色板、不新增第二套视觉语言；所有建议都是"在 Coral / folio / observatory 系统内把细节做到印刷级"。

## 0. 结论摘要

1. **系统本身成立，问题不在风格而在完成度。** 纸张（paper/paper-2/paper-3）、桌（desk）、压印控件（shadow-control）、双墨水（ink / accent）的角色分工清楚；四套调色板的结构完全镜像，没有出现"某个主题是另一个主题的反相"这类问题。
2. **最破坏签名的缺口是"one grid"。** `tokens.css:2` 自称"every entry on one grid"，但 `.ledger-row` 的 name / marks / language / date 四列首行基线各自漂移 3–6px（`library.css:138,150-163`），表格观感更像"四列各排各的"。
3. **状态完整性问题比视觉问题更严重。** 设置面板 unmount 会丢掉未保存的 AI/Git 表单输入（P0）；刷新时旧数据被骨架整体替换（闪）；刷新失败静默；页码可越界成空白列表；Gitee 账号的"打开仓库"永远指向 github.com（P0）。
4. **动效方向正确，但三处接入都还没"calm 化"完成。** 按 `design.md:42-44`，本工作树已由 Lead 接入三处：收藏计数滚动（AnimatedCounter，`Library.tsx:305`）、空状态重力字（GravityLetters，`Library.tsx:355`）、主题预览选择（ThemeSelector，`AppearanceSettings.tsx:101-111`）。缺口是：计数器 0.6s 弹簧 + 搜索未去抖（每键滚一次）、重力字用随机拉丁字母且 `maxGlyphs=64`、主题预览缺 accent 标识且移动端仍两列。文件夹分组是**结构变化**而非动效，优先级高于任何装饰动效；其余位置必须静止，清单见 §5.3。
5. **对比度实测全部通过 AA，但有两个边界要管住。** 亮色 accent 5.02:1、muted 6.35–6.86:1、error 7.11–7.23:1；深色 accent 8.09–8.84:1。`--color-rule-2` 只有 **1.92–2.15:1**，只能做 hairline，绝不能当文字色；主题卡未选中边框约 1.5–1.9:1，是非文本对比（1.4.11）的真实缺口。
6. **交付统计**：共 **64 条**可执行建议 —— P0 × 2、P1 × 22、P2 × 40；其中 **9 条与 Tailwind / Rare UI 集成直接相关**（§10）。"最小改动高收益"Top 10 见 §9。

### 优先级与风险定义

| 级别 | 含义 | 处理建议 |
| --- | --- | --- |
| P0 | 会直接造成错误结果、数据丢失或集成阻塞 | 本轮必须修，先于一切视觉润色 |
| P1 | 影响系统一致性、可访问性或明显可用性 | 本轮/下一轮修，改动通常 ≤ 30 行 |
| P2 | 精修、卫生、未来迭代 | 可合并成一批，按截图核对 |

风险 = 改动可能带来的回归面。**低** = 纯 CSS/等价重构，截图即可验证；**中** = 涉及状态、焦点、层级或组件皮肤，需要键盘走查 + 双主题截图；**高** = 本文未出现，出现即建议拆任务。

---

## 1. 排版

**现状判断。** 字号阶梯完整（12/13/14/16/17/20/24/28），但**层级靠字号多、靠字重少**：页面标题、分区标题、条目名、账号名大量集中在 600；13px 与 14px 两档只差 1px，分不出"控件文字"和"阅读正文"。中文标题继承了 Latin 的负字距，CJK 字形被压紧。日期格式化散落在两个文件、每次渲染新建 `Intl` 实例。

| ID | 位置 | 现状 / 缺口 | 可执行改法 | 优先级 | 风险 |
| --- | --- | --- | --- | --- | --- |
| T01 | `library.css:138,150-163`；对照截图 1280×800 | `.ledger-row` 是 `align-items: start`；name 16px/1.35、marks 12px chip（带 4px padding）、language 12px、date 12px（带 4px padding）四列首行基线不一致，日期看起来比项目名低约 5px，"one grid" 失效 | `.ledger-row { align-items: baseline; }`；`.seal { align-self: start; }`；`.project-marks { padding-block-start: 0; }`；`.project-date { padding-block-start: 0; }`；若 chip 首行仍偏低，加 `.project-marks .mark { line-height: 1.35; }` | P1 | 低（跨行 desc 行高需截图核对） |
| T02 | `library.css:95-99`；`Library.tsx:305` | 标题 28/600/ink 与计数 24/400/muted 两个同级视觉焦点相互竞争（`tokens.css:4` 的 Hallmark 自评也点了"H 最弱"） | `.count-figure { font-weight: 500; color: var(--color-ink-2); }`；`.count-block { gap: var(--space-2xs); align-items: baseline; }`；`.count-label { margin-inline-start: var(--space-2xs); }`；标题保持 600/28 不动 | P1 | 低 |
| T03 | `library.css:13,96,154,192`；`base.css:17` | `.brand` 的 `-0.02em` 对 Latin wordmark 合理，但 `.library-head h1`（常为中文分类名，如「前端与 UI」「未分类」）、`.entry-identity h1`、`.project-name` 也吃 `-0.01em`，CJK 被压紧 | `.library-head h1, .entry-identity h1, .project-name { letter-spacing: 0; }`；`-0.02em` 只留在 `.brand`；若想给 Latin 仓库名收紧，用 `:lang(en)` 限定，不要作用于整段 | P2 | 低 |
| T04 | `base.css:7-11` | 中文/英文/数字混排没有 `text-spacing-trim` / `text-autospace`，标点间距全靠默认；斜杠、括号在 CJK 里偏松 | `body { text-spacing-trim: trim-start; text-autospace: normal; }`；标题同样加上；渐进增强，不支持的 Chromium 版本直接忽略 | P2 | 低 |
| T05 | `Library.tsx:14-16,373`；`GitSettings.tsx:27` | 收藏页 `dateStyle:'medium'` → "2026年10月27日"；Git 设置 `toLocaleString('zh-CN')` → "2026/10/27 14:32:11"，两种格式；`formattedDate` 每次调用都 `new Intl.DateTimeFormat`（40 行 = 40 次构造）；`<time>` 没有 `dateTime` 属性 | 新建 `src/ui/format.ts`：模块级 `const DATE = new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'})`、`const DATE_TIME = { ...同上, hour:'2-digit', minute:'2-digit' }`，导出 `formatDate/formatDateTime`；两处引用；`<time dateTime={repo.starredAt ?? undefined}>`；Git 设置改用 `formatDateTime` | P1 | 低 |
| T06 | `Library.tsx:16`；`library.css:138,225,231` | 每行都重复当前年份（"2026年10月6日"），占宽且制造噪声；日期列 112/104/100px，却被固定年份挤占 | 当年日期省略年份（"10月6日"），跨年才显示年份；格式化函数接受 `now`；列宽同步见 L04（112→96） | P2 | 低（时区以本地为准） |
| T07 | `library.css:154-163`；`settings.css:37-45`；`base.css:95` | 元数据 12px、控件 13px、正文 14px 三档混用；行高 1.5/1.55/1.6/1.65 四档并存，`.project-desc` 1.55 与 `.entry-description` 1.6 相邻不一致 | 约定：12px = 元数据（ledger head/date/language/mark/count-label/tab-count）、13px = 控件与短正文、14px = 阅读正文；行高：元数据 1.5、正文 1.6、标题 1.28–1.35；`.project-desc { line-height: 1.6; }` | P2 | 低 |
| T08 | `library.css:100,156,166`；`settings.css:38,44` | 说明文本的测量宽度有 44ch / 62ch / 70ch / 72ch / 76ch 五种；`.ledger-empty > p` 44ch 对中文约 22 字，空状态文案过早换行 | 说明文统一 56–62ch（中文约 28–31 字）；`.ledger-empty > p { max-width: 52ch; }`；`.category-description, .entry-description` 保持 70–72ch（长描述），`.field-help` 保持 62ch | P2 | 低 |

---

## 2. 色彩与表面

**现状判断。** 四套调色板角色一一对应，accent 使用纪律很好：accent 只出现在"已确定/当前"（选中轨、当前阶段、已连接、focus），board 只给唯一主操作。阴影光线统一从上方来（inset 上高光 + 向下投影），没有左右混光。问题集中在三处：材质只铺到了大纸面（弹层没有纸感）、主题样本的网格与边框不整除、深色弹层丢了高度。

| ID | 位置 | 现状 / 缺口 | 可执行改法 | 优先级 | 风险 |
| --- | --- | --- | --- | --- | --- |
| C01 | `library.css:3,79-86,212-219`；`base.css:131-162` | desk/sheet 有 `--tex-sheet/--tex-desk`，但 `.category-dialog`、`.filter-panel`、`.select-options`、`.info-tip-bubble` 只是纯色纸 —— 弹层与纸张的材质断层，folio 亮色最明显 | 只给"从 sheet 上切下来的大纸片"补纹理：`.category-dialog, .filter-panel { background-image: var(--tex-sheet); }`；小 popover（select/info-tip）保持纯色，避免 180px 噪声贴图在小面积里显得脏 | P2 | 低 |
| C02 | `AppearanceSettings.tsx:101-111`；`settings.css:62-68` | 主题预览已换成 ThemeSelector 的小型 app 预览，但 palette 只映射 `desk/paper/rule/rule-2/ink-2/paper-2`（`AppearanceSettings.tsx:35-45`），**没有 accent**：folio（coral）与 observatory（blue）在预览里几乎只差中性色温，主题身份丢失（旧的 `.theme-sample-mark` 2px accent 线已随 `.theme-sample` 一起被删） | 两种实现任选：① 给 `ThemePalette` 加可选 `accent` 并在 `Preview` 底部画 2px 线（additive 改组件，需 Lead 同意）；② 纯 CSS：`.theme-selector-block [data-slot="theme-selector-preview"]::after { content: ""; position: absolute; inset-inline-start: 12%; bottom: 14%; width: 24px; height: 2px; background: var(--color-accent); }`；同时 `previewColors()` 增读 `--color-accent` 以便未来按主题取色 | P2 | 低 |
| C03 | `tokens.css:75,94` | 深色两套的 `--shadow-pop` 只有 `inset 0 0 0 1px`，没有投影；亮色有 18px 大投影。深色下下拉/提示浮不起来，与纸面同层 | 深色补投影：`--shadow-pop: 0 18px 40px -20px oklch(0% 0 0 / 0.55), inset 0 0 0 1px oklch(38% 0.012 60 / 0.7);`（folio）与 `oklch(3% 0 0 / 0.6)`（observatory） | P2 | 低 |
| C04 | `base.css:45-48`；`library.css:87` | error 表面色直接内联 `color-mix(error 9%/10%/14%/22%, paper)` 共 5 处；`notice-bar` 在深色下与亮色共用同一行公式，未来改一处漏一处 | `tokens.css` 四套各加 `--color-error-soft: color-mix(in oklab, var(--color-error) 10%, var(--color-paper));`（深色 12%）；`.button.danger:hover/.confirming`、`.notice-bar` 引用该 token | P2 | 低 |
| C05 | `tokens.css:30,70` | `--tex-sheet` 与 `--tex-desk` 使用**同一个 SVG、同一个 alpha 0.05**：桌布与纸张噪声同强同相位，纸张只靠阴影"浮"起来，folio 下纸与桌的纹理边界会互相干扰 | desk 纹理降一档：feColorMatrix 第 20 个值 `0.05` → `0.03`（sheet 保持 0.05）；或 `.app { background-blend-mode: multiply; }` 只轻压桌布 | P2 | 低 |
| C06 | `settings.css:66-68`；`base.css:105-114`；`library.css:132-133` | 可交互卡片的静息边界对比度不足：ThemeSelector 预览卡未选中时没有自己的边界（`span:first-of-type` 只有 paper-2 背景，与 paper 对比约 1.07:1；Tailwind 的 idle ring `border-black/10` 约 1.1:1），远低于 1.4.11 的 3:1；`.tag-filter` 静息边框 rule（约 1.5:1）同样偏弱（`rule-2` 实测 1.92–2.15:1） | 新增 `--color-rule-control: color-mix(in oklab, var(--color-rule-2) 55%, var(--color-ink));`（四套各一条，深色 70%）；`.theme-selector-block [data-slot="theme-selector-item"] > span:first-of-type { box-shadow: inset 0 0 0 1px var(--color-rule-control); }`（选中态 2px ink 保留，内外叠加不冲突）；`.tag-filter { border-color: var(--color-rule-control); }`；非交互 `.tag` 保持 rule | P1 | 低（边框会略重，需双模式核对） |
| C07 | `library.css:160`；`tokens.css:25,47,66,85` | `--color-rule-2` 的实测对比度只有 1.92–2.15:1；`.mark-empty` 把它当文字色（当前已无引用，属"埋雷"）；token 语义里没有写明"只做 hairline" | 删除 `.mark-empty`（与 Q03 同批）；在 `tokens.css` 的 `--color-rule-2` 行加注释"仅 hairline / 非文字"；若未来需要空标记文字，用 `--color-muted` | P2 | 低 |

**已实测的对比度（四套调色板，WCAG 2.x）**

| 组合 | folio light | observatory light | folio dark | observatory dark | 判定 |
| --- | --- | --- | --- | --- | --- |
| muted / paper | 6.86:1 | 6.48:1 | 6.52:1 | 6.35:1 | 正文 AA 通过 |
| ink-2 / paper-2 | 12.25:1 | — | — | — | 通过 |
| accent / paper | 5.02:1 | 5.65:1 | 8.09:1 | 8.37:1 | 小字 AA 通过 |
| accent-ink / accent | 5.02:1 | 5.65:1 | 8.09:1 | 8.57:1 | 通过（`filter-count` 安全） |
| error / paper | 7.23:1 | — | 7.11:1 | — | 通过 |
| rule-2 / paper | 1.92:1 | 1.97:1 | 2.12:1 | 2.15:1 | **只能做 hairline** |
| muted / desk | 5.31:1 | — | — | — | rail 文字通过 |

---

## 3. 布局与节奏

**现状判断。** rail 236px + sheet 的结构在 1280–1440 下成立，375 下的顶部导航折叠也干净。问题：4px 间距阶梯在 32/48px 处断档（这两个值在代码里被硬编码 6 次）；设置页内容 720 固定在 1040 的文档宽度里，右侧留白明显（1440 截图右侧约 300px 空）；ledger 列宽在 1280 下让分类 chip 换行、行高不齐，而日期列常年富余。

| ID | 位置 | 现状 / 缺口 | 可执行改法 | 优先级 | 风险 |
| --- | --- | --- | --- | --- | --- |
| L01 | `tokens.css:14`；`library.css:87,92,183,227` | 间距阶梯 `2/4/8/12/16/24/40/64/96/144` 缺 32 与 48；实际代码 32px 用了 5 次（`.library` 内边距、`.notice-bar` 外边距、`.document` 上内边距、窄屏 `.document` 内边距）、48px 用了 1 次，页面内边距 32 与 app-frame 24 不同源 | `tokens.css` 补 `--space-lg-plus: 32px; --space-xl-plus: 48px;`（或 `--page-pad: 32px`）；替换 `library.css:87,92,181,225` 的硬编码；保留 4px 语义命名，不要叫 `--space-7` | P1 | 低 |
| L02 | `settings.css:8,31`；`library.css:181` | `.settings-shell` = 160 + 40 + 720 = 920，而 `.document` 宽 1040 居中 → 设置内容整体偏左，右侧大留白（1440 截图明显）；面板内 720 在 1280 以下才刚好贴满 | `.settings-shell { max-width: 960px; margin-inline: auto; }`；或 `.settings-content { max-width: 760px; }` + shell 居中；index 保持 160 | P2 | 低 |
| L03 | `library.css:41` | `.rail-list { max-height: clamp(160px, calc(100dvh - 420px), 640px); }` 的 420px 是硬编码；矮窗口（<700px 高）分类列表只剩 160–280px，分类多时频繁滚动，而 rail 其余部分是 flex 布局 | 改为弹性：`.rail-section { flex: 1 1 auto; min-height: 0; }`、`.rail-list { flex: 1 1 auto; min-height: 0; max-height: none; }`；`.rail-hint` 与「未分类」行保持 `flex: none`；`rail-foot` 已 `margin-top: auto` | P2 | 中（800/900/1080 三档高度需核对） |
| L04 | `library.css:138,225,231` | 1280 下分类列 180px，2+2 个 chip 会换到第二行（截图可见行高不齐）；日期列 112/104/100px 却常有富余 | 配合 T06：≥1200 `36px minmax(0,1fr) 200px 88px 96px`；≤1200 `36px minmax(0,1fr) 168px 88px 88px`；≤1040（隐藏语言后）`36px minmax(0,1fr) 160px 88px`；`.ledger-head` 同步 | P2 | 低（1280/1024/1440 三档截图） |
| L05 | `library.css:283` | 工作树新增的移动端第二行分类 chip 用 `flex-wrap: nowrap; overflow: hidden;`，超出部分直接裁掉且无提示；用户不知道还有更多分类 | 方案 A：`.project-marks { mask-image: linear-gradient(90deg, #000 82%, transparent); }` 并在 `Library.tsx:367` 末尾追加 `+N`（`memberships.length + tags.length - 4`）；方案 B：允许横滑 `overflow-x: auto; scrollbar-width: none;` 并保留渐变提示 | P2 | 低 |
| L06 | `library.css:17-22,61,70` | 文字型 rail 条目命中高只有 36px（`rail-settings` 36、rail 内 select 32）；图标按钮都有 `::before` 扩展到 44+，唯独主要导航没有 | `.rail-entry { min-height: 40px; }`、`.rail-settings { min-height: 40px; }`、`.rail-account .select-trigger { min-height: 36px; }`；≤60rem 的紧凑模式保持 34–36 可接受（桌面键盘/鼠标场景） | P1 | 低 |
| L07 | `library.css:4-8`；`tokens.css:18` | `.app-frame` 上限 1480px（`--container`），≥1920 后 sheet 恒为约 1180px，2560 下两侧 desk 留白超过 500px，"桌上的一张纸"变成"桌中间的一张小纸" | `--container: clamp(1480px, 92vw, 1680px);`：1440 下 prefered 值 1325 小于 min，结果仍 1480（不回归）；1920 下取 1680；也可直接 `max-width: 1600px` | P2 | 低（超宽屏需截图） |
| L08 | `library.css:165` | `.ledger-empty { flex: 1; min-height: min(420px, 100%); padding-block: 64px }` 中的 `100%` 依赖父级解析；矮窗口里空状态可能撑出滚动条，且骨架/空状态/错误三态切换时高度跳变 | `.ledger-empty { flex: 1; min-height: 0; padding-block: var(--space-3xl); }`，高度交给 `.ledger-body` 的 flex 分配；骨架、空状态、错误态共用同一盒模型 | P2 | 低 |

---

## 4. 交互状态

**现状判断。** hover / focus-visible / selected / disabled 基本齐全，focus ring 统一 `2px accent + offset 2`，键盘路径完整（tablist 方向键、SelectMenu 虚拟焦点、对话框 Tab 循环）。真正的缺口在**状态生命周期**：卸载丢表单、刷新闪骨架、失败静默、页码越界；以及按压过渡不一致（有 `translateY(1px)` 但没有对应过渡）。

| ID | 位置 | 现状 / 缺口 | 可执行改法 | 优先级 | 风险 |
| --- | --- | --- | --- | --- | --- |
| S01 | `SettingsTabs.tsx:46-69`；`GitSettings.tsx:165-189`；`AiSettings.tsx:7-113` | **设置面板只渲染当前项**：在 AI 页输入 Base URL / Key / 模型后切到「Git」再回来，未保存内容全部清空；Git 的 GitHub/Gitee 子标签切换也会丢掉正在粘贴的 token（`ProviderPanel` 卸载）。同时非激活 tab 的 `aria-controls` 指向不存在的 DOM id | `panels` 改为全量渲染，非激活面板加 `hidden`（`base.css:26` 已有 `[hidden]{display:none!important}`）；Git 两个 `ProviderPanel` 同样保留挂载；`AiSettings` 增加 `active` prop，延迟到首次激活再发 `AI_READ`（或接受一次只读请求）；focus / aria-selected 逻辑不变 | **P0** | 中（挂载时机、请求次数、焦点顺序需走查） |
| S02 | `src/library/library.ts:55-58`；`Library.tsx:23,34` | `repositoryUrl` 硬编码 `https://github.com/`，Gitee 账号的「打开仓库」会打开 github.com 上的同名路径（404 或错误仓库）。这是 UI 直接暴露的内容错误 | `repositoryUrl(fullName, provider)`：`provider === 'gitee' ? 'https://gitee.com/' : 'https://github.com/'`；`ProjectDetail` 从 `data.accounts.find(a => a.accountId === data.accountId)?.provider ?? 'github'` 取 provider；补一条单元测试 | **P0** | 低 |
| S03 | `base.css:50-58`；`settings.css:17,28`；`library.css:36-38,54-55` | `.icon-button` 与 `.settings-tab` 的 `transition` 只有 background/color，但 `:active` 会 `translateY(1px)` → 按下瞬间跳变；同类 `.button`（`base.css:36`）已有 transform 过渡。rail-add / rail-edit 的 `:active` 只有背景变化，与 icon-button 又不一致 | 两个 transition 追加 `transform var(--dur-micro) var(--ease-out)`；`.rail-add:active, .rail-edit:active { transform: translateY(1px); }`；两者 transition 同步追加 transform | P1 | 低 |
| S04 | `Library.tsx:143,152,347,353` | 保留数据的刷新（分类保存、同步完成走 `load(account.current, false)`）也被 `loading && <skeleton>` 无条件替换为骨架 → 每移动一次分类就整页闪一下；`aria-busy` 已设置在 `.ledger` 上但视觉未利用 | 骨架条件改为 `loading && !data`；有 data 时给 `.ledger { opacity: .6; pointer-events: none; }` + 保留 `aria-busy`，完成即恢复；不要加骨架 shimmer（违反 calm） | P1 | 低 |
| S05 | `Library.tsx:148-151,352` | 错误只在 `!loading && error && !data` 分支显示；已有 data 的刷新失败时，界面继续展示旧快照且**没有任何提示**，用户以为操作已生效 | `error && data` 时在 `.ledger` 上方渲染现有 `.notice-bar`："读取失败，正在展示上次快照 · 重试"；`load()` 开始时清 error，成功后清 error | P1 | 低 |
| S06 | `Library.tsx:81,158,358,376` | `page` 不随 `results.length` 收敛；同步后收藏变少（或筛选保留数据缩小）时 `slice((page-1)*40, page*40)` 为空 → ledger 空白，pager 显示如 `3 / 2` | `const pages = ...`；`useEffect(() => setPage(p => Math.min(p, pages)), [pages]);`；渲染时兜底 `const currentPage = Math.min(page, pages)`；翻页/筛选已有重置逻辑保留 | P1 | 低 |
| S07 | `library.css:173-174`；`settings.css:177-183` | 骨架行 44px，实际行高约 72–80px（两行内容）→ 加载完成时高度跳变；settings 骨架 tabs 32 / title 24 / cards 160，与实测 44 / 20 / 168 不一致 | `.skeleton-rows span { height: 72px; }` 并补两个内嵌短条模拟 name/desc；`.settings-skeleton .skeleton-tabs { height: 44px }`、`.skeleton-title { height: 20px }`、`.skeleton-cards span { height: 176px }` | P2 | 低 |
| S08 | `Library.tsx:309-311` | 已连接/未连接都用 `refresh` 图标；未连接时点击只是跳 `#settings`，而设置页默认落在「外观」标签，用户还得再找 Git；运行中按钮没有 `aria-busy` | 未连接时图标换 `settings` 或 `external`，文案已是「连接 Git 账号」；`aria-busy={syncRunning}`；把设置页 tab 深链化：`#settings/git`，`SettingsTabs` 从 hash 初始化 `tab`（同时修正返回收藏的 hash） | P2 | 低 |
| S09 | `library.css:61-63` | `.rail-settings` 只有 hover / current，没有 `:active`；同一导航区的 `.rail-entry` 有 active 背景，两套手感 | `.rail-settings:active { background: var(--color-paper-3); transform: translateY(1px); }`（配合 S03 的 transform 过渡） | P2 | 低 |
| S10 | `AppearanceSettings.tsx:85-86,87-91` | `systemDark` 在 render 时用 `matchMedia().matches` 一次性求值、无监听；系统切换深浅色时整页跟随（`theme.ts:7-17` 有监听），但两张主题样本仍按旧值取 palette，预览与实际不一致，直到再次渲染 | `const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);` + `useEffect` 注册 `change` 监听并清理；`resolvedMode` 由 state 计算 | P1 | 低 |
| S11 | `AppearanceSettings.tsx:82,124-126` | 初次进入即显示「外观设置已保存。」（实为读取完成）；用户改选主题后文案也不表达"已写入本地"的边界；保存失败只走全局 error notice | 改为三态文案：「正在读取外观设置…」/「外观设置会立即保存到此设备」/ 保存中「正在保存外观设置…」；成功态由 `!saving && appearance` 决定，失败走全局 error；文案需产品确认 | P2 | 低（文案决策） |
| S12 | `InfoTip.tsx:11-20`；`base.css:148-162` | `onMouseEnter/Leave` 绑在外层 span，气泡位于 trigger 上方 8px；从 trigger 移向气泡时经过间隙触发 leave → 气泡立即消失，无法阅读长文本或点内部链接；`::before inset -11px` 又扩大触发区侵入相邻控件 | `onMouseLeave` 移到包含气泡的 wrapper，加 80ms 延迟关闭并在 `onMouseEnter` 取消；若气泡内无交互元素，直接 `pointer-events: none`；键盘打开逻辑保留 | P2 | 低 |
| S13 | `Library.tsx:297-298,329`；`base.css:111-114` | 选中分类筛选时在 chip 文字前插 check 图标，chip 宽度增加约 16px，整行 tags 重新排布，快速点选时抖动 | 始终渲染图标，未选中 `visibility: hidden`（保留占位）；或选中态加 `padding-inline-start: calc(var(--space-xs) + 12px)` 预留 | P2 | 低 |
| S14 | `SelectMenu.tsx:16,55`；`Library.tsx:154,168` | 数据刷新后已选语言/tag/分类可能不存在（换账号、远端标签删除）：select 回退显示 label、结果 0 却无法解释；`tagIds` 里可能出现幽灵 chip | `useEffect` 在 `data` 变化时裁剪：`language` 不在 `languages` → `''`；`tagIds = tagIds.filter(id => data.tags.some(t => t.id === id))`；`listId` 不在 lists 且非 `__unlisted` → `''`；一次 `setFilters` 完成并重置 page | P2 | 低 |
| S15 | `Library.tsx:362-364`；`library.css:58,149` | 拖拽只有 `dragging` 透明度下降；drop-target 只染 rail-item 背景，计数/编辑按钮无联动；没有 `cursor: grabbing` | `.ledger-row.dragging { opacity: .55; cursor: grabbing; }`；`.rail-item.drop-target .rail-count { color: var(--color-accent); font-weight: 600; }`；`.rail-item.drop-target .rail-edit { opacity: 1; }`；不新增动画 | P2 | 低 |
| S16 | `Library.tsx:155,158,305`；`library.css:104-109` | 搜索框没有去抖：每次键入都重跑 `filterRepositories`、重建 40 行，并触发刚接入的 AnimatedCounter 滚动；中文输入法组合期（拼音）也会触发中间态 | 加 150–200ms 去抖：本地 `searchTerm` state + `useEffect` 提交到 `filters.query`，或 `useDeferredValue(filters.query)` 包过滤；输入法用 `compositionstart/end` 跳过组合期；去抖完成后再触发计数动画（M01 的前置） | P1 | 低 |

---

## 5. 动效缺口与 Rare UI 落点

### 5.1 判定线（把 `design.md:42-44` 翻译成可执行规则）

`design.md` 的 Motion 是 **"calm, state only. Hover tints, status changes; active presses 1px; focus appears at once. No reveals, no entrance choreography, no looping motion. Under reduced motion every transition collapses."**

由此得到本项目的动效准入规则。**满足下列全部条件才允许**：

1. **由用户动作或真实状态变化触发**（不是首帧、不是滚动、不是定时器）；
2. **一次性收敛**：最多一个来回，结束即静止，不循环、不待机动画；
3. **不改变布局**（不做高度/宽度/位置动画；高度动画会带动整个 ledger）；
4. **不抢焦点**：同一屏同时最多一处动效；
5. **reduced-motion 下有等价静止态**（不是"变快"，而是"直接到位"）；
6. **不是装饰性入场**（不做 stagger、不做页面切换过渡、不做 hover 抬升）。

**允许的形态**：颜色/透明度 120–180ms 过渡、按压 1px、数字一次性滚动、由点击触发的物理落位（结束后静止）、选择态的 ring 出现。

**禁止的形态**：骨架 shimmer、循环呼吸/脉冲、自动播放的粒子/重力、滚动驱动动画、popover 缩放淡入、tab 指示条滑动、数字每键滚动、hover 抬升或阴影放大、页面/详情切换的转场。

### 5.2 Rare UI 组件落点

> 组件源码已适配至 `src/ui/rare/`（`animated-counter.tsx`、`gravity-letters.tsx`、`theme-selector.tsx`，均去掉了 `"use client"`、`cn` 改为相对路径）。以下建议只使用其既有 props / 既有 a11y，不改变组件 API；少数"手感常量"（如 `BOUNCE`）建议作为集成期的视觉微调单独评审。

| ID | 位置 | 组件 / 落点 | 现状 / 缺口 | 可执行改法 | 优先级 | 风险 |
| --- | --- | --- | --- | --- | --- | --- |
| M01 | `Library.tsx:305`；`library.css:97-98`；`src/ui/rare/animated-counter.tsx:303` | **AnimatedCounter 已接入收藏计数** | 现渲染 `<AnimatedCounter className="count-figure" value={results.length} />`，动效方向正确（"筛选结果变化"是状态变化，符合 calm），但还没 calm 化：默认 `duration=0.6` 是弹簧、`BOUNCE=0.18`（`animated-counter.tsx:37,306`）；搜索未去抖 → 每敲一键滚一次；`LINE=1.5em` 让数字行高 36px，而 `.count-figure` 是 24px/1.1（≈26px），标题块高度会变、基线需核对；首屏 0→N 也会滚（是否保留由产品定） | 搜索去抖（S16，前置）；调用处传 `duration={0.35}`；`BOUNCE` 改 `0`、`LINE` 改 `1.2`（组件内部视觉常量，需 Lead 同意）；`.count-figure` 预留 `display: inline-flex; align-items: baseline;`；首屏若不滚，用首帧 state 控制 `duration=0`；组件自带 `sr-only` 与 `tabular-nums`，**不要**在外层再加 `aria-live` | P1 | 中（基线、字体、reduced-motion 需截图 + 系统设置验证） |
| M02 | `Library.tsx:214,234,376`；`GitSettings.tsx:38-40,131` | **数字滚动的禁止位置** | rail 的 `rail-count/rail-total`、footer 总数、pager「1 / 2」、同步计数 `已读取 N 个项目`、tab-count 若也换成计数器：加载/同步时十几个数字同时滚，直接违反"不抢注意力"与"no looping" | 只有 `.count-figure` 一处滚动；rail/footer/pager/同步计数保持静态 `tabular-nums`；触发时机限定为"数据加载完成"和"筛选结果变化且搜索已去抖"，hover/resize/page 切换不滚 | P1 | 低（规范约束） |
| M03 | `Library.tsx:354-355`；`library.css:171`；`src/ui/rare/gravity-letters.tsx:9` | **GravityLetters 已接入空状态** | 现渲染 `<GravityLetters className="rare-gravity" type="letters" size={20} maxGlyphs={64} deviceTilt={false} color="var(--color-muted)" />`（`.rare-gravity` 520×190px）。方向对，但有四件事要收：① `type="letters"` 默认随机 A–Z 字母，中文界面里拉丁字形与 CJK 混排打架；② `maxGlyphs=64` 偏多，190px 区域会被堆满、抢注意力；③ 同一分支同时覆盖"无账号首启"与"已同步但无收藏"两种空态（`data.accountId` 三元），后者应是"等待第一次同步"的安静态；④ 375 宽下 190px 偏高 | ① `items={['收','藏','星','档','书','签']}`（用 `items` 优先于 `type`）；② `maxGlyphs={14}`–`20`；③ 只在无账号首启用重力字，已同步空态改静态星图；④ `@media (max-width: 40rem) { .rare-gravity { height: 140px; } }`；⑤ 装饰区与 CTA 已是兄弟节点（正确），若产品觉得玩具感过强可 `pointer-events: none` 降级为纯装饰；`deviceTilt={false}` 保留；reduced-motion 下确认点击即静止落位 | P1 | 中（玩具感与中文单字需产品确认；只在空状态挂载，性能可接受） |
| M04 | `AppearanceSettings.tsx:101-111`；`settings.css:62-68`；`src/ui/rare/theme-selector.tsx:153` | **ThemeSelector 已接入主题轴** | 现由 `ThemeSelector` 受控渲染（`value={appearance?.theme ?? null}`、`onChange`、`labels`），palettes 从 `readPalettes()` 扩展读取并按选中卡显示 note；旧 `.theme-choice` 样式已删。收尾缺口：① 缺 accent 标识（见 C02）；② 说明从"每卡一条"变成"仅选中卡一条"（`AppearanceSettings.tsx:110`），未选中主题失去说明，两款 note 长短不同导致切换时下方内容跳动；③ 移动端仍两列——`settings.css:217` 的 `.theme-choices` 已是死规则，对新组件无效；④ `fieldset[disabled]` 只给 `.mode-segment` 做了透明度，ThemeSelector 依赖组件自身 `opacity-50`，需核对 disabled 时 hover ring 是否仍出现；⑤ radiogroup 的 `aria-label="主题"` 与 fieldset `legend 主题` 读屏重复；⑥ `border-[var(--color-accent)]/60`（`theme-selector.tsx:65`）的 focus ring 需 build 后确认可见 | ② `.theme-selector-note { min-height: 3.2em; }` 或恢复两卡固定短说明；③ 在 ≤40rem 覆盖 `.theme-selector-block > [data-slot="theme-selector"] { grid-template-columns: minmax(0, 1fr); }` 并删除死规则；④ 核对/补 `.settings-fieldset:disabled .theme-selector-block { opacity: .55; }`；⑤ legend 改「外观主题」；⑥ 见 M09 验证 | P1 | 中（Tailwind 与 fieldset disabled 交互、移动端单列、读屏分组名需走查） |
| M05 | `Filters`（`src/library/library.ts:21-25`）、`Library.tsx:345-374`、`library.css:137-178` | **Folder 分组 → 收藏台账** | 分类只以 chip 出现在「分类」列；`moveRepository`（`src/library/categories.ts:110-121`）每次移动替换全部 membership，是**单分类/文件夹模型**，界面却没有表达；左侧 rail 是唯一分组入口，且 `listSource/listTracked`（`src/data/types.ts:75-77`）能区分远端/本地分类 | `Filters` 增 `grouping: 'none' \| 'list'`；toolbar 在筛选旁加 secondary 按钮「按分类分组」（`aria-pressed`）；开启后先按当前排序筛出结果、按当前页切分，再对**当前页**分组（避免跨页组头）：无 membership → 「未分类」；组头 `.group-head { display: flex; align-items: center; gap: var(--space-xs); position: sticky; top: 0; z-index: var(--z-raised); min-height: 40px; padding-inline: var(--space-2xs); background: var(--color-paper); border-bottom: var(--hair) solid var(--color-rule-2); }`，内容 = `folder` 图标 + 组名（500）+ `rail-leader` 式虚线 + `tabular-nums` 计数；组头复用 `dropProps(listId, listId)`，拖到组头即移动；折叠用 `aria-expanded`，**高度切换不加动画**；行内「分类」chip 在分组时隐藏（只留本地 tag 的虚线 chip）；`filters.listId` 非空时禁用分组；组头图标对 `listTracked` 为 true 的分类加 `--color-muted` 小链接标记（远端跟踪），本地分类不加；空分组不渲染 | P1 | 中（排序/分页与分组的先后需产品确认；sticky 组头在 `.ledger-body` 滚动容器内有效） |
| M06 | `theme.ts:7-17`；`base.css:7-11` | 主题切换过渡 | 四套调色板切换是瞬时的；folio 亮 → observatory 暗是一次大面积硬切，眼睛需要重新对焦 | 在 `applyAppearance` 应用主题时给 `html` 加一次性 class：`.theme-switching *, .theme-switching *::before { transition: background-color 180ms var(--ease-out), border-color 180ms var(--ease-out), color 180ms var(--ease-out); }`，`requestAnimationFrame` 两帧或 260ms 后移除；`prefers-reduced-motion: reduce` 时不加 class；注意只在"用户改设置"时加，首次应用 appearance 不加（避免 FOUC） | P2 | 中（过渡期间覆盖 hover 过渡；首次应用边界需实现精确） |
| M07 | `library.css:145-164`；`settings.css:62-68` | 允许的微观状态反馈（在 calm 内） | 当前 row hover 只有背景色；`.row-cue` 只在移动端出现；seal 无反馈；主题卡 hover 只换预览背景、label 不变 | `.ledger-row:hover .seal { border-color: var(--color-rule-2); background: var(--color-paper-3); }`（120ms 状态 tint）；`.ledger-row:hover .row-cue { display: inline-flex; }`（桌面揭示 chevron，无动画）；`.theme-selector-block [data-slot="theme-selector-option"]:hover [data-slot="theme-selector-label"] { color: var(--color-ink-2); }`；全部只做颜色/透明度，不做位移 | P2 | 低 |
| M08 | 全局 | 不该引入的 Rare UI 类型 | Rare UI 多数组件是"炫技型"（重物理、循环、滚动驱动），与本产品"成熟工具 / restrained"气质不匹配；GravityLetters 若作为背景会持续 RAF 并抢注意力 | 只引入本次 3 个组件 + 自研分组；不引入其他粒子/跑马灯/文字抖动/滚动驱动组件；GravityLetters 只在空状态、只在用户可触发范围；`motion` 依赖只为计数器引入，禁止再用它做页面转场 | P2 | 低（规范） |
| M09 | `src/ui/tailwind.css:9-27`；`entrypoints/manager/main.tsx:1-4` | **Tailwind 桥接（已部分完成）** | `@custom-variant dark (&:where([data-mode="dark"], [data-mode="dark"] *))` 已加（`tailwind.css:11`），Rare 组件的 `dark:` 已跟随应用强制模式，原阻塞点解除；仍缺：`@theme inline` 只桥接 11 个颜色，未含 `accent-ink/error/focus/board/board-type/字体/圆角/阴影`；`--color-accent: var(--color-accent)` 是自引用桥接，能成立**只因为** `tokens.css` 未分层且 import 在 `tailwind.css` 之后（`main.tsx:1-4`），顺序一变即失效；`border-[var(--color-accent)]/60` 依赖 v4 对 CSS var 的 opacity → `color-mix`，需 build 后确认 ring 可见 | 补全 `@theme inline`（`--color-accent-ink`、`--color-error`、`--color-focus`、`--color-board`、`--color-board-type`、`--font-body`、`--font-display`、`--radius-sheet/control/chip`、`--shadow-sheet/control/pop`）；在文件顶部加注释固定"tokens.css 必须在 tailwind.css 之后导入，桥接变量不得改序"；build 后检查主题选择 focus ring 与 `dark:` chrome；确认 unlayered 项目 CSS 仍压过 utilities（`tailwind.css:1-5` 注释正确） | P2 | 中（需 build + 双主题截图；本轮只读审计未跑 build） |

**Rare UI 落点速查**

| 组件 | 文件 | 唯一落点 | 触发 | 禁止出现的位置 | reduced-motion 等价态 |
| --- | --- | --- | --- | --- | --- |
| AnimatedCounter | `src/ui/rare/animated-counter.tsx:303` | 已接入 `.count-figure`（收藏计数，`Library.tsx:305`） | 数据加载完成 / 筛选结果变化（搜索经去抖） | rail 计数、footer 总数、pager、同步计数、tab-count | 立即显示最终值（`useReducedMotion` 已处理，需实测） |
| GravityLetters | `src/ui/rare/gravity-letters.tsx:9` | 已接入空状态装饰区（`Library.tsx:355`，收尾见 M03：限无账号首启、中文单字、maxGlyphs） | 用户点击撒字（一次性）；不自动播放 | 背景、有数据的列表、错误态、过滤空态、骨架 | 落下即静止（`still` 分支，需实测） |
| ThemeSelector | `src/ui/rare/theme-selector.tsx:153` | 已接入外观主题轴（`AppearanceSettings.tsx:101-111`，收尾见 M04） | 用户选择主题 | 明暗模式轴（现 segmented 更合适）、Git/AI/数据边界页 | 选择立即生效，ring 不做过渡（`motion-reduce:transition-none` 已写，需实测） |
| Folder 分组（自研，非 Rare 组件） | `Library.tsx:345-374` | 收藏台账 | 用户切换分组视图 / 拖拽移入分类 | 设置页 | 结构切换，无动画（本来如此） |

### 5.3 必须保持静止（违反 calm 的高风险改法）

| 位置 | 会被诱使加入的动效 | 为什么必须静止 |
| --- | --- | --- |
| `.ledger-row` | hover 抬升 / 阴影放大 / stagger 入场 | 40 行同时出现入场编排直接违反 "no reveals, no entrance choreography"；行是表格的一部分，抬升会破坏扫描节奏 |
| 骨架（`library.css:171`、`settings.css:200`） | shimmer / 脉冲 | 循环动画，违反 "no looping motion"；骨架只是占位，静止的纸色块即可 |
| `.filter-panel`、`.select-options`、`.info-tip-bubble` | 缩放淡入 / 上滑出现 | 属于 reveal；`SelectMenu` 是高频操作，动效会拖慢选择 |
| `.settings-tab::before`、`.settings-subtabs [aria-selected]::after` | 指示条滑动 / 宽度过渡 | 属于入场编排，且会与 2px 强调线的"即刻确定"语义冲突 |
| `.sync-stages li.current::after` | 循环进度条 / 呼吸 | 同步是后台状态，持续运动抢注意力；按钮文案和阶段下划线已足够 |
| 页面/详情切换（`Library.tsx:256-267`） | 转场 / 淡入 | 违反 "no reveals"；hash 路由切换应瞬时 |
| 计数区域（已接入 AnimatedCounter） | 每次键入滚动 / hover 时滚动 / 首次加载弹跳 / 0.6s 弹簧回弹 | 数字滚动的合法性来自"状态变化"，不是"任何变化"；当前搜索未去抖，每键都会触发，必须先去抖并把弹簧降为匀速收敛（M01/S16） |
| 空状态（已接入 GravityLetters） | 自动撒字循环 / 待机重力 / 64 个拉丁字母堆满 | 一旦自动播放就是 looping motion；当前 `maxGlyphs=64` 会在 190px 区域堆满，接近"背景持续有东西"的观感；限 14–20 个中文单字、仅用户点击触发（M03） |
| 主题选择卡 | 预览内网格移动 / 视差 | 循环/装饰；主题预览的职责是"诚实展示"，不是炫技 |
| 全站 | 平滑滚动（scroll-behavior: smooth） | 违反 reduced-motion 精神且与本设计无关；`base.css:165` 已强制 auto，不要改回来 |

### 5.4 不做什么（尊重已锁定系统）

- 不换字体族（body 仍 Segoe UI + 中文字体；display 仍 Fraunces / Space Grotesk，仅 wordmark 与 Latin 标题）。
- 不推翻 oklch 四调色板，不引入第二套色板；Rare 组件的中性色只能作为**预览 chrome** 且集中在文件顶部常量，主界面必须走 token。
- 不做卡片化重构、不加圆角阴影卡片、不做阴影抬升；保持"印刷纸张 + 压印控件"的一层材质。
- 不删除 index rail、不改双页面结构（收藏/设置）。
- 不为动效而动效：本文 §5.2 之外的任何动效建议都不进入本轮。

---

## 6. 可访问性

**现状判断。** 基础扎实：`lang="zh-CN"`、`focus-visible` 统一、tablist 方向键 / Home / End 已实现、SelectMenu 有 listbox 虚拟焦点、对话框有手写 Tab 循环、`prefers-reduced-motion` 全局塌缩。缺口：导航语义混用 toggle 语义、同步阶段状态不可读、live region 过多、对话框没有隔离背景、行按钮的 `aria-label` 吞掉了可见信息。

| ID | 位置 | 现状 / 缺口 | 可执行改法 | 优先级 | 风险 |
| --- | --- | --- | --- | --- | --- |
| A01 | `Library.tsx:213,244`；`library.css:26` | 分类点击是**导航/过滤**，却用 `aria-pressed`（toggle 语义）；主「所有收藏」用 `aria-current="page"`，同一 rail 两套语义；选中分类后「所有收藏」失去 current，读屏无法得知当前分类 | 改为 `aria-current={filters.listId === list.id ? 'page' : undefined}`（「未分类」同）；`aria-pressed` 只保留给真正的 toggle（`tag-filter`、分组按钮）；CSS `library.css:26` 已同时包含两种选择器，无需改 | P1 | 低 |
| A02 | `GitSettings.tsx:31-37` | `.current/.done` 只是视觉类；阶段切换不会播报；`role=status` 只在 counts 上，读屏听不到"进行到哪一步" | `<ol className="sync-stages" aria-label="同步阶段">`；`<li aria-current={index === current ? 'step' : undefined}>`；把「第 N / 共 M 阶段」并入 `.sync-counts` 的 status 文本（一次 live 播报包含阶段与计数） | P1 | 低 |
| A03 | `SettingsTabs.tsx:66-68`；`Library.tsx:307`；`GitSettings.tsx:38`；`AppearanceSettings.tsx:124`；`AiSettings.tsx:109` | `tabpanel` 有 `tabIndex={0}` → 在表单前多一个 Tab 停靠点；同屏最多 3–4 个 polite live region（sync-caption、sync-counts、inline-status、inline-error），读屏可能互相打断 | 移除 panel 的 `tabIndex`（面板内含可聚焦控件时不需要）；每屏只保留一个 `role="status"` 区域（收藏页 sync-caption；设置页 inline-status），其余改普通文本或 `aria-live="off"`；error 用 `role="alert"` 即可 | P2 | 低 |
| A04 | `Library.tsx:160` | `closeDetail` 关闭后用 rAF 查找 `#repository-<id>`；若该行已被筛选/翻页移除，焦点落到 body，读屏/键盘用户丢失位置 | 找不到时 `document.getElementById('library-title')?.focus()`（给 h1 加 `tabIndex={-1}`）或聚焦搜索框；保持 rAF 等待 DOM 更新 | P2 | 低 |
| A05 | `Library.tsx:271-301`；`library.css:212-219` | `role=dialog aria-modal=true` + 手写 Tab 循环，但背景没有 `inert`、没有锁滚动、没有 `aria-describedby`；`.sheet { overflow: hidden }` 对 `position: fixed` 的后代目前无影响，但一旦 sheet 上加了 transform 就会困住弹层 | 用 `createPortal` 把 `.dialog-backdrop` 挂到 `body`；打开时给 `.app-frame` 设 `inert`（Chromium 支持），关闭移除；`.category-dialog { overscroll-behavior: contain; }`；`aria-describedby` 指向删除说明/字段帮助 | P2 | 中（结构移动影响样式与层叠） |
| A06 | `Library.tsx:365` | 整行 button 的 `aria-label="查看项目详情：owner/name"` 覆盖了行内全部可见信息（描述、分类、日期），读屏逐行只能听名字 | 扩充为「owner/name，收藏于 {日期}，分类 {分类名}，查看详情」；或去掉 `aria-label`，给按钮加 `aria-describedby` 指向摘要；`time` 同时补 `dateTime`（T05） | P2 | 低 |
| A07 | `base.css:154`；`InfoTip.tsx:11-20` | 22px 触发点向四周扩 11px 到 44px，可能覆盖相邻控件（如 field 标签与外部链接），hover 误开；点击穿透可能触发 tip | `inset: -6px`（34px，仍 ≥ 24 目标）或只在 `@media (pointer: coarse)` 用 44px；气泡若无交互内容加 `pointer-events: none`；保留 focus 打开与 Esc 关闭 | P2 | 低 |
| A08 | `base.css:165-167`；`src/ui/rare/animated-counter.tsx:316`；`src/ui/rare/gravity-letters.tsx`（matchMedia reduce 分支） | CSS 只塌缩 CSS 动画；`motion` 的 spring / RAF 物理不受 CSS 控制，三个 Rare 组件虽各自处理，但尚未验证；若计数外层再套 `role=status`，counter 内部 `sr-only` 文本 + live region 会双播 | 纳入验收：① 系统"减少动态效果"下切换主题/筛选，计数立即到位不滚动；② 重力字点按立即落位静止；③ 主题 ring 无过渡；④ **不要**给计数容器加 `aria-live`（组件自带 `sr-only`）；若要播报筛选结果，在 `.visually-hidden` 摘要里输出「共 N 个收藏」，用独立节点而非包裹计数器 | P1 | 低（验证项，不涉及代码改动） |

---

## 7. 代码质量

**现状判断。** `Library.tsx` 是单文件 380 行的巨石组件，包括 rail、标题、工具栏、筛选、ledger、三种空状态、分类弹窗、footer 全部内联；第 372 行的 footer 单行超过 600 字符；行内嵌套查找是 O(n×m)，叠加每行新建 `Intl`（T05）后，搜索键入路径有明显的重复计算。CSS 侧有少量死规则与 9 个未使用 token。

| ID | 位置 | 现状 / 缺口 | 可执行改法 | 优先级 | 风险 |
| --- | --- | --- | --- | --- | --- |
| Q01 | `Library.tsx:76-383`；最典型 `:352-357`、`:376` | 单文件 380 行；`350-353` 是六层嵌套三元；`372` 的 footer 单行 >600 字符；rail / head / toolbar / ledger / dialog 全在一个组件里 | 拆 `Rail`、`LibraryHead`、`Toolbar`、`Ledger`（内部再拆 `LedgerRow`、`LedgerEmpty`、`LibraryFooter`）、`CategoryDialog`；纯移动，保留现有 className 与 DOM 结构（CSS 不变）；先把 372 行 footer 抽成 `<LibraryFooter>` 降低 diff 风险 | P1 | 低（等价重构，typecheck + 截图验证） |
| Q02 | `Library.tsx:360-361`；`ProjectDetail` `:23-24` | 每行都做 `data.lists.filter(list => data.memberships.some(...))` 与 `data.tags.filter(tag => data.repositoryTags.some(...))`，40 行 × lists × memberships 的嵌套扫描；每次搜索键入全量重算 | `useMemo` 一次遍历建索引：`Map<repoId, List[]>`、`Map<repoId, Tag[]>`、`Map<id, List>`、`Map<id, Tag>`；`ProjectDetail` 复用同一索引；`filterRepositories` 的 `tagsByRepository` 已证明这个思路可行 | P1 | 低（等价替换，需核对详情页编者/分类展示不变） |
| Q03 | `library.css:160`；`Library.tsx:229,349`；`SettingsTabs.tsx:55`；`settings.css:7,217`；`library.css:187` | 死/空规则：`.mark-empty` 零引用；`.ledger-col`（`Library.tsx:349`）、`.rail-entry-main`（`:229`）、`.settings-tabs`（`SettingsTabs.tsx:55`）没有任何样式；`.settings-page` 在两个文件重复定义；旧主题卡删除后 `settings.css:217` 的 `.theme-choices` 也成了死规则（新 ThemeSelector 在手机端仍两列，见 M04） | 删除 `.mark-empty`、重复的 `.settings-page`、死的 `.theme-choices`；无样式类要么删掉 className 要么补样式；建议加一份"类名 → 规则"清单（grep 即可）防止继续堆积 | P2 | 低 |
| Q04 | `tokens.css:14,18,19,39` | 未使用 token：`--space-3xl/--space-4xl`、`--gutter/--gap-columns`、`--z-base/--z-sticky/--z-sticky-nav/--z-toast`、`--font-numeric`，共 9 个 0 引用 | 删除或启用：`--font-numeric` 最省事的用法是 `.num { font-variant-numeric: tabular-nums; font-family: var(--font-numeric); }`；z token 建议保留并在 §Q08 文档化；`--gutter/--gap-columns` 若不用就删 | P2 | 低 |
| Q05 | `Library.tsx:98,158,358`；`:125` | 魔法数：`Math.max(100, innerHeight - ... - 24)` 的 24 与 100；页长 40 在 `pages` 与 `slice` 两处重复；可聚焦选择器串是长字符串常量 | `const PAGE_SIZE = 40; const FILTER_PANEL_MIN = 100; const FILTER_PANEL_GAP = 24; const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href]';` 并在 `:96,123,156,354` 使用 | P2 | 低 |
| Q06 | `AppearanceSettings.tsx:52-74` | `readPalettes()` 在挂载时同步改 `documentElement.dataset` 4×（theme × mode = 8 次写）并读 `getComputedStyle`，强制样式重算 4 次；主题增加后线性增长；在 effect 里执行，首帧可能已绘制（极短闪） | 改为"隐藏 probe"法：渲染 4 个 `[data-theme][data-mode]` 的 0 尺寸容器，挂载后各读一次 `getComputedStyle`；或把 palette 常量移到 `theme.ts`（与 tokens.css 双源，需注释/校验）；本次建议 probe 法，不动 token 源 | P2 | 中（probe 容器的层叠作用域需仔细写，避免影响真实主题） |
| Q07 | `library.css:13-14,138,195,205`；`settings.css:8,153`；`library.css:92,181` | 硬编码尺寸分散：品牌 22px / svg 23px、ledger 列 36/180/88/112、详情右栏 272、分类选择 240、排序 156、分组选择 200、页面内边距 32/48；图标尺寸有 14 种（12/13/14/15/16/17/18/20/22/23/25/34/40/44） | `tokens.css` 增加：`--text-brand: 1.375rem; --brand-mark: 23px; --ledger-seal: 36px; --ledger-marks: 180px; --ledger-lang: 88px; --ledger-date: 112px; --detail-margin: 272px; --settings-index: 160px; --icon-inline: 12px; --icon-control: 16px; --icon-mode: 20px; --icon-empty: 40px;`；图标按 4 档收敛（17/18→16，13/14→12 或 16，23/25→24），`WorkspaceIcon` 尺寸统一由父级 CSS 控制 | P2 | 低（视觉需核对） |
| Q08 | `tokens.css:19`；`library.css:120,174,210`；`base.css:158` | z-index 有 9 个 token，实际只用了 5 个；`.info-tip-bubble`（z-tooltip 600）嵌在 `.filter-panel`（z-dropdown 100、`overflow-y: auto`）里会被裁剪/被 modal（400）覆盖，现状靠 `library.css:135` 局部改 `top/bottom` 规避——这是补丁信号 | 在 tokens.css 加一段层叠说明注释（base 1 / raised 10 / dropdown 100 / footer? / modal 400 / tooltip 600）；把 InfoTip 渲染进 portal 或用 `position: fixed` + 计算定位；未用 z token 删除；建议把 `.library-footer` 的 z-raised 纳入文档 | P2 | 低（portal 属于结构改动，可先只做注释） |

---

## 8. 优先级汇总

### 8.1 按维度 × 优先级统计

| 维度 | 条目数 | P0 | P1 | P2 |
| --- | --- | --- | --- | --- |
| 排版 | 8 | 0 | 3 | 5 |
| 色彩与表面 | 7 | 0 | 1 | 6 |
| 布局与节奏 | 8 | 0 | 2 | 6 |
| 交互状态 | 16 | 2 | 6 | 8 |
| 动效与 Rare UI | 9 | 0 | 5 | 4 |
| 可访问性 | 8 | 0 | 3 | 5 |
| 代码质量 | 8 | 0 | 2 | 6 |
| **合计** | **64** | **2** | **22** | **40** |

### 8.2 P0（本轮必须）

| ID | 一句话 | 位置 |
| --- | --- | --- |
| S01 | 设置面板保活，杜绝表单未保存内容丢失，同时修复悬空 `aria-controls` | `SettingsTabs.tsx:46-69`、`GitSettings.tsx:165-189`、`AiSettings.tsx` |
| S02 | `repositoryUrl` 支持 provider，Gitee 仓库不再打开 github.com | `src/library/library.ts:55-58`、`Library.tsx:23,34` |

### 8.3 P1（本轮/下一轮，按收益排序）

S04 → S05 → S06 → S16 → T01 → T02 → T05 → S10 → S03 → A01 → A02 → A08 → L01 → L06 → C06 → M01 → M02 → M03 → M04 → M05 → Q01 → Q02。

（S04/S05/S06/S16 与 S01/S02 同属"状态完整性"批次，建议一起做，共用一次回归；M01–M05 是 Rare UI 集成分支，建议独立提交；M09 已随 dark 变体完成大半，只剩桥接补全，归 P2。）

---

## 9. Top 10：最小改动高收益

| # | ID | 改动 | 位置 | 预计改动量 | 收益 |
| --- | --- | --- | --- | --- | --- |
| 1 | S01 | 四个设置面板改为全量挂载 + `hidden`；Git 子面板同样保留；`AiSettings` 延迟首次请求 | `SettingsTabs.tsx:46-69` 等 | ~25 行 | 消除"切标签丢输入"的数据丢失 + 修复 ARIA |
| 2 | S02 | `repositoryUrl(fullName, provider)`，补测试 | `library.ts:55-58`、`Library.tsx` | ~8 行 | 消除 Gitee 用户打开错误站点的 P0 错误 |
| 3 | T01 | `.ledger-row` 首行基线对齐（3–5 条 CSS） | `library.css:138-163` | ~5 行 | 直接兑现"every entry on one grid"的签名 |
| 4 | S04 | 骨架只在 `!data` 时替换；有数据时保留并 `aria-busy` + 降透明 | `Library.tsx:351` | ~3 行 | 消除分类保存/同步后的整页闪烁 |
| 5 | S05 | 有数据时刷新失败显示 notice-bar | `Library.tsx:350` | ~4 行 | 不再"静默展示旧快照" |
| 6 | S06 | `pages` 收敛 page（effect + 渲染兜底） | `Library.tsx:156,354` | ~3 行 | 修复空白 ledger 与 `3 / 2` 分页 |
| 7 | T02 | 计数降一级视觉权重（weight 500 / ink-2 / gap 4px） | `library.css:95-99` | ~4 行 | 标题重新成为唯一焦点（Hallmark 自评的 H 弱点） |
| 8 | S03 | `.icon-button`、`.settings-tab` 补 transform 过渡；rail-add/edit 补按压 | `base.css:50-58`、`settings.css:17,28` | ~4 行 | 全站点按手感一致（1px 压印） |
| 9 | A01 | 分类导航 `aria-pressed` → `aria-current="page"` | `Library.tsx:211,242` | ~2 行 | 读屏可获知当前分类（零视觉回归） |
| 10 | M01 + S16 | AnimatedCounter（已接入）收尾：搜索去抖 + `BOUNCE=0`、`duration=0.35`、`LINE=1.2`，并核对标题块基线 | `Library.tsx:305`、`library.css:97-98`、`rare/animated-counter.tsx:37,306` | ~20 行 | 让已接入的计数动效真正符合 calm，且搜索不再每键滚一次 |

> Top 10 之外，若只做一件事且允许中等改动：**M05 Folder 分组**。它把已经存在的单分类数据模型（`categories.ts:110-121`）显式化，是"文件夹"心智的真正落点，收益大于任何装饰动效。

---

## 10. 与 Tailwind / Rare UI 集成直接相关的建议（交接给 Lead）

| ID | 相关性 | 关键动作 |
| --- | --- | --- |
| M09 | Tailwind 桥接（已部分完成） | dark 变体已加（`tailwind.css:11`）；剩余 `@theme inline` 补全、导入顺序注释、`border-[var(--color-accent)]/60` 的 build 验证 |
| M01 | AnimatedCounter（已接入） | 收尾：S16 搜索去抖前置；`BOUNCE` 0、`duration` 0.35、`LINE` 1.2 做 calm 化；核对 36px→26px 的标题块高度；不要在计数外层再加 live region |
| M02 | AnimatedCounter 边界 | rail/footer/pager/同步计数保持静态；数字滚动只允许"筛选结果变化（去抖后）"这一种触发 |
| M03 | GravityLetters（已接入） | 收尾：限无账号首启；`items` 换中文单字；`maxGlyphs` 14–20；移动端高度 140；已同步空态改静态；reduced-motion 实测 |
| M04 | ThemeSelector（已接入） | 收尾：accent 标识（C02）；note 高度稳定；移动端单列；fieldset disabled 核对；radiogroup 与 legend 重名；focus ring build 验证 |
| M05 | Folder 分组（自研） | 复用现有 `dropProps` 与 `moveRepository` 单分类语义；当前页内分组；sticky 组头；分组切换无动画 |
| M06 | 主题切换过渡 | 一次性 class + 移除；只在用户改设置时；reduced-motion 不加 class |
| M08 | 组件选型纪律 | 只引入这 3 个 + 自研分组；不用 Rare 的循环/滚动驱动组件；motion 依赖只服务计数器 |
| Q07 | Tailwind/CSS 协作 | 新 token（图标档、列宽、页面内边距）建议直接加在 tokens.css，Rare 组件通过 `@theme inline` 消费；不要用 Tailwind 工具类去覆盖 unlayered 的项目 CSS（会被反压） |

**集成期的三条纪律**

1. **唯一调色板**：Rare 组件的中性硬编码只允许出现在其自身文件顶部常量与 `@theme inline` 桥接里，主界面颜色必须来自 tokens.css。
2. **唯一动效来源**：所有动效都要能追溯到 `design.md` 的 "calm, state only"；Rare 的弹簧/物理默认参数（`BOUNCE`、`duration`、`LINE`）是视觉参数，需要按本系统调低。
3. **不跑构建的验证边界**：本轮只读审计没有执行 `pnpm build` / `tsc`；M09/M04 的 Tailwind 行为（`dark:` 变体、opacity 对 CSS var 的 color-mix、container queries）必须在合并前用真实构建 + 双主题截图确认。

---

## 11. 验收清单（改完之后怎么确认没坏）

**截图**：1440×900 与 1280×800 各一套 × 4 调色板（folio/observatory × light/dark），加 375 宽一套；重点核对 T01 基线、L04 列宽、C02 样本网格、M03 空状态。

**键盘走查**：Tab 到 rail → 分类 → 工具栏 → 筛选（Esc 关闭、焦点回 summary）→ 行 → 详情（Esc/返回后焦点回行）→ 设置 tab（方向键/Home/End）→ 主题 radio → Git 子标签 → 模态框（Tab 循环、Esc、焦点恢复）。

**reduced-motion**：系统开启"减少动态效果"后，验证 §A08 的 4 条；计数、重力字、主题 ring、主题切换过渡全部应"直接到位"。

**对比度**：本文 §2 表已给实测值；改 token 后重跑同一脚本（oklch → sRGB → WCAG）确认 muted ≥ 4.5、accent-ink/accent ≥ 4.5、rule-2 仍 < 3（继续只做 hairline）。

**状态矩阵**：loading / empty（无账号）/ empty（已同步但无收藏）/ 无匹配 / 读取失败（无数据）/ 刷新失败（有数据）/ 同步运行 / 同步失败 / 取消同步 / 多账号切换 / Gitee 账号打开仓库 —— 每个状态只允许一个 live region、一个主操作、无布局跳变。

**Rare UI 三件套（本工作树已接入，按 §5.2 收尾）**：① 主题选择在 4 套调色板 × 2 模式下检查 ring / label / 预览是否跟随强制模式（不是 OS 模式）；② 计数在系统"减少动态效果"下直接到位、搜索去抖后每轮筛选只滚一次、标题块基线不因 36px 数字高度而错位；③ 重力字只在无账号首启出现一次点击即停、移动端高度 ≤140px、不自动撒字。
