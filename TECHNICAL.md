# Home Learning Hub - 技术文档

> 本文档给工程实现与 AI 编程助手使用。它回答“系统现在怎么做、数据在哪里、改代码时不能碰哪些边界”。产品体验、商业逻辑、徽章与奖励规则请看 `Whitepaper.md`。

## 1. 当前技术结论

- 前端只使用 HTML5 + Vanilla JavaScript + CSS3。
- 不使用 React、Vue、Next、Webpack、Vite 等重型框架或构建工具。
- 后端使用 Supabase：PostgreSQL、Auth、RLS、RPC，未来可用 Storage 和 Edge Functions。
- 孩子学习端必须轻、快、少阻塞。
- 敏感写入必须走 RPC / Edge Function / SQL transaction，不能在前端直接改账本或余额。
- B1 代码已在本地准备，但用户尚未在 Supabase 执行 `009_b1_kid_profile_sync.sql`，因此 B1 不应视为线上已完成。

## 2. 文档分工

| 文档 | 用途 |
|------|------|
| `README.md` | 项目入口与文档导航 |
| `Whitepaper.md` | 产品/设计事实来源：核心功能、商业逻辑、界面、徽章、商店、奖励规则 |
| `TECHNICAL.md` | 工程事实来源：架构、数据存储、迁移、RPC、实现状态 |
| `PROGRESS.md` | 迭代日志与下一步任务 |
| `.cursorrules` | AI 执行规则与安全边界 |

如果文档冲突：

1. 产品规则以 `Whitepaper.md` 为准。
2. 技术实现以 `TECHNICAL.md` 和 `.cursorrules` 为准。
3. 当前进度以 `PROGRESS.md` 为准。

## 3. 界面与 i18n

- 词典：`common/js/i18n.js`，`en` / `zh` 两套；**不要求每个功能 PR 同时补双语**。
- **运行时语言**（注册后存云端）：
  - `profiles.ui_lang`（kid）：该孩子学生端界面语言，`en` | `zh`。
  - `parent_settings.parent_ui_lang` 或家长 `profiles` 扩展字段：家长端全局界面语言。
- 启动时：`AppI18n.setLang(...)` 读当前孩子或家长设置；切换孩子时刷新学生端语言。
- **开发节奏：** 新功能英文优先；中文通过**一次性 i18n 专项**补全 `zh` 词典，而非按屏增量。

## 3.1 注册后同步策略（相对 Google Sheet）

| 时期 | 问题 | 做法 |
|------|------|------|
| Google Sheet 时代 | 本地缓存与 Sheet 不一致 | 每次打开强制同步 + 手动同步按钮 |
| Supabase 目标 | 换机一致、无滞后感 | 云端权威；打开/切孩时 pull；写操作走 RPC 后立即以响应为准更新 UI |

实现要点：

- 注册后**禁止**把 `gold_coins_vault`、`crystals_*`、`limit_*` 当作真相；仅游客模式可写本地。
- 登录或进入 hub：`fetchFamilySnapshot()` / per-profile summary（余额、徽章 counters、今日 completions、pending redemptions）。
- 练习结算、兑换、家长调账：RPC 返回新余额与状态 → 更新内存与可选短时缓存；失败则 UI 不回滚假成功。
- 可选「刷新」按钮调用同一 pull；正常用户不应依赖它才能看到正确数字。
- 后续可选用 Supabase Realtime 订阅家庭钱包/兑换状态；MVP 用 pull-on-focus 即可。

## 3.2 PDPA / 儿童数据保护基线

本项目面向小学儿童，儿童个人数据按敏感数据处理。实现时按以下基线执行：

### 成人账号与未成年人邮箱注册防范

- **只有家长 / 监护人可以注册 Supabase Auth 账号。** 孩子没有邮箱账号、密码账号或社交登录账号。
- 学生端不展示注册入口；所有注册入口只在 `parent/` 路径下。
- 注册页必须有成人确认：`I am the parent/guardian creating this account for my family.` 未勾选不得创建账号。
- 如注册流程询问年龄或用户主动表明未满 18 岁，立即停止注册并显示“请家长 / 监护人完成注册”。
- 不建议为了防未成年人注册而强制收集家长出生日期；优先使用成人确认、家长 PIN、邮件验证、隐私声明版本记录和后续付款/订阅信息作为成人账号控制。
- 后端 `register_family` / 首次建档 RPC 必须校验 `adult_attestation = true` 和 `privacy_notice_version`，并写入 `consent_records`。仅前端 checkbox 不足以作为唯一控制。
- `auth.users` 只代表家长账号；孩子只是 `profiles.role='kid'` 的档案记录，不能直接登录 Supabase。

### 数据最小化

- 孩子显示名使用昵称字段（如 `nickname` / `display_name`），产品文案不鼓励真实姓名。
- 学校名、性别为可选；不作为必填、不用于名人堂、不进入公开展示。
- MVP 暂不允许上传真人头像；仅使用系统默认头像 ID。未来如开放头像上传，必须另走图片压缩、删除、家长同意和 Storage 保留策略。
- 不收集 NRIC / FIN / 护照号、住址、电话号码、实时地理位置、班级、小队、座号。

### 保留与删除

建议在 010 中加入：

| 表 / 配置 | 用途 |
|-----------|------|
| `consent_records` | 家长同意记录：同意版本、范围、时间、成人确认、隐私声明版本 |
| `privacy_requests` | 家长导出、更正、删除、撤回同意请求 |
| `data_deletion_jobs` | 删除孩子档案 / 家庭账号后的异步清理任务 |
| `data_retention_policies` | 各类数据保留期限配置，便于后续调整 |

默认保留策略：

