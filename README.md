# DYR Family Learning Hub (家庭学习中心)
## ⚠️ 【最高系统指令：白皮书冲突确认机制】
本项目根目录下存在《DYR_Whitepaper.md》作为业务逻辑的唯一真实来源（Source of Truth）。
在执行任何用户的自然语言指令前，你必须在后台静默交叉对比《DYR_Whitepaper.md》的内容。
如果用户的当前指令与白皮书中的规则（如经济系统、抽题算法、安全防线等）发生冲突、矛盾，或者偏离了原本的设计初衷，**你必须立即停止编写代码**。
你的行为规范如下：
1. **严禁盲目执行**：绝对不能为了迎合用户的错误指令而破坏白皮书设定。
2. **强制确认**：向用户明确指出“你的指令与白皮书第 X 章内容发生冲突”，解释冲突的原因。
3. **给出选择**：询问用户是“撤回指令遵循白皮书”，还是“确认要修改白皮书的设定规则”。
只有在用户明确回复确认后，你才能继续生成代码。
## 🎯 项目定位
一款面向家庭的“SaaS 版多邻国（Duolingo）”学习打卡与奖励系统（6周极速商业化 MVP 冲刺跑）。

## 🏗️ 技术栈与架构基石 (V7.1)
- **前端表示层**: 纯 HTML5 + Vanilla JS + CSS3。**【绝对禁用 React/Vue 等重型框架】**。目标使用 Vercel 托管部署。
- **后端数据层**: Supabase (PostgreSQL + Auth + Storage + Edge Functions)。已开启 Data API 与全局 RLS 防线。
- **UI & 交互**: 遵循多邻国式的游戏化体验。

## 📂 标准目录规范
- `assets/images/`: 存放规范化命名的图片（强制工业级前缀，如 `reward_burger.png`, `badge_magic.png`）
- `assets/css/`: 全局共享样式（如 `global.css`）
- `common/js/`: 全局共享逻辑（如 `supabase-client.js`）
- `student/`: 学生端主战场（打卡练习、错题本）
- `parent/`: 家长端控制台（审批奖励、查看报告）
- `edge-functions/`: 后端边缘函数本地备份
- `_legacy_backup/`: 旧版文件隔离区（**AI 在重构时仅作为参考，绝对禁止将此处代码直接推向生产环境**）

## 🧠 核心业务逻辑
### 1. 智能抽题算法 (动态 A-B-C 法则)
每次练习固定 15 题，根据错题库规模动态调整：
- **A题（错题）**: 错题库 > 30 → 抽 5 题；≤ 30 → 抽 3 题。按权重加权随机抽取。
- **B题（降维复习）**: 固定 2 题（低一年级旧题）。
- **C题（新题）**: 填满至 15 题（15 - A - B，即 8 或 10 题）。

### 2. 动态错题本 (艾宾浩斯记忆)
- 错题初始权重为 3，再错 +1，答对 -1。
- 权重降为 0 时，正式移出错题本，回归普通题池。

## 💰 双轨经济系统与安全铁律
### 资产定义
- **水晶 (Crystal)**: 奖励毅力（每日练习打卡获得），可兑换现实商城中的普通商品（如冰淇淋）。
- **金币 (Gold)**: 奖励卓越（获得专属徽章/成就时掉落），可兑换高价值商品（如汉堡大餐）。
- **徽章系统**: 采用 PostgreSQL 的 `JSONB` 格式存储 (`badges_counters`)，支持无限扩展。

### 🛡️ 安全与账本铁律（AI 编码必读）
1. **禁止前端直写**: 前端绝对禁止通过 JS 直接修改金币/水晶余额。所有资产变动、高并发扣款必须走 Edge Function 或 RPC 触发数据库事务。
2. **解耦拆分**: 严格遵循大纲优先设计，单一 HTML/JS/CSS 文件绝对不能超过 **500 行**。表现、样式、逻辑必须彻底分离。
# DYR Family Learning Hub (家庭学习中心)

## 🎯 项目定位
一款面向家庭的“SaaS 版多邻国（Duolingo）”学习打卡与奖励系统（6周极速商业化 MVP 冲刺跑）。

## 🏗️ 技术栈与架构基石
- **前端表示层**: 纯 HTML5 + Vanilla JS + CSS3（绝对禁用 React/Vue）。使用 Vercel 托管部署。
- **后端数据层**: Supabase (PostgreSQL + Auth + Storage)。开启全局 RLS 防线。

## 🗄️ 数据库物理表结构 (Supabase/Postgres)
AI 编码或编写查询时，必须完全对接以下三张表：

1. **`public.questions` (大一统题库表)**
   - `id` (UUID, 主键)
   - `grade` (VARCHAR, 年级，如: P1, P3)
   - `subject` (VARCHAR, 学科，如: English, Math, Science, 华文)
   - `topic` (VARCHAR, 章节)
   - `type` (VARCHAR, 题型: MCQ, FITB, SPELLING)
   - `question_text` (TEXT, 题目内容)
   - `options` (TEXT, 选项，多选项用管道符 '|' 隔开)
   - `correct_answer` (TEXT, 正确答案)
   - `term` (VARCHAR, 学期，可为 NULL)

2. **`public.dict_chinese_characters` (独立生字元数据表)**
   - 专门供 `pinyinshooter`, `radical` 等小游戏只读调用，**无错题本挂钩**。
   - 字段: `id`(UUID), `grade`, `subject`, `topic`, `character`(生字), `pinyin`(带声调), `parts`(JSONB数组，如`["八","刀","皿"]`)

3. **`public.student_mistakes_book` (错题本中间表 - profiles的级联子表)**
   - 字段: `id`(UUID), `profile_id`(UUID), `question_id`(UUID), `weight`(INT, 0-3)
   - 联合唯一索引: `idx_student_q_unique (profile_id, question_id)` 确保记录不重复。