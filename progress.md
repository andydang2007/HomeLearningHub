📦 项目进度总结报告 (V9.0)
📅 更新日期：2026-05-21

🎯 整体状态
家庭学习系统已完成 **Phase A：家长 Auth + PIN 门 + 孩子 Profile 建档（本地）**。学生端主控台支持多孩子切换、头像库、双语顶栏；家长端具备注册/登录/忘记密码、4 位 PIN 门、后台添加孩子档案。Supabase 侧已提供 `001`–`008` 迁移脚本（需按顺序在 SQL Editor 执行；PIN 哈希最终使用 **`007_pin_builtin_sha256.sql`**，勿再依赖 pgcrypto `digest()`）。代码在本地开发中，**尚未要求今日 commit**。

---

🛠️ 今日完成（2026-05-21）

### 一、家长端 Phase A（`parent/` 从空目录到可跑通）

| 模块 | 文件 | 说明 |
|------|------|------|
| 登录 / 注册 | `parent/index.html` + `index.js` | Supabase Auth；注册需**两遍密码**；**忘记密码** + 邮件重置后设新密码 |
| PIN 门 | `parent/pin.html` + `pin.js` | Disney+ 式 4 位 PIN；首次设 PIN 需确认；5 次错误前端锁定 |
| 家长后台 | `parent/dashboard.html` + `dashboard.js` | 查看/删除本机孩子；**Add Profile** 弹窗 |
| 样式 | `parent/parent.css` | 家长端紫色主题 |

**安全行为（已实现）：**
- 离开 `dashboard.html`（返回学习中心 / 关标签）→ **立即作废 PIN**（`AUTH.revokeParentPinGate()`），防止孩子交还设备后直入后台。
- PIN 校验 / 保存走 RPC：`verify_parent_pin`、`set_parent_pin`（禁止前端直读 `parent_pin` 哈希）。

### 二、公共认证层（`common/js/auth.js` 重写）

- `window.AUTH`：`getKidProfiles` / `addKidProfile` / `revokeParentPinGate` / 家长 session / PIN 节流。
- 保留 `getCurrentUser()` 兼容 `practice.js`、`shop.js`（仍读 `currentPlayer`）。
- 本机孩子档案上限 **3 人**（与 `Business.md` 家庭包一致，已由 4 人改为 3 人）。

### 三、学生主控台（`student/index`）

- 顶栏：**语言切换（左）** + **Parent Login（右）**。
- 无本地 session → 名字 + 年级 + **头像库（12 个，`avatar_id`）**；不再用 Boy/Girl 绑头像。
- **Switch User** 在多 Profile 间切换；i18n 在动态界面切换语言会刷新文案。
- 移除所有 **6~7** 目标提示文案（`i18n` + 副标题）。
- 年级按钮 **3×2 对称网格** + `clamp()` 响应式字号。

### 四、Profile 数据模型（今日定稿）

**`common/js/profile-catalog.js`**
- 头像：`avatar_id`（稳定 ID）→ emoji 展示；后期可接 `custom` + `avatar_url`。
- 科目分流（本阶段）：`CL`（华文）、`HCL`（高级华文）；`FCL` 预留 Phase B。
- **性别与头像解耦**：性别 `M`/`F` 单独字段，不从头像推断。

| 场景 | 字段 |
|------|------|
| 学生端进门（轻量） | 姓名、年级、头像 |
| 家长端建档（完整） | 姓名、年级、学校（**选填自由文本**）、性别、华文/高级华文、头像 |

**`supabase/migrations/008_profile_kid_fields.sql`**：云端 `profiles` 预留 `school_name`、`gender`、`chinese_level`、`avatar_id`（本机 `kid_profiles` 仍写 localStorage，尚未 RPC 同步）。

### 五、Supabase 迁移与踩坑记录

| 文件 | 用途 | 状态 |
|------|------|------|
| `003_profiles_upgrade_columns.sql` | 旧 `profiles` 表补列（`parent_user_id` 等） | 若表已存在必先跑 |
| `004_parent_auth_rpcs.sql` | RLS、触发器、PIN/孩子 RPC | 替代 `001` 后半段（避免 `$$` 语法截断） |
| `005_fix_profiles_username.sql` | 插入 profile 时填 `username` | 旧表 NOT NULL |
| `006_fix_digest_pgcrypto.sql` | 尝试 pgcrypto `digest()` | ⚠️ 托管环境仍可能失败 |
| **`007_pin_builtin_sha256.sql`** | **PIN 用内置 `sha256()`** | ✅ **当前应使用的 PIN 修复版** |
| `008_profile_kid_fields.sql` | 孩子扩展字段 | 可选，云端建档前跑 |

**运维备忘：**
- Auth **Site URL / Redirect URLs** 应设为 `http://127.0.0.1:5500/parent/index.html`（勿只用根路径 `/`）。
- 测试期可在 Supabase 关闭 **Confirm email**，注册后可直接登录。
- 早先注册用户可能只有 `auth.users` 无完整 `profiles` 行 → 设 PIN 时由 `005`/`007` 自动 upsert 家长行。

### 六、文档

- `Business.md`：家庭包 **最多 3 个孩子**；删除 `Speedy_Tiger` 随机昵称描述，改为真实姓名 + 未来 `school_id` RLS。

---

📊 当前可运行程度清单（更新）

