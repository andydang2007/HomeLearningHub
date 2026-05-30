📦 项目进度总结报告 (V11)
📅 更新日期：2026-05-30

---

## 当前快照

| 项 | 状态 |
|----|------|
| **整体阶段** | Phase A 完成；Phase B **部分完成** — 可内测演示，**尚差题库 + 练习闭环** 才能放心给家庭试用 |
| Supabase 迁移 **001～025** | ✅ 已在数据库执行（含核心 schema **010** 及后续补丁 011～025） |
| 学生 Hub / Forge / 家长 Dashboard | ✅ 可运行；Forge 已人工全流程测试 |
| 标准练习 `practice.html` | 🟡 页面在 `student/`，已从 Supabase 拉题，但**结算/限制/错题未上云** |
| 题库 `questions` | 🟡 表结构已有（010）；**数据灌入与导入脚本对齐**待完成 |
| 商店 / 支付 | 🟡 商店 UI 有，兑换 RPC 为 stub；**Stripe 未接**（计划试用后再做） |
| 专项科目（Spelling / 听写 / 拼音等） | ❌ 仍链 `_legacy_backup/`，未迁回生产路径 |
| 头像 | 预设头像本机缓存；**暂不上云** |
| 视觉 QA | ✅ `dev/qa.html` 场景演练台 |
| CI 冒烟 | ✅ Playwright `npm test`（不能代替眼看 UI） |

**你的理解基本正确：** 距「可上线试用」主要差 **① 题库上云（有数据、能出题）** 和 **② Practice 页面重建（练习结果走 RPC、每日限制上云、与 Hub 体验一致）**；**支付 / 真实订阅扣款** 可放在试用反馈之后。

---

## 上线试用前：功能对照清单

> 对照代码与迁移脚本逐项勾选（2026-05-30 代码审查）。

### ✅ 已完成（可演示）

| 模块 | 内容 | 主要位置 |
|------|------|----------|
| 家长 Auth | 注册、登录、忘记/重置密码、成人确认 | `parent/index.*` |
| 家长 PIN | 4 位 PIN、Forgot PIN、会话门 | `parent/pin.*` |
| 孩子档案 | 本机 + 云端 CRUD、`cloudId` 同步 | `auth.js`, `dashboard.js` |
| 账户与计划 UI | Basic/Premium、单孩/多孩展示；Admin 改 plan；预约升降级 RPC | `015`, `016`, `dashboard.js` |
| 科目设置 | 每孩每科 base/target/时限 | `020`, dashboard 科目面板 |
| 学生 Hub | Hero 三栏、日历、徽章墙、科目入口、Switch User | `student/index.*` |
| 连击 | 云端打卡 RPC、SGT 判定、中断弹窗 | `018`, `023`, `index.js` |
| 连击护盾 | 每 Premium 孩 3/月 | `023`–`025` |
| Forge 合成 | 等级升级、合成动画 | `synthesis.*`, `017` |
| 家长查看档案 | 等级、连击、7 日练习、徽章、护盾 | `025`, dashboard 查看弹窗 |
| Admin 运维 | 账户搜索、订阅、回收站、孩子等级 | `021`, `022`, `admin.*` |
| 学校库 | 学校 CSV 导入 | `012`–`014` |
| i18n | 中英词典、`AppI18n` | `common/js/i18n.js` |
| 家长指南 | `ParentGuide.md` + `guide.html` | `parent/guide.*` |
| QA 工具 | 场景演练台 + Playwright 冒烟 | `dev/qa.*`, `tests/e2e/` |

### 🟡 进行中 / 部分完成