| 数据类型 | 默认期限 | 技术处理 |
|----------|----------|----------|
| 游客本机数据 | 30 天 | `localStorage` 元数据过期提示；清缓存即丢 |
| 学习明细 / 答题记录 / 错题状态 | 24 个月滚动 | 超期明细删除或匿名化，仅保留趋势汇总 |
| 学习报告 PDF / 报告缓存 | 7 天 | Storage signed URL 短期有效，定时清理 |
| OCR 原始图片 / PDF | 识别完成并确认后最多 30 天 | 原始文件删除，结构化条目按孩子内容保留 |
| OCR 候选结果 | 30 天 | 确认 / 拒绝 / 过期后清理 |
| 家长反馈 | 24 个月 | resolved 后可匿名化；敏感信息优先清理 |
| 审计 / 安全日志 | 24 个月 | 仅安全、排错、防滥用用途 |
| 支付 / 订阅摘要 | 按付款、税务、争议处理需要 | 不保留孩子学习细节 |

删除流程：

- 删除孩子档案：删除或匿名化该 `profile_id` 相关学习、错题、徽章、钱包、兑换、上传内容、报告缓存。
- 删除家庭账号：所有 child profiles 和 family-scoped 数据进入删除队列。
- 删除请求不应依赖前端循环删表；必须写 `data_deletion_jobs`，由服务端 RPC / Edge Function 执行。
- 已删除对象应在 UI 隐藏；必要时用 `deleted_at` 软删短暂排队，任务完成后硬删或匿名化。

### AI / OCR / 第三方

- OCR / AI 上传默认只用于家长确认后的该孩子内容，不进入公共题库，不用于训练。
- Edge Function 调用第三方 AI/OCR 时必须记录 provider、purpose、request_id、是否发送原图、保留策略。
- 第三方服务清单应能从配置生成，后续隐私政策可引用。

## 4. 代码目录

```text
HomeLearningHub/
├── common/js/
│   ├── auth.js                 # AUTH 会话、本机 kid profiles、PIN 门状态、B1 云端同步方法
│   ├── i18n.js                 # 双语文案
│   ├── profile-catalog.js      # 头像库、CL/HCL 标签
│   └── supabase-client.js      # Supabase client 初始化
├── parent/
│   ├── index.html / index.js   # 家长注册、登录、忘记密码、重置密码
│   ├── pin.html / pin.js       # 家长 PIN 门
│   ├── dashboard.html / dashboard.js
│   └── parent.css
├── student/
│   ├── index.html / index.js / index.css
│   ├── practice.html / practice.js
│   └── shop.html / shop.js / shop.css
├── game/                       # 目标生产目录：奖励游戏分发台与小游戏
├── supabase/migrations/
├── _legacy_backup/
├── Whitepaper.md
├── TECHNICAL.md
└── PROGRESS.md
```

当前注意：

- 生产 `student/` 目录目前主要是首页、基础练习、商店。
- `spelling`、`wordsearch`、`tingxie`、`pinyinshooter`、`radical`、奖励游戏分发台和小游戏目前仍有相当部分在 `_legacy_backup/` 中，学生首页也还链接到部分 legacy 页面。
- 后续需要把可用页面迁移到稳定生产路径，目标结构建议如下：

```text
student/
├── index.html
├── practice.html
├── shop.html
├── spelling.html
├── wordsearch.html
├── tingxie.html
├── pinyinshooter.html
└── radical.html

game/
├── index.html          # 奖励游戏分发台
├── popballoon.html
└── catcher.html
```

## 5. 本地存储现状

### 5.1 孩子档案

本地孩子档案存在 `localStorage.kid_profiles`。

每个孩子目前包含：

| 字段 | 含义 |
|------|------|
| `name` | 旧字段；目标语义改为孩子昵称，不鼓励真实姓名 |
| `grade` | 年级，如 `P1` - `P6` |
| `avatarId` | 系统默认头像库 ID；MVP 暂不允许上传真人头像 |
| `gender` | `M` / `F`，可选，不公开展示 |
| `schoolName` | 学校自由文本，可选；暂不做同校功能，不进入名人堂 |
| `chineseLevel` | `CL` / `HCL`，未来可扩 `FCL` |
| `cloudId` | 云端 `profiles.id`，B1 导入或云端建档后才有 |
| `uiLang` | 孩子界面语言 `en` / `zh`（注册后存 `profiles.ui_lang`） |
| `subjectScopeMode` | 每科出题范围模式 `selected_scope` / `full_grade`（注册后按科目存 `profile_subject_settings.scope_mode`，见 §6.4.1） |

当前选中的孩子使用：

- `currentPlayer`
- `currentGrade`
- `active_kid_profile_id`

`active_kid_profile_id` 是后续错题本、余额、学习记录上云的关键。

### 5.2 学习数据

学习数据目前仍主要在本机，按孩子名或全局 key 分散存储。

| 数据 | 典型 key |
|------|----------|
| 打卡天数 | `total_days_${name}` |
| 当前连击 | `current_streak_${name}` |
| 最后打卡日期 | `last_date_${name}` / `last_checkin_date_${name}` |
| 水晶 | `crystals_${name}` |
| 金币 | `gold_coins_vault`（旧本地 key；目标迁移到孩子档案名下） |
| 练习统计 | `practice_stats_${name}_...` |
| 每日限制 | `limit_${date}_${name}_${subject}` |
| 错题本 | `hub_mistakes` |
| 徽章记录 | 当前分散在 `practice_stats_*`、`pinyin_badge_count_*`、`tingxie_badge_count_*`、`easter_*` 等 key |

注意：当前旧本地金币 key 是全局 `gold_coins_vault`，但目标架构中金币应迁移到孩子档案名下，避免多孩家庭身份混淆和刷低年级题骗奖励。

### 5.3 游客模式 vs 注册后（数据生命周期）

