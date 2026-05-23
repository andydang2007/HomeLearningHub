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
| `progress.md` | 迭代日志与下一步任务 |
| `.cursorrules` | AI 执行规则与安全边界 |

如果文档冲突：

1. 产品规则以 `Whitepaper.md` 为准。
2. 技术实现以 `TECHNICAL.md` 和 `.cursorrules` 为准。
3. 当前进度以 `progress.md` 为准。

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
└── progress.md
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
| `name` | 孩子显示名 |
| `grade` | 年级，如 `P1` - `P6` |
| `avatarId` | 头像库 ID |
| `gender` | `M` / `F`，家长端完整建档时有 |
| `schoolName` | 学校自由文本，Phase C 后再接学校表 |
| `chineseLevel` | `CL` / `HCL`，未来可扩 `FCL` |
| `cloudId` | 云端 `profiles.id`，B1 导入或云端建档后才有 |
| `uiLang` | 孩子界面语言 `en` / `zh`（注册后存 `profiles.ui_lang`） |

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
| 团队金币 | `gold_coins_vault` |
| 练习统计 | `practice_stats_${name}_...` |
| 每日限制 | `limit_${date}_${name}_${subject}` |
| 错题本 | `hub_mistakes` |
| 徽章记录 | 当前分散在 `practice_stats_*`、`pinyin_badge_count_*`、`tingxie_badge_count_*`、`easter_*` 等 key |

注意：当前金币 `gold_coins_vault` 是家庭团队资产，不按孩子拆分。

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
- `family_wallets` + `profile_wallets` + 期初 `wallet_ledger` 条目（团队金币、个人水晶）
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
| 家长手动调账 | `wallet_ledger` | 可选记入兑换/调整备注，或仅报告说明 |

- **`wallet_ledger`**：全量流水，对账与防作弊，**不对家长默认展示**。
- **`reward_redemptions`**：家长主界面财务相关唯一列表（待审批、已批准、已拒绝、已退款）。
- **`learning_reports` / 周报聚合**：从 `learning_sessions`、`badge_events`、ledger 汇总“某段时间练习次数、徽章数、金币/水晶净增”，替代逐条奖励 Log。
- 可不建面向家长的 `audit_logs` 全量镜像；若需运维排查，再建内部审计表。

新代码：所有资产变动先 **RPC 写 ledger + 业务表**；家长 UI 只订阅兑换状态与报告聚合，避免回到“本地先改数再同步 Sheet”的模式。

### 5.5 账本、防作弊与家长手动调整

**账本（`wallet_ledger`）给谁用？**

- 主要用途：**系统对账、防双花、运维排查**；**不是**家长日常浏览界面。
- 家长看 **兑换记录** + **学习报告汇总** 即可。
- 每条记录：`family_id` 或 `profile_id`、`amount`、`currency`（gold/crystal）、`reason_code`、`reference_type`、`reference_id`、`created_by`（system / parent / rpc）。

**能否靠严格代码防作弊？**

- 可以防：**前端直改余额、重复提交兑换、无 ticket 进奖励游戏、绕过 RPC 写库** 等。
- 不能单靠代码防：**孩子乱填、家长不管的“学习质量”**；经济最终由**家长审批兑换**兜底。
- 所有 earning/spend 应服务端判定（练习完成、徽章规则、ticket 发放），客户端只展示结果。

**家长手动调整（需 RPC + 流水）：**

- 允许家长增加/扣减金币或水晶，必填备注（如 `parent_bonus_chore`、`parent_correction`）。
- 禁止孩子端调用；禁止无流水改余额。
- 与“平台外任务”（做家务、早睡）连接方式：家长手动发币或创建**非学习类自定义奖励**，不把生活打卡做成与学习会话同级的自动判分，避免 scope creep 和隐私争议。

注册后同步要求（补充）：

- 本机徽章、打卡、金币、水晶、错题本、练习统计在**首次导入**时迁移；之后增量同步云端。
- 迁移前按**孩子名字 → `profile_id`** 映射；注册后禁止再依赖名字作为主键。

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
- 错误答案历史用于孩子复盘、家长报告和后续 AI 分析。

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
| `profile_learning_scope` | 每个孩子当前已学到哪些 topic/lesson |

`profile_learning_scope` 应由家长后台维护，也可以允许孩子在入口处选择“我学到这里了”，但最终应由家长确认或覆盖。

