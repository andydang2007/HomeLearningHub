📦 项目进度总结报告 (V10.6)
📅 更新日期：2026-05-30

🎯 整体状态

- **Phase A** 已在仓库中（家长 Auth、PIN、本机孩子 Profile、学生端 hub）。
- **2026-05-27** 增量：家长 PIN Forgot/密码门、徽章合成 Forge 全流程（前端 + RPC 草案）、打卡连击上云、`student` 徽章/等级云端优先、`parent/admin` 运维测试页、Premium 路线图写入本文档。**需在 Supabase 依次执行迁移 017～019（及已存在的 018）后联调验收。**
- **2026-05-28** 增量：`student/index` 头像系统升级（透明 PNG、分组、Premium 锁定与降级回退）、等级铭牌与顶部导航布局；`shop` 金币图标与 `shop-rewards` 资源整理；家长 PIN/档案删除流程优化；**徽章 PNG 资源**（`assets/images/badges`，16 张透明图，`streak_*` 共用 `streakcrystal.png`）；`common/js/badge-icons.js` 统一图标路径与英文两行断行；首页 / Forge / 练习弹窗接入；`docs/badge-copy.md` 文案对照表。
- **2026-05-28 晚间** 增量：学生首页 **Hero 三栏布局**（日历 / 头像昵称 / 等级芯片）；打卡提示并入 `#section-subject-title`；日历点击切换语言；连击区 **最高记录框内数字**（随位数缩字、无下方「n天」）；连击徽章统一水晶框、类别排序（连击置末）；华文科目标签按 `chineseLevel` 修复；**Admin 运维控制台**重构（`parent/admin.html/js/css` + 迁移 **020～022**：科目设置 RPC、账户搜索/订阅/回收站/孩子等级编辑）。
- **2026-05-30** 增量：**连击中断检测（SGT 开页）** + **Premium 连击护盾**（每个孩子每月 3 个）；学生端 Basic/Premium/护盾弹窗与家长升级引导；家长端 **孩子档案查看弹窗**（等级、连击、近 7 天练习/时长、徽章、🛡️ 本月剩余护盾）；多账户本机 `cloudId` reconcile；迁移 **023～025**（`profile_streak_shields`、`get_streak_status` / `resolve_streak_break`、`get_kid_profile_summary`；024 修复 `get_family_info` 只读事务）。**需在 Supabase 依次执行 023→024→025 后联调。**
- **2026-05-25** 增量：白皮书 + 技术文档补产品规则；`ParentGuide.md` 改为中英文对照、纯家长用户口吻。
- **2026-05-22** 主要工作：**文档收拢 + 产品与数据架构定稿 + B1 前端代码预备**；**未**在 Supabase 执行 `009`，**未**重建数据库。
- 产品/设计事实来源：`Whitepaper.md`；工程事实来源：`TECHNICAL.md`；家长可读说明：`ParentGuide.md`；入口：`README.md`。
- 内部项目名统一为 **Home Learning Hub**；旧三字母项目代号禁止再用于文档/代码（见 `README.md`）。
- **下一步**：用户确认 010 方案 6 项默认值 → `010_rebuild_core_schema.sql` 草案 → Approved 后在测试库重建。

### 2026-05-25 增量