| 阶段 | 主键 | 存储 | 丢失场景 |
|------|------|------|----------|
| 游客（未注册家庭） | 孩子**名字**（`currentPlayer`） | 仅 `localStorage` | 换设备、清缓存、改名、超过本地保留期 |
| 已注册家庭 | **`profile_id`** | **云端唯一权威** + 本机只读缓存 | 换设备登录后应与旧设备一致；不得用本地 key 当真相 |

产品规则（已定）：

- 注册前允许完整游玩；徽章、金币、水晶、打卡、练习统计、本地错题均挂在**本机 + 孩子名**下。
- 本机聚合数据建议 **30 天滚动保留**；UI 提醒孩子请家长注册以永久保存。
- 家长注册并首次导入时：按名字（或家长确认映射）把本机数据 **一次性上云**，不是注册即清空。
- 注册后：新数据一律写 `profile_id`；云端错题只用 `question_id`。
- **注册后所有资产与状态必须上云**（强制）：余额、流水、徽章、打卡连击、错题、ticket、兑换单、**每日每科练习是否已完成**等。新设备不得依赖本机 `localStorage` 恢复真相。
- 已知缺陷：`student/practice.js` 用 `limit_${date}_${name}_${subject}` 存本地每日限制，换机可绕过；目标改为云端表（如 `daily_subject_completions`：`profile_id + subject + practice_date_sgt` 唯一）+ RPC 判定。
- 注册前本地可以没有错题记录；`practice.js` 仍用 C 题把 15 题填满。
- 注册前改名/清缓存导致的数据丢失**不修复**；注册后改名只改 `display_name`，不换 `profile_id`。

首次导入上云（注册转化）至少包括：

- `profile_badge_counters` / `badge_events`（来自分散的 badge localStorage）
- `profile_wallets` + 期初 `wallet_ledger` 条目（孩子档案名下金币、个人水晶）
- `student_mistakes_book`（本地题干需匹配 `questions.id` 后写入）
- `learning_sessions` 摘要（若本机有练习统计可还原）
- 连击、打卡天数写入孩子档案或专用 streak 表

技术表建议：`local_guest_retention` 可用 `localStorage` 元数据记录 `first_seen_at` / `last_active_at`，满 30 天提示；不必单独建库直到注册。

### 5.4 Legacy 活动 Log 与 Supabase 落点（家长界面已简化）

Legacy 家长 Log 曾包含 `coin_update`、`badge`、`redemption`、`refund` 等逐条记录。迁移到 Supabase 后：

| 事件 | 存储（系统层） | 家长是否看到 |
|------|----------------|--------------|
| 练习赚币、徽章 | `wallet_ledger`、`badge_events` | **否**（仅学习报告**汇总**） |
| 兑换 / 退款 | `reward_redemptions` + `wallet_ledger` | **是**（兑换记录列表） |
| 家长手动调账 | MVP 暂不开放 | 后期如开放，必须走 RPC + `wallet_ledger` + 必填备注 |

- **`wallet_ledger`**：全量流水，对账与防作弊，**不对家长默认展示**。
- **`reward_redemptions`**：家长主界面财务相关唯一列表（待审批、已批准、已拒绝、已退款）。
- **`learning_reports` / 周报聚合**：从 `learning_sessions`、`badge_events`、ledger 汇总“某段时间练习次数、徽章数、金币/水晶净增、典型错题和错误答案”，替代逐条奖励 Log。
- 家长可一键保存学习报告为 PDF；系统内生成的报告缓存 / PDF 文件只保留最近 7 天，避免后台长期堆积。底层结构化学习数据仍按产品与合规需要保留，用于后续报告重新生成和趋势分析。
- 可不建面向家长的 `audit_logs` 全量镜像；若需运维排查，再建内部审计表。

新代码：所有资产变动先 **RPC 写 ledger + 业务表**；家长 UI 只订阅兑换状态与报告聚合，避免回到“本地先改数再同步 Sheet”的模式。

### 5.5 账本、防作弊与手动调整边界

**账本（`wallet_ledger`）给谁用？**

- 主要用途：**系统对账、防双花、运维排查**；**不是**家长日常浏览界面。
- 家长看 **兑换记录** + **学习报告汇总** 即可。
- 每条记录：`family_id` 或 `profile_id`、`amount`、`currency`（gold/crystal）、`reason_code`、`reference_type`、`reference_id`、`created_by`（system / parent / rpc）。

**能否靠严格代码防作弊？**

- 可以防：**前端直改余额、重复提交兑换、无 ticket 进奖励游戏、绕过 RPC 写库** 等。
- 不能单靠代码防：**孩子乱填、家长不管的“学习质量”**；经济最终由**家长审批兑换**兜底。
- 所有 earning/spend 应服务端判定（练习完成、徽章规则、ticket 发放），客户端只展示结果。

**家长手动调整（MVP 暂不开放）：**

- MVP 阶段不提供家长手动增加/扣减金币或水晶，避免资产规则过早复杂化。
- 后期如果开放，必须作为高级功能实现：仅家长可调用、必须走 RPC、必须写 `wallet_ledger`、必须填写备注。
- 与“平台外任务”（做家务、早睡）连接方式：优先作为**非实物奖励**或家庭约定呈现，不把生活打卡做成与学习会话同级的自动判分，避免 scope creep 和隐私争议。

注册后同步要求（补充）：

- 本机徽章、打卡、金币、水晶、错题本、练习统计在**首次导入**时迁移；之后增量同步云端。
- 迁移前按**孩子昵称 → `profile_id`** 映射；注册后禁止再依赖昵称作为主键。

## 6. 题库与错题本

### 6.1 题库

题库来自 Supabase `public.questions`。

关键字段：