出题时：

- C 题只从已学 topic/lesson 里抽。
- A 错题只从当前可复习范围内抽，或明确标为“历史错题复习”。
- B 题从低一年级可复习范围抽。
- 临近期末、假期复习可有独立模式，另行设计。

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

每题答题记录写入 `question_attempts`：

- `session_id`
- `question_id`
- `profile_id`
- `answer_given`
- `is_correct`
- `time_spent_seconds`
- `attempt_order`

这两张表是家长后台核心数据、每周报告、错题复盘和 AI 分析的基础。

## 8. 家长 Auth 与 PIN

已实现：

- 家长注册 / 登录 / 忘记密码 / 重置密码。
- 家长 PIN 门。
- 离开 dashboard 后撤销 `parent_pin_ok`。

安全规则：

- `parent_pin` 永远不能返回给前端。
- PIN 设置与验证必须走 RPC。
- 前端 5 次错误后必须锁定；后端也应有节流或审计。

关键 RPC：

- `set_parent_pin(raw_pin)`
- `verify_parent_pin(raw_pin)`
- `check_pin_exists()`

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

- 金币是家庭团队资产。
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
| `custom_spelling_lists` | 家长确认后的英文听写表 |
| `custom_tingxie_lists` | 家长确认后的华文听写表 |
| `parent_imported_questions` | 家长确认后的自定义题/错题材料 |

AI 输出模板必须版本化，例如 `template_version`，避免后续提示词变更导致旧数据无法解释。

## 13. 目标数据库设计草案

如果当前表结构继续阻碍开发，可以考虑清空测试环境并重建。生产环境必须先备份，不能直接清空。

建议核心表：

| 表 | 用途 |
|----|------|
| `families` | 家庭账号，承载家庭级资产和订阅 |
| `profiles` | 家长与孩子档案，`role=parent/kid`；孩子含 `ui_lang` |
| `parent_settings` | 家长配置：正确率阈值、极速秒数、奖励游戏规则、`parent_ui_lang` |
| `learning_reports` | 周报/区间汇总（练习数、徽章、资产净增、时长等，可选物化或视图） |
| `questions` | 标准题库 |
| `subject_topics` | 学科 topic 目录 |
| `chinese_lessons` | 华文课文/lesson 目录 |
| `profile_learning_scope` | 孩子已学范围 |
| `school_calendar` | Term/Week/假期日历 |
| `learning_sessions` | 单次练习宏观记录 |
| `daily_subject_completions` | 注册后每日每科是否已完成（防换机绕过） |
| `question_attempts` | 每题答题明细 |
| `student_mistakes_book` | 当前错题状态 |
| `mistake_answer_history` | 错误答案历史，或并入 JSONB |
| `badge_definitions` | 徽章定义 |
| `profile_badge_counters` | 徽章累计与展示状态 |
| `badge_events` | 徽章获得事件 |
| `family_wallets` | 家庭团队金币 |
| `profile_wallets` | 孩子个人水晶 |
| `wallet_ledger` | 金币/水晶流水 |
| `reward_catalog` | 家长奖励商品 |
| `reward_redemptions` | 兑换申请与审批 |
| `game_tickets` | 奖励游戏 ticket |
| `game_sessions` | 奖励游戏游玩记录 |
| `ocr_uploads` | OCR 上传任务 |
| `ocr_extracted_items` | AI 识别候选项 |
| `custom_spelling_lists` | 英文听写表 |
| `custom_tingxie_lists` | 华文听写表 |
| `parent_imported_questions` | 家长上传错题/自定义题；**RLS 仅本 kid `profile_id` 可见**（§Whitepaper 4.2.2） |
| `referrals` / `subscription_entitlements` | 邀请裂变、试用与赠送时长上限 90 天 |
| `profile_badge_levels` / `badge_level_config` | 等级、段位、升级消耗徽章/水晶 |
| `leaderboard_entries`（或视图） | 匿名名人堂；脱敏 ID、无学校、按段位分组 |

建表原则：

- 所有核心表包含 `created_at`、`updated_at`。
- 涉及孩子数据的表必须有 `profile_id`。
- 涉及家庭共享资产的表必须有 `family_id`。
- 所有资产变动必须进入 ledger。
- 前端不能直接更新钱包、ledger、兑换状态或关键角色字段。
- RLS 必须保证家长只能看自己家庭的数据。

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
