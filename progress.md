📦 项目进度总结报告 (V8.0)
🎯 整体状态
家庭学习系统已完成前端骨架 + 学生端核心模块 + Supabase 数据库大一统重构与数据全量灌入。代码已安全 commit 并 push 到 GitHub (andydang2007/HomeLearningHub)。旧版逻辑完全隔离在 _legacy_backup/，不进入生产路径。本地一次性迁移脚本及 5 个原始 CSV 题库在确认导入成功后已从根目录安全清除。
🛠️ 已完成开发进度
第一阶段：目录与资产规范
标准目录：assets/、common/js/、student/（含 subjects/、games/ 占位）、parent/（空，Git 暂不显示）。
资产重命名：全局图片移至 assets/images/，商品图正式规范化（如 reward_hamburger.png 等）。拼音模块图安全隔离在 student/subjects/pinyin/images/。
全局共享件：assets/css/global.css、common/js/supabase-client.js 已建好。
第二阶段：大一统题库与独立字库（最新重构成果）
我们彻底废除了旧的零散表结构，在云端完成了大一统关系型重构与全量数据灌入：
public.questions (大一统题库表)：全面合并了 English, Math, Science, 华文 四科的所有标准题目。字段包含 id(UUID), grade, subject, topic, type, question_text, options (管道符 | 分割), correct_answer, term。
public.dict_chinese_characters (独立生字元数据表)：单独存放华文生字、拼音和拆字部首（parts 字段采用高扩展性的 JSONB 数组，如 ["八", "刀", "皿"]）。此表无错题本挂钩，专门供未来 pinyinshooter、radical 等各种外围小游戏高性能只读抽卡。
资产大搬家：5 大 CSV 数据已全量清洗完毕，并在云端成功激活了 RLS（行级安全）防线。
第三阶段：学生练习模块与全新的动态切换算法
学生主控台 (student/index.html)：实现四科选择、双轨资产（金币/水晶）动态展示。
升级版动态抽题算法 (15题铁律)：
练习固定生成 15 道题。系统每次自动查询 student_mistakes_book 中该学生的活跃错题总数（weight > 0），并动态切换以下两套抽题模板：
【模式 A：3-2-10 黄金法则】（当活跃错题数 ≤ 30 题时触发）：3题优先错题 + 2题降维复习 (weight=0) + 10题当前年级未做新题。
【模式 B：5-2-8 强力消错法则】（当活跃错题数 >30 题时触发）：5题强力错题 + 2题降维复习 + 8题新题。
记忆曲线：初始权重为 3，用户在综合练习中做对一次减 1（3 → 2 → 1 → 0 移出）。再错则权重加 1，上限锁死为 8。草稿板、进度条、徽章流程、每日一次限制已自旧版重构进入状态机。
第四阶段：商店模块与双轨经济
UI 布局：student/shop.html 实现分区，严密划分为【水晶区（Crystal - 奖励毅力打卡）】与【金币区（Gold - 奖励卓越成就）】。
安全铁律：全量实施 requestRewardExchange() RPC 占位。前端绝对禁止通过 JS 直接修改任何资产余额或错题本，所有数据变动必须走后端安全事务。
第五阶段：Supabase 与细节体验优化
配置打通 supabase-client.js 的 URL 与 Publishable Key；临时 Mock Auth 填入 Valerie 真实 UUID。
建立 common/js/i18n.js（默认英文，首页提供语言开关，其他页读取 localStorage）。
全局去除了老旧的 DYR 前缀与 Google Apps Script 逻辑。修复了首页科目点击、AppI18n解构中断、空数组缓存及输入框自动聚焦等遗留碎 Bug。
📊 当前可运行程度清单
功能模块	运行状态	当前技术链路实现度
首页选科 → 进入练习	✅ 可用	前端主控台页面跳转与核心 UI 渲染已跑通。
从 Supabase 拉题并组卷	✅ 已打通	数据库结构已规范化，英数理华四科数据全量入库。
3-2-10 / 5-2-8 动态算法	✅ 逻辑已就位	前端状态机已写好，错题触发阈值 30 题的切换规则已锁定。
商店 UI + 兑换申请占位	✅ UI 在线	水晶/金币 Tab 隔离，后端消费逻辑预留。余额依赖 profiles 表。
登录 / 注册 / 真实 Auth	❌ 未做	当前为 Mock 用户（Valerie 临时 UUID）。
错题本从 localStorage 迁回云端	❌ 待对接	student_mistakes_book 物理表已建好，需将前端逻辑对接。
家长端控制台 (parent/)	❌ 未建	暂无页面，空文件夹。
Edge Functions / RPC 真实扣款	❌ 仅占位	需要在下一阶段编写真正的数据库事务。
学科小游戏（拼音射击等）	❌ 仅图片就位	属于后续增量模块，字库元数据已为其做好了独立预留。
📂 生产代码目录一览
HomeLearningHub/
├── assets/
│   ├── images/             # 5 张规范命名的商品 reward_*.png
│   └── css/
│       └── global.css      # 全局共享样式（含双币组件与 UI/CSS 专项铁律）
├── common/js/
│   ├── supabase-client.js  # Supabase 客户端配置
│   ├── auth.js             # 临时 Mock Auth 与 UUID
│   └── i18n.js             # 国际化语言包
├── student/
│   ├── index.html/.js/.css # 学生主控台（四科选择、资产展示）
│   ├── practice.html/.js   # 核心练习战场（内置 3-2-10 / 5-2-8 状态机）
│   ├── shop.html/.js/.css   # 双轨制积分商城（水晶/金币）
│   └── subjects/pinyin/images/ # 拼音游戏专用图片隔离区
├── parent/                 # 家长控制端（空，待建）
├── _legacy_backup/         # 旧版本代码隔离区（仅作重构参考）
└── README.md               # 核心系统宪法（包含最新 SQL 字典与动态算法描述）
🎯 下次继续的最高优先级任务
全面对接 student_mistakes_book：
修改 student/practice.js 的 fetchQuestions() 逻辑，正式对接云端错题本表。让它根据学生当前的活跃错题数，在前端完美拉取并实现 模式 A (3-2-10) 或 模式 B (5-2-8) 的精准组卷。
打通真实登录（Auth）与 profiles 余额展示：
接入 Supabase 的原生 Auth 登录注册，废除 Mock UUID。确保商店能实时读取 profiles 表中的 crystal_balance 和 gold_balance。
编写安全 RPC 扣款事务：
在 Supabase 后台编写安全扣款函数，确保前端调用 requestRewardExchange() 时，数据库能够原子化地“扣减余额 + 计入背包”。
追加样式微调铁律：
在让 Cursor 辅助后续样式调优时，务必提醒其遵循追加的 .cursorrules（只改皮毛，不踩地基），使用 Auto 模式只在 CSS 文件修补，确保不触碰任何 JS 账本逻辑。