| 文件 | 变更 |
|------|------|
| `Whitepaper.md` | §4.2.1.1 改为「全科出题范围模式」；§4.3 / §4.5 加入「系统默认听写表」；§6 明确金币兑实物、个人水晶兑非实物、1 徽章 = 1 金币、打卡水晶需当天至少 1 徽章解锁；§8 修正孩子 PIN 目的、学习报告 PDF/7 天保留、反馈与建议入口、手动调账暂不开放；§9 改为一孩/多孩 × 基础/高级账户模型 |
| `TECHNICAL.md` | §5.1 `kid_profiles` 加全科范围模式概念；§5.4 / §5.5 同步学习报告、错题详情、手动调账边界；§6.4.1 改为 `profile_subject_settings`（范围模式、基础正确率、目标正确率、目标完成时间）；§12 / §13 加入 `default_spelling_lists` / `default_tingxie_lists` / `parent_feedback` |
| `ParentGuide.md` | 改为中英文对照、纯家长用户口吻；补一孩/多孩 × 基础/高级账户模型；移除开发者文档引用、邀请机制、手动调账开放说法；修正金币/水晶用途、孩子 PIN 目的、错题展示、兑换退款、奖励游戏、等级段位与隐私说明 |
| `TECHNICAL.md` §15.4 | 新增「本地时区与新加坡日历日」踩坑：早起鸟儿/夜猫子、每日限额、连击、跨时区旅行的判定一律走 SGT；要求服务端 RPC 判定、统一 `sgtDateStr()` 工具与 `_sgt` 后缀列；同步在 `Whitepaper.md` §3.3、§7.5 注明按 SGT |
| `Whitepaper.md` / `TECHNICAL.md` / `ParentGuide.md` | 新增 PDPA / 儿童数据边界：全程昵称、不鼓励真实姓名；学校名和性别可选；MVP 不开放真人头像上传；名人堂只展示昵称和级别且不可搜索；暂不做同校/好友/私信；明确数据保留期限、删除场景、家长导出/更正/删除请求；技术侧加入成人注册确认、`consent_records`、`privacy_requests`、`data_deletion_jobs`、`data_retention_policies` |
| `supabase/migrations/010_rebuild_core_schema.sql` | 新建核心 schema 重建草案：破坏性清空 `public` 后重建家庭/孩子档案、每科设置、题库、练习、错题、徽章、钱包、兑换、OCR、订阅、名人堂、反馈、PDPA/保留删除相关表；预置现有徽章；`schools` 与等级公式保持空表；尚未在 Supabase 执行 |
| `README.md` | 文档索引补 `ParentGuide.md` |

### 2026-05-27 今日完成（工程交付）

| 范围 | 内容 |
|------|------|
| 家长 PIN | `pin.html` / `pin.js`：`Forgot PIN` → 主账户密码校验 → 重置 PIN；数字键圆形、底部操作横向；attempts/i18n 修复 |
| 学生 Hub | `index.js`：注册孩子有 `cloudId` 时徽章自 Supabase（`badge_definitions` + `profile_badge_counters`）优先；皇冠不计入徽章总数；等级芯片跳转合成页；打卡连击走 `018` RPC |
| 合成 Forge | `synthesis.html` / `.css` / `.js`：`get_synthesis_data` / `level_up_profile` UI；亮色主题、徽章 5 列网格、进度条、`streak` 不参与合成；隐藏徽章 Premium 中间弹窗、实时滑块、`0/0` 水晶绿色满条、Forge 火焰装饰；不按默认消耗钱包水晶（仅 hidden 折算 + RPC 直连参数为 0） |
| 数据库迁移 | `017_level_up_rpc.sql`（徽章升级/`level_up_spend` 等）；`018_checkin_streak_cloud.sql`（`profile_checkin_streaks` + `get/upsert_checkin_streak`）；`019_admin_test_rpcs.sql`（`admin_users` 白名单 + 搜索用户/改 plan/徽章与钱包校正 RPC；`owner_user_id`、`deleted_at` 过滤等在迭代中修正） |
| 运维测试 | `parent/admin.html`：邮箱检索家庭与孩子、改 `plan_tier`/`account_type`、调徽章数与金币水晶（仅白名单管理员） |
| 国际化 | `common/js/i18n.js`：PIN、合成、`synth.title` 等中英 key |
| 产品规划 | 本文档 §「下一步新增（Premium 功能隔离专题）」：错题/商城自定义、报告 PDF、护盾、头像分级、名人堂入口与 consent 等 |

---

### 2026-05-28 今日完成（工程交付）