| 字段 | 用途 |
|------|------|
| `id` | 题目 UUID |
| `grade` | 年级 |
| `subject` | 学科 |
| `topic` | 章节 |
| `question_text` | 题干 |
| `options` | 选择题选项，当前用 `|` 分隔 |
| `correct_answer` | 正确答案 |
| `term` | 学期，可为空 |
| `lesson` | 华文第几课，可为空 |
| `scope_code` | 可选，用于精确控制教学范围 |

`student/practice.js` 会按 `subject + grade` 从云端拉题，并在同一浏览器会话中缓存到 `sessionStorage.q_cache_*`。

重要：未来不能只按 `subject + grade` 出题。P3 一开学时不能抽完整 P3 全年题。需要增加“已学范围”过滤。

推荐题库维度：

- `subject`
- `grade`
- `term`
- `week_from` / `week_to`，用于和 `Term X Week Y` 对齐
- `topic`，适合 English / Math / Science
- `lesson`，适合华文课文
- `difficulty`
- `is_active`

当前不一定要立刻把所有字段写入数据库，但下一轮重建题库表时应按这个方向设计。

### 6.2 当前本地错题本

当前错题本存在 `localStorage.hub_mistakes`。

当前 key 规则：

```js
`${subject}_${user}_${question.trim()}`
```

问题：

- 现在按题干识别，不按 `question_id`。
- 如果题干被修改，本地错题可能失去匹配。
- B2 上云时必须做题干到 `questions.id` 的映射，或先改成本地也记录 `_id`。

### 6.3 目标云端错题本

目标表：`public.student_mistakes_book`

推荐字段：

| 字段 | 用途 |
|------|------|
| `id` | UUID |
| `profile_id` | 孩子 `profiles.id` |
| `question_id` | 题目 `questions.id` |
| `weight` | 错题权重 |
| `wrong_answer_history` | 错误答案历史，建议 JSONB |
| `last_wrong_at` | 最近答错时间 |
| `last_correct_at` | 最近答对时间 |
| `updated_at` | 更新时间 |

约束：

- `(profile_id, question_id)` 必须唯一。
- 前端不直接 update；通过 RPC 调整权重。
- 一个 session 内同一道题最多增加一次权重。
- 每次答错应记录本次错误答案、标准答案、时间、session id。
- 错误答案历史不在孩子端作为独立错题本展示；孩子只是在练习中抽到错题并把它做对。错误答案历史用于家长学习报告、典型错误分析和后续 AI 分析。

### 6.4 学期与学习范围

首页展示需要 `Term X Week Y`。

实现建议：

- 先在前端用新加坡本地小学学期日历计算当前 term/week。
- 中长期可以建 `school_calendar` 表，支持不同年份、假期、学校差异。
- 假期充电徽章需要知道“当前日期是否在小学假期”。

推荐表：

| 表 | 用途 |
|----|------|
| `school_calendar` | 年份、term、week、起止日期、是否假期 |
| `subject_topics` | English/Math/Science topic 目录 |
| `chinese_lessons` | 华文课文/第几课目录 |
| `profile_learning_scope` | 每个孩子当前已点选哪些 topic/chapter/lesson |
| `profile_subject_settings` | 每个孩子每科设置：范围模式、基础正确率、目标正确率、目标完成时间 |

`profile_learning_scope` 应由家长后台维护，也可以允许孩子在入口处选择"我学到这里了"，但最终应由家长确认或覆盖。

出题时：

- C 题只从已学 topic/lesson 里抽。
- A 错题只从当前可复习范围内抽，或明确标为"历史错题复习"。
- B 题从低一年级可复习范围抽。
- 临近期末、假期复习可有独立模式，另行设计。

#### 6.4.1 各科范围模式与达标阈值（每孩独立）

所有科目支持每孩每科可选的两种出题范围模式（产品规则见 Whitepaper §4.2.1.1）：

| 字段 | 取值 | 默认 | 含义 |
|------|------|------|------|
| `profile_subject_settings.scope_mode` | `'selected_scope'` / `'full_grade'` | `'selected_scope'` | 该孩子该科 C 题抽取范围 |
| `profile_subject_settings.base_accuracy_pct` | integer | 待定 | 获得科目徽章的基础正确率 |
| `profile_subject_settings.target_accuracy_pct` | integer | 待定 | 获得额外技能徽章的目标正确率 |
| `profile_subject_settings.target_time_seconds` | integer | 待定 | 获得速度类额外徽章的目标完成时间 |

实现要点：

- 在 `record_learning_session` / 出题 RPC（或 `practice.js` 拉题逻辑）里：
- 按 `profile_id + subject` 读取 `profile_subject_settings`。
- `selected_scope` 模式：C 题 `WHERE grade = profile.grade AND topic/chapter/lesson IN (profile_learning_scope entries for this subject) AND is_active`。
- `full_grade` 模式：C 题 `WHERE grade = profile.grade AND subject = ? AND is_active`，忽略 `profile_learning_scope`。
- A 错题、B 降维复习抽取规则**不受**此开关影响。
- 仅家长后台 RPC 可改这些设置，写入需家长 PIN 已通过。

## 7. 练习模块技术规则

标准练习一场 15 题：

- A：错题，错题数 > 30 时抽 5，否则抽 3。
- B：低一年级复习题，固定 2。
- C：当前年级新题，补足 15。

必须修正：

- 每日限制不能在进入页面时写入。
- 必须在最后一题完成并结算后，才写入 `limit_${date}_${name}_${subject}`。
- 中途退出不应锁死当天。
- 错题加权必须以 session 为边界防重复。
- **答案对比前必须先做字符归一化**，否则会把对的判错（见 §15.1）。

标准练习完成后应写入 `learning_sessions`：