| 功能模块 | 运行状态 | 说明 |
|----------|----------|------|
| 学生首页 / 练习 / 商店 UI | ✅ 可用 | 练习仍可用 Mock / 本地 `currentPlayer` |
| 学生多 Profile + 头像 | ✅ 本机 | `localStorage.kid_profiles` |
| 家长注册 / 登录 / 忘密 | ✅ 需配好 Supabase URL | 邮件确认取决于后台开关 |
| 家长 PIN 门 + 后台 | ✅ 需跑 **003→004→005→007**（008 可选） | 勿只跑 002 |
| 家长 Add Profile（完整字段） | ✅ 本机 | 学校文本、性别、华文/高华、头像 |
| 云端 kid profile 同步 | ❌ Phase B | `create_kid_profile` RPC 已有，前端未接 |
| 错题本云端 `student_mistakes_book` | ❌ Phase B | 算法前端已写，未接云表 |
| 题库按 CL / HCL 分流 | ❌ Phase B | `questions.subject` 需归类 + `practice.js` 过滤 |
| MOE 学校下拉 + 国际/私立 | ❌ Phase C | 当前 `school_name` 自由文本 |
| 商店 RPC 真实扣款 | ❌ | `requestRewardExchange` 仍占位 |
| 自定义头像上传 | ❌ 未来 | 规则见白皮书 Canvas 压缩 |

---

📂 生产代码目录一览（更新）

```
HomeLearningHub/
├── common/js/
│   ├── auth.js                 # AUTH 会话、本机 kid profiles、PIN 门状态
│   ├── profile-catalog.js      # 头像库、华文 CL/HCL、标签工具
│   ├── i18n.js
│   └── supabase-client.js
├── parent/
│   ├── index.html / index.js   # 登录、注册、忘密、重置密码
│   ├── pin.html / pin.js       # PIN 门
│   ├── dashboard.html / dashboard.js
│   └── parent.css
├── student/
│   ├── index.html / index.js / index.css
│   ├── practice.html / practice.js
│   └── shop.html / shop.js / shop.css
├── supabase/migrations/
│   ├── 003_profiles_upgrade_columns.sql
│   ├── 004_parent_auth_rpcs.sql
│   ├── 005_fix_profiles_username.sql
│   ├── 007_pin_builtin_sha256.sql   ← PIN 必跑
│   └── 008_profile_kid_fields.sql
├── _legacy_backup/
├── Business.md
└── progress.md（本文件）
```

---

🎯 下一阶段建议（按优先级）

### Phase B1 — 数据库与 Auth 收尾（建议最先做）

1. **确认 Supabase 迁移已就位**  
   新环境 checklist：`003` → `004` → `005` → `007`；需要云端字段时加 `008`。  
   用 SQL 验证：`verify_parent_pin`、`set_parent_pin`、`check_pin_exists` 存在。

2. **家长注册后云端孩子同步（RPC）**  
   - 调用已有 `create_kid_profile`（需扩展传入 `school_name`、`gender`、`chinese_level`、`avatar_id`）。  
   - 首次登录检测本机 `kid_profiles` → 弹窗「是否导入到家庭账户？」（幂等导入）。  
   - 学生端写入 `active_kid_profile_id`（UUID），替代纯字符串 `currentPlayer`。

3. **Auth 运维**  
   - 生产 Site URL 改为 GitHub Pages / 正式域名。  
   - 决定是否开启邮箱确认。

### Phase B2 — 学习数据上云（核心业务）

4. **`student_mistakes_book` 对接**  
   `practice.js`：读写云端错题本；按活跃错题数触发 **3-2-10 / 5-2-8** 组卷（替换纯 localStorage `hub_mistakes`）。

5. **题库华文分流**  
   - `questions` 表 `subject` 区分 `华文` / `高级华文`（及日后 `基础华文`）。  
   - `practice.js` 按孩子 `chineseLevel`（CL/HCL）过滤出题。  
   - 一次性数据清洗脚本（归类现有华文题）。

6. **`profiles` 余额**  
   商店 `fetchUserBalance()` 用真实 `profile_id` + RLS；仍禁止前端直改余额。

### Phase B3 — 经济与后台

7. **`requestRewardExchange` 真实 RPC**  
   原子扣款 + `coin_ledger` 审计 + 兑换单状态。

8. **家长后台增强**  
   审批兑换、基础学习统计（只读）、编辑孩子档案（含学校/科目）。

### Phase C — 学校与社交（产品化前）

9. **`public.schools` 表**（MOE + 常见国际/私立列表 +「其他」手填）。  
10. 排行榜 / 同校动态（RLS：`school_id` + `grade`）。  
11. 自定义头像（Canvas 200×200 / 50KB → Storage）。

---

⚠️ 今日未做 / 已知限制

- 家长与孩子 Profile **仍主要存本机** `localStorage`，换设备不同步。  
- `001_parent_auth.sql` 整份在 SQL Editor 可能因 `$$` 截断报错 → 用 **003 + 004 + 005 + 007** 组合。  
- `practice.js` 尚未使用 `chineseLevel` 查题。  
- 未 commit / push（按用户节奏自行提交）。

---

📌 下次开工第一句建议

> 「从 progress V9 Phase B1 开始：扩展 `create_kid_profile` + 本机 profile 导入云端。」