| 范围 | 内容 |
|------|------|
| 学生首页 UI | `student/index.html` / `.css`：顶部导航改为左中右同一行（语言/日历/家长入口）；头像-昵称-等级排版微调；等级铭牌改为段位金属质感；文案显示 `青铜/白银/... + Level N` 并随 i18n 切换 |
| 等级入口逻辑 | `student/index.js`：铭牌点击在无 `cloudId` 的游客场景给出“注册后可进入等级空间”提示，避免静默失败 |
| 头像系统（student） | 新增头像弹窗、`assets/images/avatars` 分组展示（Default/球星/6~7~/宠物/快餐）、默认头像偏移微调、图片缩放与居中参数；支持按当前 profile 持久化选择 |
| Premium 权限 | 非 Premium 仅可用 Default 组；其余组灰锁禁用；文案简化为 `🔐 Premium Features` 并放在 Default 组与下组之间 |
| 订阅降级回退 | Premium→Basic 时：若当前为自定义头像，自动回退到默认组第一个；若已选默认头像则保持；有 `cloudId` 时同步更新云端 `avatar_id` |
| 商城资源整理 | 兑换商品图片迁移为 `assets/images/shop-rewards`；`student/shop.js` 路径更新；金币图标统一为 `💰`（顶部、tab、价格行） |
| 家长页防误入/删除流 | `parent/pin` 增加“返回学习主页”按钮；`parent/dashboard` 编辑弹窗中点删除立即弹确认，且先关编辑弹窗避免遮挡 |
| 徽章图标资源 | `assets/images/badges/` 16 张 PNG（文件名对齐 `badge_code`）；连击档 `streak_3`～`streak_30` 共用 `streakcrystal.png` |
| 徽章展示层 | `common/js/badge-icons.js` + `assets/css/badge-icons.css`：按 `badge_code` 加载图片、emoji 回退；英文名称固定两行（Forge 格子同步） |
| 文案与文档 | `docs/badge-copy.md` 徽章中英名/描述与图标对照；`i18n.js` 练习弹窗「Unlock Game / 解锁游戏」替代 Balloon Hunter |

### 2026-05-28 晚间完成（工程交付）

| 范围 | 内容 |
|------|------|
| 学生首页 Hero | `student/index.html` / `.css` / `.js`：三栏（Term/Week 日历 · 头像+昵称 · 等级芯片）；移除独立打卡条与右上角语言钮；页脚 Switch User + Parent 比例调整 |
| 打卡与语言 | `#section-subject-title` 动态显示待打卡/已完成文案；日历点击 `toggleAppLanguage()` + toast；`updateCnSubjectLabel()` 按 profile `chineseLevel` 显示高级华文/华文 |
| 连击徽章 UI | 连击类统一 soft blue 水晶框；荣誉墙连击类别置末；**最高记录**框内直接显示历史天数（1～4 位自适应字号），不再用皇冠 emoji 或框下「n 天」 |
| 徽章图标 | `badge-icons.js` 新增 `max_streak` code（英文两行 Best/Streak）；`badge-streak-num` 样式 |
| Admin 运维台 | `parent/admin.html` / `admin.js` / `admin.css`：Overview、账户搜索（默认邮箱）、订阅编辑、回收站恢复、孩子 profile 等级编辑；白名单 `admin_users` + Supabase Auth |
| 数据库迁移 | `020_profile_subject_settings_rpc.sql`（`get/update_kid_subject_settings`）；`021_admin_ops_console.sql`（搜索/改 plan/回收站等）；`022_admin_set_profile_level.sql`（`admin_set_profile_level`） |
| Auth / 家长端 | `auth.js` 科目设置 RPC 封装；`parent/dashboard` 科目范围设置 UI 与云端同步 |
| 商店微调 | `student/shop` 布局与 i18n 小修 |

**需在 Supabase 依次执行迁移 020～022 后联调 Admin 与孩子科目设置。**

### 2026-05-30 完成（连击护盾 + 家长档案查看）