- `profile_id`
- `subject`
- `grade`
- `term`
- `week`
- `started_at`
- `completed_at`
- `duration_seconds`
- `total_questions`
- `correct_count`
- `accuracy`
- `earned_badges`
- `earned_tickets`
- `mistakes_added`
- `mistakes_cleared`

奖励结算规则：

- 达到该孩子该科 `base_accuracy_pct`：获得 1 枚科目徽章；**1 徽章 = 1 金币**，同步在孩子档案名下记 1 个金币并写 `wallet_ledger`。
- 达到 `target_accuracy_pct`：可获得额外技能徽章。
- 达到 `target_accuracy_pct` 且 `duration_seconds <= target_time_seconds`：可获得速度类额外徽章。
- 当天至少获得 1 枚徽章后，才可解锁当天打卡水晶；水晶仍按每孩每日最多 1 颗限制。

每题答题记录写入 `question_attempts`：

- `session_id`
- `question_id`
- `profile_id`
- `answer_given`
- `is_correct`
- `time_spent_seconds`
- `attempt_order`

这两张表是家长后台核心数据、每周报告、家长查看错题细节和 AI 分析的基础。

## 8. 家长 Auth 与 PIN

已实现：

- 家长注册 / 登录 / 忘记密码 / 重置密码。
- 家长 PIN 门。
- 离开 dashboard 后撤销 `parent_pin_ok`。

账号边界：

- Supabase Auth 账号只给家长 / 监护人使用；孩子档案不是可登录用户。
- `parent/index.html` 注册必须显示成人确认 checkbox；后端 RPC 写入 `consent_records` 后才创建 / 激活家庭。
- 如果用户声明未满 18 岁或未勾选成人确认，不得继续创建家庭账号。
- 学生端不得出现邮箱注册、登录、社交登录按钮；孩子只通过家长创建的 profile 进入。

安全规则：

- `parent_pin` 永远不能返回给前端。
- PIN 设置与验证必须走 RPC。
- 前端 5 次错误后必须锁定；后端也应有节流或审计。

关键 RPC：

- `set_parent_pin(raw_pin)`
- `verify_parent_pin(raw_pin)`
- `check_pin_exists()`
- `set_kid_pin(kid_profile_id, raw_pin)` — 设置/修改 3 位孩子身份 PIN；调用前需家长 PIN 已通过
- `verify_kid_pin(kid_profile_id, raw_pin)` — 学生端切换孩子时校验
- `disable_kid_pin(kid_profile_id)` — 家长后台一键关闭
- `reset_kid_pin(kid_profile_id, new_pin)` — 孩子忘记时家长重置（同样需家长 PIN 已通过）

孩子身份 PIN 字段（写入 `profiles` 或独立小表）：

- `kid_pin_enabled` (bool)
- `kid_pin_hash` (text, SHA-256)
- `kid_pin_fail_count` (int) / `kid_pin_lock_until` (timestamptz) 或复用现有 PIN 节流模式

规则：

- 3 位数仅作家庭内部软门；威胁模型不含外部黑客。
- 客户端 5 次错误 → 30 秒指数退避；服务端 RPC 必须同样节流。
- `kid_pin_hash` 永不返回前端；前端只拿 `kid_pin_enabled` 决定是否弹窗。
- 孩子端不可调用 `set_kid_pin` / `reset_kid_pin` / `disable_kid_pin`，仅家长会话可。

当前推荐迁移顺序：

```text
003_profiles_upgrade_columns.sql
004_parent_auth_rpcs.sql
005_fix_profiles_username.sql
007_pin_builtin_sha256.sql
008_profile_kid_fields.sql
```

`006_fix_digest_pgcrypto.sql` 是历史尝试，不作为当前推荐路径。

## 9. B1：孩子档案云端同步

### 8.1 当前状态

B1 代码已经写入本地工作区，但用户尚未执行 Supabase 迁移。

未执行前：

- 家长 Dashboard 调用新 RPC 可能失败。
- 不能认为云端同步已可用。

需要执行：

```text
supabase/migrations/009_b1_kid_profile_sync.sql
```

### 8.2 目标行为

家长登录并进入 Dashboard 后：

1. 拉取云端孩子列表。
2. 合并到本机 `kid_profiles`。
3. 如果发现本机孩子没有 `cloudId`，弹窗询问是否导入到家庭账号。
4. 导入成功后，给本机档案写入 `cloudId`。
5. 学生端选择孩子时，把 `cloudId` 写入 `active_kid_profile_id`。

### 8.3 RPC

`create_kid_profile(...)`：

- 创建或更新孩子云端档案。
- 同名孩子按 parent + display name 幂等处理。
- 最多 3 个孩子。

`list_kid_profiles()`：

- 返回当前家长名下孩子档案 JSON。

### 8.4 B1 风险

- 现在本地学习数据仍按孩子名存，不会因为 `cloudId` 自动迁移。
- 如果孩子改名，旧本地学习数据可能找不到。
- 后续 B2 应逐步把学习数据迁移到 `profile_id`。

## 10. 商店与资产安全

当前商店仍偏本地/占位。

目标规则：

- 金币记在孩子档案名下，用于兑换实物奖励；每获得 1 枚徽章同步获得 1 个金币。
- 水晶是孩子个人资产。
- 前端禁止直接改云端余额。
- 商品兑换必须走 RPC 或 Edge Function。
- 必须有 `coin_ledger` / 审计记录。
- 兑换后进入家长后台审批，不需要兑换码。
- 退款/撤销应由家长后台处理，不应由孩子自己在背包里处理。

未来核心表：

- `reward_catalog`
- `reward_redemptions`
- `coin_ledger`
- `crystal_ledger` 或统一 ledger

### 10.1 徽章与本机同步

徽章需要从分散 localStorage 迁移为结构化云端记录。

推荐表：