| 模块 | 已有 | 仍缺 |
|------|------|------|
| **题库上云** | `questions` 表（010）；`practice.js` 已 `.from('questions')` 拉题；`migrate_all_data.js` 导入脚本 | 导入脚本字段与 010 schema **未对齐**（如 `topic` vs `topic_id`）；仓库内**无 CSV 数据文件**；需验证各年级/科目题量 |
| **Practice 重建** | 新 UI（`practice.html/css`）、A-B-C 选题、Scratchpad、徽章弹窗、每日限制逻辑 | 未调 `record_learning_session` RPC；每日限制仍靠本地 `limit_*`；错题仍 `hub_mistakes` 本地；注册用户徽章/金币**未写云端** |
| **Phase B 同步** | 档案/连击/Forge/摘要 RPC | 练习会话、错题本、钱包、商店账本、注册后全量导入 |
| **商店** | `shop.html` 目录 UI | `requestRewardExchange()` 为 stub；未接 `reward_catalog` / ledger RPC |
| **订阅变更** | `scheduleSubscriptionChange` RPC、升级弹窗 UI | Pay 按钮为 placeholder；无 Stripe Checkout / Webhook |

### ❌ 未做 / 后期

| 模块 | 说明 |
|------|------|
| Stripe 支付 | 升级弹窗显示「Payment coming soon」 |
| 专项练习页 | Spelling、听写、拼音、部首、Word Search 仍在 `_legacy_backup/` |
| Premium 专题 1–4 | 总开关、自定义错题/商城、PDF 报告 |
| Premium 专题 7–9 | 名人堂 + consent |
| OCR / AI 听写 | 未实现 |
| 头像上云 / 自定义上传 | 产品决定暂不做 |
| 档案查看 | 累计/区间 **练习题数、错题数**（待扩展 `get_kid_profile_summary`） |

---

## 距「可上线试用」估算

| 里程碑 | 状态 | 说明 |
|--------|------|------|
| 内部演示（Hub + 家长端 + Forge） | ✅ 现在就可以 | 不依赖完整题库 |
| **家庭内测 MVP** | 🟡 **约 2–4 周**（粗估） | 取决于题库灌入 + Practice RPC 接线工作量 |
| 对外收费上线 | ❌ 更后 | 需 Stripe + 商店账本 + 合规流程 |

**内测 MVP 最小闭环（建议顺序）：**

1. 对齐 `migrate_all_data.js` ↔ `questions` 表 schema，灌入 English/Math/Science/华文题库并 spot-check
2. Practice 接 `record_learning_session` + `daily_subject_completions`（注册用户）
3. Practice UI/流程与 Hub 统一（含每日一次限制、完成后回 Hub 刷新徽章）
4. （可选内测后）错题本上云、商店 RPC、专项页迁回 `student/`

**支付：** Admin 手动改 plan 或试用码即可支撑内测；Stripe 不挡第一轮试用。

---

## 时间线（新 → 旧）

### 2026-05-30 · 连击护盾 + 档案查看 + QA 工具 + 进度对照

| 范围 | 内容 |
|------|------|
| 连击中断 | 开页 SGT 检测；Basic/Premium/护盾弹窗 |
| 护盾 | 每个孩子 Premium 每月 3 个（`profile_streak_shields`） |
| 家长 Dashboard | 孩子**查看弹窗**；多孩本机 `reconcileLocalKidsWithCloud` |
| 数据库 | **023** 护盾 · **024** `get_family_info` 只读修复 · **025** `get_kid_profile_summary` |
| 测试 | Playwright 冒烟 + **`dev/qa.html` 视觉场景演练台** |
| 产品决定 | 头像暂不上云；Forge 已人工测过 |
| 文档 | **PROGRESS V11**：对照代码勾选完成项；时间线倒序；明确内测前 P0（题库 + Practice） |

---

### 2026-05-28 · 头像 / Hero / Admin 运维台

| 范围 | 内容 |
|------|------|
| 头像 | PNG 分组、Premium 锁定、降级回退 |
| 学生 Hero | 三栏（日历 / 头像昵称 / 等级） |
| Admin | 账户搜索、订阅、回收站、孩子等级 |
| 数据库 | **020** 科目设置 · **021** Admin 控制台 · **022** 孩子等级 |