| 范围 | 内容 |
|------|------|
| 连击中断 | `student/index.js`：开页 SGT 检测 gap>1；Basic 接受清零 / Premium 护盾或耗尽弹窗；`sessionStorage` 家长横幅 hint |
| 护盾规则 | **每个孩子** Premium 每月 3 个（`profile_streak_shields`）；消耗走 `resolve_streak_break('shield')` |
| 学生 UI | 连击中断/护盾 modal CSS；游客注册提示（Forge、练习徽章） |
| 家长 Dashboard | 点击孩子卡片 → **查看弹窗**（再进编辑）；Account 区不展示护盾；升级 modal features 含护盾说明 |
| 多账户本机 | `auth.js`：`reconcileLocalKidsWithCloud`、`resolveKidCloudId`、切换档案校验 |
| 数据库迁移 | `023_streak_break_shields.sql`；`024_get_family_info_shield_guard.sql`；`025_kid_profile_summary.sql` |
| 文档 | `ParentGuide.md` 护盾改为每个孩子每月 3 个、在档案查看剩余 |

**需在 Supabase 依次执行迁移 023→024→025 后联调连击中断与家长档案查看。**

> **📌 后续提醒 — 家长档案查看页待补充指标**  
> 当前 `get_kid_profile_summary` / 查看弹窗仅含等级、连击、近 7 天练习次数/时长、累计完成次数、徽章数、Premium 护盾剩余。  
> **将来还应增加**：累计/区间 **练习题数**、**错题数**（及可按科目拆分的关键学习指标），需对接 `learning_sessions` 题量字段与错题表（如 `profile_mistakes` / 会话明细 RPC），并在 i18n 与查看弹窗中与其它 stat 行统一格式（emoji + 一行文案）。

---

## 📅 接下来一周计划（2026-05-29 ~ 2026-06-04）

| 天 | 重点 | 交付物 |
|---|---|---|
| Day 1 | 头像云端化方案评审（不改库先方案） | 头像上云字段/RPC草案、回退策略、风险清单（Premium 降级、游客） |
| Day 2 | `student/index` 头像选择稳定性 | 设备兼容回归（移动端点击、弹窗遮罩、语言切换、profile切换）+ bugfix |
| Day 3 | Forge 回归与交互收口 | hidden/滑块联动、非注册提示、Premium 锁定一致性回归清单 |
| Day 4 | 家长端 profile 操作完善 | 删除/编辑/PIN 误入防护回归；补充关键交互文案 i18n |
| Day 5 | 资源与路径治理 | `assets` 目录规范化（**徽章 PNG 已完成**）；头像/商店路径扫描与失效引用清理 |
| Day 6 | E2E 手测日 | 游客→注册、Basic→Premium→Basic、跨页面头像与等级入口全链路手测 |
| Day 7 | 发布准备与文档同步 | 更新 `PROGRESS.md`、发布检查清单、下周任务拆解（数据库迁移与RPC优先级） |

**本周目标：** 优先把“学生首页头像 + 等级入口 + Premium限制”打磨到可稳定演示，再进入头像上云改造。

---

## 📈 整体进度与上线预估（2026-05-22）

> 以下为**粗估**，随你每周投入时间会浮动；每次大里程碑完成后应更新本节。

### RPC 是什么？（给非技术读者）

**RPC** = Remote Procedure Call，在 Supabase 里可理解成：

**「在云端数据库里预先写好的、带规则的办事窗口」**。

| 对比 | 直接改表（前端 SDK） | RPC（推荐用于敏感操作） |
|------|----------------------|-------------------------|
| 谁改数据 | 浏览器里的 JS 直接 `update` | 只调用一个函数名，如 `create_kid_profile(...)` |
| 规则在哪 | 容易散落在各处 JS | 集中在数据库里，统一校验 |
| 例子 | 孩子自己改金币余额 ❌ | 练习结束由云端函数加币、记流水 ✅ |

本项目里 RPC 典型用途：设/验 PIN、创建孩子档案、兑换扣款、发 ticket、家长手动调账。  
**你不需要会写 RPC**；实现时由开发在 Supabase SQL 里写好，前端只「调用并拿结果」。

文档里写的 `verify_parent_pin`、`create_kid_profile`、`list_kid_profiles` 都是 RPC 函数名。

---