| 表 | 用途 |
|----|------|
| `badge_definitions` | 徽章定义：科目、技能、隐藏、连击、稀有度、图标 |
| `profile_badge_counters` | 每个孩子每种徽章的累计数量和最高连击展示状态 |
| `badge_events` | 每次获得徽章的事件日志，用于报告和防重复 |

规则：

- 科目徽章每日最多一枚，需要唯一约束或 RPC 防重复。
- 隐藏徽章未获得前不显示占位。
- 连击徽章需要记录当前连击、历史最高连击、当前展示窗口。
- 注册后首次同步时，应把本机徽章记录转换为云端 `badge_events` 或 counters。

## 11. 奖励游戏技术边界

奖励游戏是受控解压区。

技术要求：

- 没有公开入口。
- 只能从合规流程跳转进入。
- 进入前检查 ticket。
- 直接访问 URL 必须踢回。
- 游戏结束后自动回到学生主页。
- 游戏分发台随机分配 `popballoon`、`catcher` 等游戏。

ticket 规则目标：

- 达到基础正确率的正式练习发 1 张 ticket。
- 2 张 ticket 玩 1 次奖励游戏。
- 奖励游戏时长定位为 2-3 分钟短暂放松。
- ticket 消耗应进入可审计记录，避免刷新重复消耗或绕过。

## 12. 图片、OCR 与上传

头像上传未来规则：

- 前端 Canvas 压缩。
- 200x200。
- 最大 50KB。
- JPEG 或 WebP。

OCR 上传场景：

- 英文 spelling 听写表。
- 华文听写表。
- 错题材料。

当前限制：

- 发音引擎效果不好，spelling 和听写相关功能不可视为成熟。
- OCR 上传流程需要后续重新设计，包括识别、人工确认、保存、生成练习内容。

目标 OCR + AI 流程：

1. 家长拍照或上传图片/PDF。
2. 前端压缩图片并上传到 Supabase Storage。
3. 后端 Edge Function 调用大模型 AI / OCR 服务。
4. AI 按固定模板输出结构化 JSON。
5. 家长在后台确认、编辑、删除识别结果。
6. 家长点击提交后，才写入正式题库、听写表或错题导入表。

不能让 AI 识别结果直接进入孩子练习题库，必须经过家长确认。

推荐表：

| 表 | 用途 |
|----|------|
| `ocr_uploads` | 上传文件、来源、状态、家长、孩子 |
| `ocr_extracted_items` | AI 识别出来的候选词/题/错题 |
| `default_spelling_lists` | **系统默认英文听写表**（按 `grade + term + week`），所有家庭可读不可写；家长不上传时学生端使用 |
| `default_tingxie_lists` | **系统默认华文听写表**（按 `grade + term + week + lesson`），所有家庭可读不可写 |
| `custom_spelling_lists` | 家长确认后的英文听写表（仅本孩 `profile_id` 可见，与默认表合并出题） |
| `custom_tingxie_lists` | 家长确认后的华文听写表（仅本孩 `profile_id` 可见，与默认表合并出题） |
| `parent_imported_questions` | 家长确认后的自定义题/错题材料（仅本孩 `profile_id` 可见） |

听写出题合并规则（写在 RPC 或 `practice.js` 听写拉题函数）：

1. 先读该孩子年级 + 当前 Term/Week 范围内的 `custom_*_lists` 条目；
2. 若 `custom_*_lists` 为空或不足，回退到 `default_*_lists`；
3. 家长可在后台勾选「优先使用我上传的 / 与默认表合并 / 仅使用默认表」三档（字段建议挂 `profile_settings` 或 `profiles.dictation_source_mode`，默认「优先使用我上传的，否则用默认」）。

AI 输出模板必须版本化，例如 `template_version`，避免后续提示词变更导致旧数据无法解释。

## 13. 目标数据库设计草案

如果当前表结构继续阻碍开发，可以考虑清空测试环境并重建。生产环境必须先备份，不能直接清空。

建议核心表：

| 表 | 用途 |
|----|------|
| `families` | 家庭账号，承载账户类别与订阅；`account_type=single_child/multi_child`，`plan_tier=basic/premium` |
| `profiles` | 家长与孩子档案，`role=parent/kid`；孩子使用昵称，含 `ui_lang`、`kid_pin_enabled`、`kid_pin_hash`、可选 `school_name` / `gender`、`deleted_at` |
| `parent_settings` | 家长配置：`parent_ui_lang`、奖励游戏规则等家庭级设置 |
| `profile_subject_settings` | 每孩每科配置：范围模式、基础正确率、目标正确率、目标完成时间 |
| `learning_reports` | 周报汇总/报告缓存（练习数、徽章、资产净增、时长、典型错题与错误答案；生成文件保留 7 天，可重新生成） |
| `questions` | 标准题库 |
| `subject_topics` | 学科 topic 目录 |
| `chinese_lessons` | 华文课文/lesson 目录 |
| `profile_learning_scope` | 家长为孩子点选的每科 topic/chapter/lesson 范围 |
| `school_calendar` | Term/Week/假期日历 |
| `learning_sessions` | 单次练习宏观记录 |
| `daily_subject_completions` | 注册后每日每科是否已完成（防换机绕过） |
| `question_attempts` | 每题答题明细 |
| `student_mistakes_book` | 当前错题状态 |
| `mistake_answer_history` | 错误答案历史，或并入 JSONB |
| `badge_definitions` | 徽章定义 |
| `profile_badge_counters` | 徽章累计与展示状态 |
| `badge_events` | 徽章获得事件 |
| `profile_wallets` | 孩子档案名下金币与个人水晶 |
| `wallet_ledger` | 金币/水晶流水 |
| `reward_catalog` | 家长奖励商品 |
| `reward_redemptions` | 兑换申请与审批 |
| `game_tickets` | 奖励游戏 ticket |
| `game_sessions` | 奖励游戏游玩记录 |
| `ocr_uploads` | OCR 上传任务 |
| `ocr_extracted_items` | AI 识别候选项 |
| `default_spelling_lists` | **系统**英文默认听写表（不上传也能用） |
| `default_tingxie_lists` | **系统**华文默认听写表 |
| `custom_spelling_lists` | 家长自定义英文听写表（仅本孩） |
| `custom_tingxie_lists` | 家长自定义华文听写表（仅本孩） |
| `parent_imported_questions` | 家长上传错题/自定义题；**RLS 仅本 kid `profile_id` 可见**（§Whitepaper 4.2.2） |
| `referrals` / `subscription_entitlements` | 邀请裂变、试用与赠送时长上限 90 天；entitlement 需区分一孩/多孩与基础/高级 |
| `profile_badge_levels` / `badge_level_config` | 等级、段位、升级消耗徽章/水晶 |
| `leaderboard_entries`（或视图） | 匿名名人堂；脱敏 ID、无学校、按段位分组 |
| `parent_feedback` | 家长反馈与建议：题目错误、功能问题、体验建议、奖励建议；绑定 `family_id`，可选 `profile_id` / `question_id` |
| `consent_records` | 家长/监护人同意记录：成人确认、隐私声明版本、同意范围、时间 |
| `privacy_requests` | 家长导出、更正、删除、撤回同意请求 |
| `data_deletion_jobs` | 删除孩子档案 / 家庭账号后的后台清理任务 |
| `data_retention_policies` | 各类数据保留期限配置 |