---

### 2026-05-27 · Forge + 连击上云

| 范围 | 内容 |
|------|------|
| Forge | `synthesis.*` + `get_synthesis_data` / `level_up_profile` |
| 连击 | 打卡 RPC（**018**） |
| Admin 测试 RPC | **019** |
| 等级升级 RPC | **017** |

---

### 2026-05-25 · 白皮书 / PDPA / 核心 Schema

| 范围 | 内容 |
|------|------|
| 文档 | 全科范围、金币/水晶、一孩/多孩、PDPA 基线 |
| 数据库 | **010** 核心 schema（题库、练习会话、徽章、钱包、商店等表 + `record_learning_session`） |
| 后续补丁 | **011**–**016** 在 010 之上迭代（profile RPC、订阅、学校库等） |

> **说明：** `010_rebuild_core_schema.sql` 曾是「重建草案」；现已作为迁移链一环**执行完毕**，不再单独 pending。后续功能以 011～025 增量补丁为准。

---

### 2026-05-22 · 文档定稿 + B1

| 范围 | 内容 |
|------|------|
| 文档 | `TECHNICAL.md` 新建；`Whitepaper.md` 定稿 |
| B1 | **009** kid sync；`auth.js` 云端拉取 — 已被 010+ 链覆盖 |

---

### 2026-05-21 · Phase A 基线

- 家长/学生模块、`001`–`008` 迁移入仓。

---

## 测试与验收

### QA 场景演练台（视觉验收，推荐）

本地：`http://localhost:<port>/dev/qa.html`

| 场景组 | 示例 |
|--------|------|
| 游客 | 初次使用、1 孩、2 孩 |
| 账户 | 单孩/多孩 × Basic/Premium；已登录尚无孩子 |
| 连击 | Basic 中断、Premium 有/无护盾 |

账户类型为 **localStorage 模拟**，不改 Supabase 真实订阅。

### Playwright（CI 冒烟）

```bash
npm install && npx playwright install chromium
npm test          # 自动起 python3 -m http.server 4173
npm run test:ui   # 可视化调试
```

---

## 待办（按优先级）

### P0 — 挡内测试用

- [ ] **题库上云**：对齐导入脚本与 010 schema，灌入并验证各科目/年级
- [ ] **Practice 重建**：接 `record_learning_session`；注册用户每日限制写 `daily_subject_completions`；完成后 Hub 数据一致

### P1 — 内测期间可并行

- [ ] 错题本上云（`student_mistakes_book`）
- [ ] 商店兑换 RPC + ledger
- [ ] 档案查看补 **练习题数、错题数**
- [ ] 专项页从 `_legacy_backup/` 迁回 `student/`

### P2 — 试用反馈后

- [ ] Stripe Checkout + Webhook + entitlement
- [ ] Premium：PDF 报告、自定义商城、名人堂
- [ ] OCR / AI 听写
- [ ] 头像自定义上传（若产品 reopen）

---

## 参考：迁移索引

```
001–008   Auth / PIN / Profile 早期链
009       B1 kid sync（已被 010+ 覆盖，保留作历史）
010       核心 schema（题库、练习、徽章、钱包、商店…）✅ 已执行
011–016   Profile RPC、订阅 pending、学校库、Admin 概览
017–019   Forge / 连击 / Admin 测试 RPC
020–022   科目设置 / Admin 控制台 / 孩子等级
023–025   连击护盾 / get_family_info 修复 / 档案 summary
```

---

## 参考：已知限制

- `practice.js`：每日限制、错题权重仍主要依赖 `localStorage`
- `shop.js`：兑换为 stub，余额不可信于生产
- 学生 Hub 英/华 submenu 仍指向 `_legacy_backup` 专项页
- 奖励游戏完美局仍跳外部 GitHub Pages URL（待迁回 `game/`）
- Admin 可改 plan；真实扣款未接