### 进度百分比（两条线）

| 口径 | 约完成度 | 说明 |
|------|----------|------|
| **A. 白皮书完整愿景**（含 OCR、盲盒、全部专项游戏、订阅计费 polished；同校社交/好友功能暂不考虑） | **~28%** | 设计与文档约占一部分；大量功能仍在本机或 legacy |
| **B. 可收费家庭 MVP**（注册→云端存档→四科练习→徽章/币/水晶→商店兑换家长批→基础报告） | **~42%** | Phase A 已落地；**缺**核心库重建、注册后全量上云、商店 RPC、每日限制上云 |

**B 线各块粗分（占 MVP 权重）：**

| 模块 | MVP 权重 | 完成度 | 备注 |
|------|----------|--------|------|
| 产品/技术文档 | 10% | **90%** | Whitepaper + TECHNICAL 已定稿，可持续改 |
| 家长 Auth + PIN | 15% | **75%** | 能跑；依赖 003–007；PIN/档案要接新库 |
| 孩子 Profile + 游客/注册导入 | 15% | **35%** | 本机完成；B1/010 未执行 |
| 学生 Hub + 练习 15 题 | 20% | **55%** | UI 可练；限制/权重/上云未做完 |
| 题库 + 学习范围 | 10% | **40%** | 云端有题；lesson/topic 范围未接 |
| 徽章 / 打卡 / 资产上云 | 15% | **25%** | 逻辑多在 localStorage |
| 商店 + 兑换家长审批 | 10% | **20%** | UI 有；真实 RPC 账本未接 |
| 家长后台（兑换记录+简报告） | 5% | **15%** | Dashboard 仅档案管理 |
| 部署 / 测试 / 合规 | 10% | **10%** | 本地为主；未 production 化 |

加权合计约 **42%**（四舍五入，非精确科学测量）。

---

### 按当前节奏，大概何时「能上线」？

**假设：** 以 MVP（B 线）为目标；每周约 **3～4 个有效开发日**（你 + AI 结对）；数据库明日重建后按 Phase B 推进。

| 里程碑 | 预估时间（从 2026-05-22 起） | 交付物 |
|--------|------------------------------|--------|
| **数据库 `010` + 测试库跑通** | +1～2 周 | 核心表、RLS、关键 RPC 骨架 |
| **注册后上云 + 换机一致** | +3～5 周 | 档案/币/徽章/每日限制/兑换走云端 |
| **MVP 家庭内测（beta）** | **约 8～10 周**（→ **2026 年 7 月下旬～8 月初**） | 可给 5～20 个家庭试用，Stripe 可后置 |
| **对外收费上线**（订阅 + 稳定部署） | **约 12～16 周**（→ **2026 年 8 月下旬～9 月**） | Site 正式 URL、邮件/支付、监控、备份 |

若每周投入接近全职（5 天），MVP 内测可压缩到 **约 5～7 周**。

**尚未排进上述工期的（会拉长久线）：** 华文/英文 OCR 听写重做、盲盒、legacy 专项页全部迁回 `student/`、同校排行榜、MOE 学校表、完整 i18n 汉化专项。

---

### 当前阶段一句话

**「地基和说明书已经搭好，房子外壳（Phase A）能住；水管和保险柜（云端账本 + 全量同步）还没接好，暂不宜对外收费上线。」**

---

🛠️ 今日完成（2026-05-22）

### 一、文档体系重组

| 文件 | 变更 |
|------|------|
| `Whitepaper.md` | 重写为产品设计文档：徽章四类、练习 A+B+C、奖励游戏、商店、游客/注册转化、学习范围、OCR、商业定价等 |
| `TECHNICAL.md` | **新建**：目录、本地/云端数据生命周期、目标表清单、同步策略、Legacy Log 映射、i18n 与语言设置 |
| `README.md` | 文档导航 + 命名规则 + 界面语言说明 |
| `Business.md` | 归档为指针，内容并入白皮书 |
| `.cursorrules` | 增加 **Model Suitability Gate**；标题改为 Home Learning Hub |

