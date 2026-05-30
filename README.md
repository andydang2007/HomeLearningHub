# Home Learning Hub

面向新加坡小学家庭的游戏化学习、徽章、打卡与家庭奖励系统。

## 文档入口

请优先阅读这两份文档：

| 文档 | 作用 |
|------|------|
| `Whitepaper.md` | 产品/设计文档：核心功能、徽章墙、练习、商店、奖励游戏、商业计划、界面逻辑 |
| `TECHNICAL.md` | 技术文档：架构、数据存储、Supabase 表/RPC、当前实现状态、迁移与安全边界 |

辅助文档：

| 文档 | 作用 |
|------|------|
| `ParentGuide.md` | **家长指南**：写给使用本系统的家长，将来挂家长端「帮助 / 说明书」入口；功能开关旁的「?」也会跳到这份文档对应段落 |
| `PROGRESS.md` | 当前进度、已知问题、下一阶段任务 |
| `dev/qa.html` | **视觉 QA 场景演练台**：切换游客/单孩/多孩/Basic/Premium/连击等场景，亲眼验收界面（本地 `http.server`） |
| `npm test` | Playwright E2E 冒烟（不能代替 `dev/qa.html` 视觉验收；见 `PROGRESS.md`） |
| `.cursorrules` | AI 编码规则、模型适用性评估、安全与文件边界 |
| `Business.md` | 历史商业计划归档，内容已并入 `Whitepaper.md` |

## 当前状态

- Phase A 已完成：家长 Auth、PIN 门、孩子本机 Profile、学生端 Hub、Forge、连击与护盾。
- Supabase 迁移 **001～025** 已在数据库执行（核心 schema 见 **010**，后续为 011～025 补丁）。
- 标准练习 `student/practice.html` 已从 Supabase `questions` 拉题，但练习结算 RPC、每日限制上云、错题本仍待接完。
- 距家庭内测试用：主要是 **题库灌入** + **Practice 页面重建**；Stripe 支付计划试用后再做。
- 错题本目前仍在本地 `localStorage.hub_mistakes`，后续上云。
- 商店资产与兑换仍需 RPC/账本化，前端不能直接写余额。

## 命名规则

- 统一使用 `Home Learning Hub` 作为内部项目名。
- `BrainDash` 可作为未来商业品牌候选。
- 旧三字母项目代号（D/Y/R 连写）禁止再作为文档标题、UI 文案、变量名、表名或新代码命名。

## 界面语言

- 词典：`i18n.js`（`en` / `zh`）；新功能**英文优先**，中文通过**一次性 i18n 专项**补全。
- **孩子界面语言**：每个孩子 `profiles.ui_lang`（家长后台设置）。
- **家长界面语言**：家庭全局 `parent_ui_lang`。
- 详见 `Whitepaper.md` §1.2。

## 技术栈

- HTML5
- Vanilla JavaScript
- CSS3
- Supabase PostgreSQL / Auth / RPC

禁止默认引入 React、Vue、Next、Vite、Webpack 等重型框架或构建工具，除非用户明确改变架构。

## 快速目录

```text
common/js/      共享 JS：Auth、i18n、profile catalog、Supabase client
student/        学生端首页、练习、商店
parent/         家长登录、PIN、dashboard
game/           目标生产目录：奖励游戏分发台和小游戏
supabase/       SQL migrations
_legacy_backup/ 历史参考代码，不直接推向生产
```