建表原则：

- 所有核心表包含 `created_at`、`updated_at`。
- 涉及孩子数据的表必须有 `profile_id`。
- 涉及家庭共享资产的表必须有 `family_id`。
- 所有资产变动必须进入 ledger。
- 前端不能直接更新钱包、ledger、兑换状态或关键角色字段。
- RLS 必须保证家长只能看自己家庭的数据。
- 孩子数据表必须支持删除 / 匿名化路径；涉及缓存文件的表应有 `expires_at` 或可由 retention job 清理。
- Storage bucket 建议拆分：`ocr_uploads`、`report_exports`、`avatars`（MVP 仅默认头像，不开放用户上传头像）。所有文件必须通过短期 signed URL 访问。

重建策略：

- 开发/测试环境可以清空并重建，以减少历史字段债务。
- 如果已有真实数据，必须先导出、迁移、验证，再切换。
- 下一个技术步骤可以先写一份 `010_rebuild_core_schema.sql` 草案，但执行前需要用户明确批准。

## 14. 当前最高优先级技术任务

1. 文档收拢完成后，决定是否保留或回滚本地 B1 代码。
2. 若继续 B1，执行并验证 `009_b1_kid_profile_sync.sql`。
3. 修正练习每日限制：完成最后一题才锁当天；**注册后**写入云端 `daily_subject_completions`，禁止仅靠本地 `limit_*`。
4. 修正错题权重：同一 session 同一道题只加一次。
5. 设计学习范围选择：华文 lesson，其他科目 topic。
6. 设计 B2 错题本上云：`profile_id + question_id + weight + 错误答案历史`。
7. 设计徽章云端记录与注册后同步。
8. 设计商店 RPC：兑换、审批、ledger。
9. 重新设计英文/华文 OCR + AI 听写流程。

## 15. 历史踩坑与自查表

> 这里记录已经踩过、容易复发的坑。新功能或重构前**对照自查**，避免回归。

### 15.1 答案对比：先归一化再判对错

**症状：** 题库答案里写的是 `it’s`（curly apostrophe），孩子输入 `it's`（直引号），或者标准答案带尾随空格 / 大小写不同 / 全半角混用，都会被判成错。

**根因：** 字符层不一致就直接 `===` 比较。

**自查清单（实现答题判分时必做）：**

- 去首尾空白：`trim()`。
- **统一引号**：将 `’ ‘ ` `"` `"`  等智能引号转成 ASCII `'` 和 `"`。
- **统一空格**：全角空格 `　` → 半角；多空格折叠为 1 个；中文之间的空格按题型决定是否消除。
- **统一大小写**：英文题目 `toLowerCase()`（华文不动）。
- **统一全/半角数字与标点**：全角 `，。！？（）` → 半角，按题型决定（华文题应保留中文标点，英文题改 ASCII）。
- **去末尾标点容差**：英文句子题目最后一个 `.` / `!` / `?` 缺漏不算错，可选。
- **Unicode 归一化**：`String.prototype.normalize('NFKC')` 处理组合字符与兼容形式。
- **多答案分隔**：题库 `correct_answer` 若用 `|` 列出多个可接受答案，每个分别归一化后再做集合判断。

应统一封装一个 `normalizeAnswer(input, locale)` 工具函数，所有判分调用它；禁止在每个题型里各写一份。OCR / AI 导入题库时**入库前**也应同步归一化或保留原文 + 规范化字段两列，避免出题时再做。

### 15.2 写后立即读：本地新数据被云端旧数据覆盖

**症状（Google Sheet 时代）：** 孩子先完成练习（本地刚加好打卡天数）然后直接去商店；商店进入时拉取「云端打卡天数」，但本地新值还没上传完，远端拉回的是旧值，于是显示倒退或对不上。

**根因：** 两条路径同时存在「本地真相 + 云端真相」，并且写入是异步、读取不等待写完成。

**自查清单（Supabase + RPC 模式应避免）：**