### 二、产品与数据架构（已定稿，写入白皮书/技术文档）

**游客 vs 注册**

- 注册前：本机 `localStorage` + 孩子**名字**；换机/清缓存/改名可丢；建议本地保留约 **30 天**并引导家长注册保存成就。
- 注册后：**全部资产与状态必须上云**；换设备登录应与旧机一致；云端错题用 `question_id`。
- 注册时 **一次性导入**本机数据，不是清空重来。

**注册后必须上云（含当前缺陷项）**

- 金币、个人水晶、徽章、打卡连击、错题、`learning_sessions`、兑换单、ticket 等。
- **每日每科练习限制** 不得仅靠本地 `limit_*`（当前换机可绕过）→ 目标表 `daily_subject_completions`。

**同步（相对 Google Sheet）**

- 过去：每次打开强制同步 + 手动按钮（Sheet 与本地缓存不一致）。
- Supabase 目标：云端权威；打开/切孩 pull；RPC 写成功后再更新 UI；可选刷新按钮，正常应无感。

**家长侧财务/记录 UI（简化）**

- 系统保留完整 `wallet_ledger` 对账；**家长默认只看兑换记录**。
- 练习/徽章/赚币用 **学习报告汇总**，不展示逐条 coin/badge Log（对接 legacy Log 类型已写在 `TECHNICAL.md` §5.4）。

**界面语言**

- 不做「改一屏补一屏 i18n key」。
- `profiles.ui_lang`（每个孩子）、`parent_ui_lang`（家长全局）；词典仍用 `i18n.js`，中文 **一次性专项** 补全。

**其它**

- 出题范围：不能只按年级全量；华文 lesson / 其它科目 topic + `profile_learning_scope`。
- 定价暂定：单孩月付 S$12.90，多孩（≤3）S$19.90，年付 S$129–199。
- 假期充电：新加坡小学**假期期间累计打卡 15 天**触发。

### 三、B1 代码（本地已写，Supabase 未执行）

| 文件 | 说明 |
|------|------|
| `supabase/migrations/009_b1_kid_profile_sync.sql` | 扩展 `create_kid_profile`；新增 `list_kid_profiles` |
| `common/js/auth.js` | 云端拉取/导入、`cloudId`、`active_kid_profile_id`、合并逻辑 |
| `parent/dashboard.html` + `dashboard.js` | 保存走 RPC；首次导入弹窗 |
| `common/js/i18n.js` | 导入相关文案 key |

**状态：** `009` **尚未**在 Supabase SQL Editor 执行；B1 **不能视为已验证**。在 `010` 重建库之前，是否保留/调整 `009` 待明日与白皮书一并决定。

### 四、历史提交（2026-05-21，已在 `origin/main`）

- Phase A 家长/学生模块、`001`–`008` 迁移脚本、`.gitignore` 排除 `node_modules` 等（见上一版 V9 记录）。

---

📊 当前可运行程度清单

| 功能模块 | 运行状态 | 说明 |
|----------|----------|------|
| 学生首页 / 练习 / 商店 UI | ✅ 可用 | 练习/资产仍偏本机 |
| 学生多 Profile + 头像 | ✅ 本机 | `kid_profiles` |
| 家长注册 / PIN / 后台 | ✅ 需 Supabase 003→007 | 008/009 视环境 |
| B1 云端孩子同步 | 🟡 代码在库 | **009 未执行**；重建库后可能由 `010` 替代 |
| 注册后全量上云 + 换机一致 | ❌ 未实现 | 待 `010` + 前端改造 |
| 每日练习限制上云 | ❌ 缺陷 | 本地 `limit_*` 可换机绕过 |
| 核心 schema 重建 | ❌ 明天 | `010_rebuild_core_schema.sql` 草案 |
| 错题本云端 | ❌ | `student_mistakes_book` + 错误答案历史 |
| 学习范围 / lesson·topic | ❌ 文档已定 | 待表 + `practice.js` |
| 商店 RPC + 兑换记录 | ❌ | ledger 后台；家长仅兑换列表 |
| OCR + AI 听写 | ❌ 文档已定 | 家长确认后入库 |

---

📂 文档与代码索引

```
Whitepaper.md     产品/设计（Source of Truth for product）
TECHNICAL.md      工程/数据库/同步（Source of Truth for implementation）
README.md         入口 + 命名 + i18n 策略
PROGRESS.md       本文件
.cursorrules      AI 规则

parent/           家长端
student/          学生 hub、practice、shop
game/             目标：奖励游戏分发台（部分仍在 _legacy_backup）
supabase/migrations/
  003–008         现有 Auth/PIN/Profile 补丁链
  009             B1 kid sync（未执行）
  010             计划：核心表重建（明天草案）
  020–022         科目设置 RPC + Admin 运维台 + 孩子等级编辑（待执行）
parent/admin.*    运维控制台（白名单管理员）
```

---

🎯 下一阶段（优先级）

### 明天（2026-05-23）

1. 通读 `Whitepaper.md` 逻辑，与 `TECHNICAL.md` §13 表清单对齐。
2. 编写 **`010_rebuild_core_schema.sql` 草案**（中文注释版说明每张表用途）。
3. 用户 **Approved** 后，在 **测试用** Supabase 项目执行重建（有真实数据须先备份）。
4. 决定是否废弃单独跑 `009`，或合并进 `010`。

### 随后（Phase B）

- 注册后 pull/RPC-first 前端；废除本地资产真相。
- `daily_subject_completions`、错题上云、`ui_lang`。
- 练习完成才锁当日；错题 session 内只加权一次。
- 家长后台：兑换记录 + 学习报告；手动调账走 RPC。

### 下一步新增（Premium 功能隔离专题）

1. **Premium 功能隔离总开关与路由守卫**
   - 统一定义 Premium gating（前端入口灰显 + 后端 RPC 二次校验）。
   - 所有受限功能给出一致提示文案（免费版不可用 / 引导升级）。

2. **自定义错题（Premium）**
   - 家长端新增“自定义错题”入口与管理页。
   - 免费版仅可见灰色入口，不可操作。

3. **自定义商城商品（Premium）**
   - 家长端可新增/编辑自定义兑换商品。
   - 免费版入口灰显，防止调用写入接口。

4. **详细版学习报告 + 一键导出 PDF（Premium）**
   - 家长端报告分基础版/详细版。
   - 详细版提供导出 PDF 按钮与下载链路。

5. **连击护盾（Premium 每月 3 个）**
   - 若错过打卡：默认连击清零；Premium 可自动消耗护盾保留连击。
   - 护盾按自然月重置为 3（需服务端判定，不依赖本地时间）。

6. **自定义头像权限改造**
   - 学生端保留头像入口，但仅 Premium 可选择自定义头像；免费版头像选项灰显。
   - 家长端头像池先收敛为：男孩 2 个 + 女孩 2 个。

7. **合成页新增“名人堂”入口（Premium）**
   - `synthesis` 页面增加名人堂按钮。
   - 免费版按钮灰显，并提示仅高级用户可进入。

8. **名人堂访问需家长 consent**
   - 仅 Premium 家长可看到 consent 开关。
   - 家长开启后，学生端才可进入名人堂。

9. **名人堂 MVP 展示规则**
   - 按各级别展示前十学生昵称（仅昵称，不暴露敏感信息）。
   - 暂不做搜索、私信、同校关系链。

---

⚠️ 已知限制 / 未做

- Supabase **未执行** `009_b1_kid_profile_sync.sql`。
- **未** git 之外的远程 DB 变更。
- `practice.js` 每日限制、错题权重、商店账本仍为本地/占位。
- 专项页面（spelling、tingxie、pinyin、radical、wordsearch）多数仍链 `_legacy_backup`。

---

📌 下次开工建议

> 「已审白皮书；请按 Whitepaper + TECHNICAL §13 生成 `010_rebuild_core_schema.sql` 中文说明版，等我 Approved 后在测试库执行。」