- 注册后**云端是唯一权威**；本地不再把「打卡天数 / 余额 / 今日完成」当真相（参见 §3.1）。
- 写敏感数据**全部走 RPC**，并以 RPC 的返回值作为最新状态来源；不要写完就立刻发起一次独立的 read 去「确认」。
- 切换页面（练习 → 商店）时若必须刷新摘要：等待上一笔 RPC `await` 完成后再 pull，或在 RPC 响应里直接返回新摘要（如新的 `streak_days`、`balance_after`），让前端**无需二次拉取**。
- 不允许「先在本地累加，回头再 sync」的模式——这正是 Google Sheet 时期问题的来源。
- 若一定要做乐观 UI，最少要带 `updated_at` 或版本号，写成功后**作废**相关 sessionStorage 缓存，下次再读以服务端为准。
- 跨页面共享的内存状态（如 `window.AUTH` 里的余额/打卡）应在 RPC 成功后**立即更新**，避免子页面读旧值。

### 15.3 跨设备/换机的隐性假设（兼并入 §5.3）

- 不要假设「打开页面时本地必有上次的数据」。新机器全空，所有界面必须能从云端摘要冷启动。
- 不要在 `localStorage` 里写「最终余额」「今日是否已打卡」之类的真相键；缓存键必须带过期或可作废。
- 详细规则见 §5.3 与 §3.1。

### 15.4 本地时区与新加坡日历日

**症状（已踩坑）：**

- 早起鸟儿（7:00 前）/ 小猫头鹰（22:00 后）徽章用 `new Date().getHours()` 判断，孩子在国外旅行时设备时区不是 SGT，会被错发或漏发。
- 每日练习限额、打卡连击、`daily_subject_completions` 用 `new Date().toISOString().slice(0,10)`（UTC）或 `toLocaleDateString()`（设备本地）拿日期，结果新加坡的「今天」和设备的「今天」对不上：
  - 设备在 UTC：00:00–08:00 SGT 之间，UTC 日期还停在前一天 → 当天限额没重置。
  - 设备在 UTC+10（如澳洲东岸）：当地 06:00 已是新加坡 04:00 的「今天早起鸟儿」时段，凭设备时间会错发。
- 孩子假期飞往 UTC-8 等远时区，新加坡跨过零点很久之后设备还显示昨天，重新打开 App 会把昨天的打卡又触发一次或反过来直接没法打卡。

**根因：** 把「日历日」「时段」交给设备本地时间或 UTC 截取来表达，而本项目的产品规则全部按**新加坡日历日 (SGT, UTC+8, 无 DST)** 定义。

**自查清单（任何涉及「今天 / 今晚 / 早上 / 晚上 / 连续 N 天」判定的代码必做）：**

- **唯一权威时钟 = 新加坡时间。** 服务端用 PostgreSQL `timezone('Asia/Singapore', now())`；前端展示也按 SGT 转换，禁止直接用 `new Date()` 的本地分量做业务判定。
- **统一封装日期工具**（建议 `common/js/time.js`）：
  - `sgtNow()` → SGT 当前时刻。
  - `sgtDateStr()` → `YYYY-MM-DD`，按 SGT 截取（用 `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' })` 或等价方式，**不**用 `toISOString` 截 10 字符，**不**用 `toLocaleDateString` 隐式本地时区）。
  - `sgtHour()` / `sgtIsBetween(startHour, endHour)` → 时段判定（早起鸟儿 / 小猫头鹰）。
  - 所有调用方一律走这些函数；禁止在业务代码里再写 `new Date().getHours()` / `slice(0,10)`。
- **数据库列定义：**
  - 所有时间列使用 `timestamptz`（带时区）写入；查询「今天」一律 `(occurred_at AT TIME ZONE 'Asia/Singapore')::date = (now() AT TIME ZONE 'Asia/Singapore')::date`。
  - 「日历日」键列（如 `daily_subject_completions.practice_date_sgt`、连击表 `last_checkin_date_sgt`）显式命名 `_sgt` 后缀，提醒读者它是 SGT 截取的，不是设备日历日。
- **服务端判定优先：** 每日限额、打卡水晶解锁、连击是否中断这种关键判定**只在 RPC 服务端做**；前端只展示，不参与判定。客户端时钟可以被乱调，必须不可信。
- **跨时区旅行场景：**
  - 孩子在 UTC-5（如美东）凌晨 23:00 完成练习 → SGT 已是次日中午 12:00。系统视为「次日打卡」，正常重置每日限额、可解锁次日水晶。
  - 早起鸟儿 / 小猫头鹰按 SGT 7:00 / 22:00 判定，孩子在国外的「早上 7 点」未必是 SGT 早起鸟儿时段；产品上接受这一选择（按新加坡学校生活节奏），不补设备本地时区版。
  - 不要给前端「按设备本地时间显示完成与否」的兜底，避免出现设备和服务端展示不一致、孩子误以为额度还在。
- **测试用例（写代码前请覆盖）：**
  - 设备时区设为 UTC、UTC+10、UTC-8 各做一次：早起鸟儿、夜猫子、限额重置、连击是否中断的结果要与服务端 SGT 一致。
  - SGT 23:50 完成练习 + SGT 00:10 再次打开 App：连击 +1、限额重置正常发生。
  - 跨夏令时国家（如美东 11 月）旅行：判定不抖动（SGT 不受 DST 影响）。

涉及的产品规则与表（实现时需逐一检查）：

- `daily_subject_completions(profile_id, subject, practice_date_sgt)`：每日每科只能完成一次的唯一键。
- `profile_check_ins(profile_id, check_in_date_sgt)`：打卡 / 连击。
- 早起鸟儿、小猫头鹰：由服务端在 `record_learning_session` 中根据 `completed_at AT TIME ZONE 'Asia/Singapore'` 的小时数判定。
- 周末狂人：「周末」= SGT 周六、周日。
- 假期充电：`school_calendar` 的日期同样以 SGT 表达。
