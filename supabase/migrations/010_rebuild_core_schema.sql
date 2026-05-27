-- =============================================================================
-- Migration 010: Rebuild Core Schema for Home Learning Hub
-- =============================================================================
-- 用途：
--   1. 清空并重建 public schema，替代 001-009 的历史补丁链。
--   2. 建立家庭账号、孩子档案、题库、练习、徽章、资产、商店、
--      OCR、订阅、合规与隐私请求等核心表。
--   3. 预置现有徽章定义；等级公式表先留空。
--
-- 执行前必读：
--   - 这是破坏性重建脚本：会 DROP SCHEMA public CASCADE。
--   - 只应在你确认要清空的 Supabase 项目执行。
--   - auth.users 不在 public schema 内，不会被本脚本删除；
--     但 public 下所有表、函数、policy 会被删除并重建。
--   - 执行前请先在 Supabase Dashboard 做备份。
--
-- 本文件只建空结构，不导入题库数据。题库导入在 010 跑通后另做。
-- =============================================================================

BEGIN;

-- =============================================================================
-- 0. Destructive reset
-- =============================================================================

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres, service_role;

CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- =============================================================================
-- 1. Enums
-- =============================================================================

CREATE TYPE public.profile_role AS ENUM ('parent', 'kid');
CREATE TYPE public.account_type AS ENUM ('single_child', 'multi_child');
CREATE TYPE public.plan_tier AS ENUM ('basic', 'premium');
CREATE TYPE public.ui_lang AS ENUM ('en', 'zh');
CREATE TYPE public.chinese_level AS ENUM ('CL', 'HCL', 'FCL');
CREATE TYPE public.gender_type AS ENUM ('M', 'F', 'unspecified');
CREATE TYPE public.subject_code AS ENUM (
  'english',
  'math',
  'science',
  'chinese',
  'spelling',
  'tingxie',
  'pinyin',
  'radical',
  'wordsearch'
);
CREATE TYPE public.scope_mode AS ENUM ('selected_scope', 'full_grade');
CREATE TYPE public.currency_code AS ENUM ('coin', 'crystal');
CREATE TYPE public.ledger_reason_code AS ENUM (
  'badge_award',
  'daily_checkin',
  'redemption_hold',
  'redemption_refund',
  'redemption_complete',
  'migration_opening_balance',
  'system_correction'
);
CREATE TYPE public.wallet_owner_type AS ENUM ('profile');
CREATE TYPE public.badge_category AS ENUM ('subject', 'skill', 'hidden', 'streak');
CREATE TYPE public.reward_item_type AS ENUM ('physical', 'non_physical');
CREATE TYPE public.redemption_status AS ENUM ('pending', 'approved', 'rejected_refunded', 'cancelled');
CREATE TYPE public.ticket_status AS ENUM ('available', 'spent', 'expired');
CREATE TYPE public.ocr_status AS ENUM ('uploaded', 'processing', 'needs_review', 'confirmed', 'rejected', 'expired', 'failed');
CREATE TYPE public.feedback_category AS ENUM ('question_issue', 'bug', 'experience', 'reward_suggestion', 'privacy', 'other');
CREATE TYPE public.feedback_status AS ENUM ('open', 'in_review', 'resolved', 'closed');
CREATE TYPE public.privacy_request_type AS ENUM ('export', 'correct', 'delete_child', 'delete_family', 'withdraw_consent');
CREATE TYPE public.privacy_request_status AS ENUM ('submitted', 'verifying', 'processing', 'completed', 'rejected', 'cancelled');
CREATE TYPE public.deletion_job_status AS ENUM ('queued', 'processing', 'completed', 'failed');
CREATE TYPE public.consent_scope AS ENUM ('family_account', 'child_profile', 'ocr_upload', 'leaderboard', 'marketing');
CREATE TYPE public.entitlement_source AS ENUM ('trial', 'paid', 'referral', 'manual');
CREATE TYPE public.entitlement_status AS ENUM ('active', 'expired', 'revoked', 'scheduled');
CREATE TYPE public.referral_status AS ENUM ('created', 'accepted', 'activated', 'expired', 'cancelled');

-- =============================================================================
-- 2. Shared utility functions
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sha256_hex(raw_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT encode(extensions.digest(convert_to(raw_value, 'UTF8'), 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.sgt_date(ts TIMESTAMPTZ DEFAULT now())
RETURNS DATE
LANGUAGE sql
STABLE
AS $$
  SELECT (ts AT TIME ZONE 'Asia/Singapore')::date;
$$;

CREATE OR REPLACE FUNCTION public.sgt_hour(ts TIMESTAMPTZ DEFAULT now())
RETURNS INT
LANGUAGE sql
STABLE
AS $$
  SELECT EXTRACT(HOUR FROM (ts AT TIME ZONE 'Asia/Singapore'))::int;
$$;

-- =============================================================================
-- 3. Identity, consent, privacy
-- =============================================================================

CREATE TABLE public.families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  account_type public.account_type NOT NULL DEFAULT 'single_child',
  plan_tier public.plan_tier NOT NULL DEFAULT 'basic',
  family_display_name TEXT,
  privacy_notice_version_accepted TEXT NOT NULL,
  adult_attestation BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CHECK (adult_attestation = true)
);
COMMENT ON TABLE public.families IS '家庭账号。只允许家长/监护人创建；孩子不能用邮箱注册账号。';
COMMENT ON COLUMN public.families.account_type IS 'single_child=只能 1 个孩子；multi_child=最多 3 个孩子。';
COMMENT ON COLUMN public.families.plan_tier IS 'basic/premium 功能范围相同，主要用于订阅/价格与 entitlement。';

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.profile_role NOT NULL,
  display_name TEXT NOT NULL,
  grade TEXT,
  avatar_id TEXT NOT NULL DEFAULT 'star',
  school_name TEXT,
  gender public.gender_type,
  chinese_level public.chinese_level,
  ui_lang public.ui_lang NOT NULL DEFAULT 'en',
  parent_pin_hash TEXT,
  parent_pin_fail_count INT NOT NULL DEFAULT 0,
  parent_pin_lock_until TIMESTAMPTZ,
  kid_pin_enabled BOOLEAN NOT NULL DEFAULT false,
  kid_pin_hash TEXT,
  kid_pin_fail_count INT NOT NULL DEFAULT 0,
  kid_pin_lock_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CHECK (
    (role = 'parent' AND user_id IS NOT NULL)
    OR
    (role = 'kid' AND user_id IS NULL)
  ),
  CHECK (role <> 'kid' OR grade IS NOT NULL)
);
COMMENT ON TABLE public.profiles IS '家长与孩子档案。孩子只用昵称 display_name；不鼓励真实姓名；孩子不是 auth 用户。';
COMMENT ON COLUMN public.profiles.school_name IS '可选；不进入名人堂，不用于同校社交。';
COMMENT ON COLUMN public.profiles.avatar_id IS 'MVP 只用默认头像库 ID；暂不允许上传真人头像。';

CREATE UNIQUE INDEX profiles_one_parent_per_family
  ON public.profiles(family_id)
  WHERE role = 'parent' AND deleted_at IS NULL;
CREATE INDEX profiles_family_role_idx ON public.profiles(family_id, role);
CREATE INDEX profiles_user_id_idx ON public.profiles(user_id);

CREATE TABLE public.consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  scope public.consent_scope NOT NULL,
  privacy_notice_version TEXT NOT NULL,
  adult_attestation BOOLEAN NOT NULL DEFAULT true,
  consented_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  withdrawn_at TIMESTAMPTZ,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
COMMENT ON TABLE public.consent_records IS '家长/监护人同意记录。注册、OCR、名人堂等范围分别记录。';

CREATE TABLE public.privacy_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  request_type public.privacy_request_type NOT NULL,
  status public.privacy_request_status NOT NULL DEFAULT 'submitted',
  requested_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
COMMENT ON TABLE public.privacy_requests IS '家长的数据导出、更正、删除、撤回同意请求。';

CREATE TABLE public.data_deletion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  request_id UUID REFERENCES public.privacy_requests(id) ON DELETE SET NULL,
  status public.deletion_job_status NOT NULL DEFAULT 'queued',
  target_type TEXT NOT NULL,
  target_id UUID,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
COMMENT ON TABLE public.data_deletion_jobs IS '删除孩子档案或家庭账号后的后台清理任务队列。';

CREATE TABLE public.data_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_category TEXT NOT NULL UNIQUE,
  retention_days INT,
  action_after_retention TEXT NOT NULL DEFAULT 'delete',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.data_retention_policies IS '数据保留期限配置。用于合规与后台清理任务。';

INSERT INTO public.data_retention_policies (data_category, retention_days, action_after_retention, notes) VALUES
  ('guest_local_data', 30, 'local_expiry_prompt', '游客本机数据最多保留 30 天；清缓存即丢。'),
  ('learning_details', 730, 'delete_or_anonymize', '学习明细、答题记录、错题状态 24 个月滚动保留。'),
  ('report_exports', 7, 'delete', '学习报告 PDF / 报告缓存 7 天。'),
  ('ocr_original_files', 30, 'delete', 'OCR 原图/PDF 在确认后最多 30 天。'),
  ('ocr_candidates', 30, 'delete', 'OCR 候选识别结果 30 天。'),
  ('parent_feedback', 730, 'anonymize', '家长反馈最多 24 个月，敏感信息优先清理。'),
  ('audit_security_logs', 730, 'delete_or_anonymize', '审计/安全日志最多 24 个月。'),
  ('payment_subscription_summary', NULL, 'minimal_required_retention', '按支付、税务、争议处理需要保留最小摘要。');

-- =============================================================================
-- 4. Settings and curriculum scope
-- =============================================================================

CREATE TABLE public.parent_settings (
  family_id UUID PRIMARY KEY REFERENCES public.families(id) ON DELETE CASCADE,
  parent_ui_lang public.ui_lang NOT NULL DEFAULT 'en',
  reward_game_tickets_required INT NOT NULL DEFAULT 2,
  leaderboard_enabled BOOLEAN NOT NULL DEFAULT false,
  dictation_source_mode TEXT NOT NULL DEFAULT 'prefer_custom_then_default'
    CHECK (dictation_source_mode IN ('prefer_custom_then_default', 'merge_custom_and_default', 'default_only')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.parent_settings IS '家庭级家长设置。名人堂默认关闭，由家长开启。';

CREATE TABLE public.profile_subject_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject public.subject_code NOT NULL,
  scope_mode public.scope_mode NOT NULL DEFAULT 'selected_scope',
  base_accuracy_pct INT NOT NULL DEFAULT 70 CHECK (base_accuracy_pct BETWEEN 0 AND 100),
  target_accuracy_pct INT NOT NULL DEFAULT 90 CHECK (target_accuracy_pct BETWEEN 0 AND 100),
  target_time_seconds INT CHECK (target_time_seconds IS NULL OR target_time_seconds > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, subject)
);
COMMENT ON TABLE public.profile_subject_settings IS '每孩每科设置：出题范围、基础正确率、目标正确率、目标完成时间。';

CREATE TABLE public.schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  school_type TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.schools IS '学校骨架表，010 先留空。学校名仍为可选字段，暂不做同校功能。';

CREATE TABLE public.subject_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject public.subject_code NOT NULL,
  grade TEXT NOT NULL,
  term INT,
  week_from INT,
  week_to INT,
  topic_code TEXT NOT NULL,
  title TEXT NOT NULL,
  parent_id UUID REFERENCES public.subject_topics(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(subject, grade, topic_code)
);
COMMENT ON TABLE public.subject_topics IS 'English/Math/Science 等 topic/chapter 目录。';

CREATE TABLE public.chinese_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade TEXT NOT NULL,
  term INT,
  week_from INT,
  week_to INT,
  lesson_no INT,
  lesson_code TEXT NOT NULL,
  title TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(grade, lesson_code)
);
COMMENT ON TABLE public.chinese_lessons IS '华文课文/第几课目录。';

CREATE TABLE public.profile_learning_scope (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject public.subject_code NOT NULL,
  topic_id UUID REFERENCES public.subject_topics(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES public.chinese_lessons(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  set_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (topic_id IS NOT NULL AND lesson_id IS NULL)
    OR
    (topic_id IS NULL AND lesson_id IS NOT NULL)
  )
);
COMMENT ON TABLE public.profile_learning_scope IS '家长为孩子点选的每科 topic/chapter/lesson 范围。';

CREATE UNIQUE INDEX profile_learning_scope_topic_unique
  ON public.profile_learning_scope(profile_id, subject, topic_id)
  WHERE topic_id IS NOT NULL;
CREATE UNIQUE INDEX profile_learning_scope_lesson_unique
  ON public.profile_learning_scope(profile_id, subject, lesson_id)
  WHERE lesson_id IS NOT NULL;

CREATE TABLE public.school_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_year INT NOT NULL,
  term INT,
  week_no INT,
  date_start_sgt DATE NOT NULL,
  date_end_sgt DATE NOT NULL,
  is_school_holiday BOOLEAN NOT NULL DEFAULT false,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (date_end_sgt >= date_start_sgt)
);
COMMENT ON TABLE public.school_calendar IS '新加坡学校日历。所有日期按 SGT 表达。';

-- =============================================================================
-- 5. Questions, sessions, mistakes
-- =============================================================================

CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject public.subject_code NOT NULL,
  grade TEXT NOT NULL,
  term INT,
  week_from INT,
  week_to INT,
  topic_id UUID REFERENCES public.subject_topics(id) ON DELETE SET NULL,
  lesson_id UUID REFERENCES public.chinese_lessons(id) ON DELETE SET NULL,
  difficulty INT NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  question_text TEXT NOT NULL,
  options JSONB,
  correct_answer TEXT NOT NULL,
  answer_explanation TEXT,
  source_type TEXT NOT NULL DEFAULT 'standard' CHECK (source_type IN ('standard', 'default_dictation', 'parent_imported')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.questions IS '标准题库。010 不导入题库数据，跑通后再导入。';
CREATE INDEX questions_subject_grade_idx ON public.questions(subject, grade, is_active);
CREATE INDEX questions_topic_idx ON public.questions(topic_id);
CREATE INDEX questions_lesson_idx ON public.questions(lesson_id);

CREATE TABLE public.learning_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject public.subject_code NOT NULL,
  grade TEXT NOT NULL,
  term INT,
  week_no INT,
  practice_date_sgt DATE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_seconds INT,
  total_questions INT NOT NULL DEFAULT 0,
  correct_count INT NOT NULL DEFAULT 0,
  accuracy NUMERIC(5,2),
  earned_badges INT NOT NULL DEFAULT 0,
  earned_tickets INT NOT NULL DEFAULT 0,
  mistakes_added INT NOT NULL DEFAULT 0,
  mistakes_cleared INT NOT NULL DEFAULT 0,
  scope_mode public.scope_mode,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.learning_sessions IS '单次练习宏观记录。每日/时段按 SGT 判定。';
CREATE INDEX learning_sessions_profile_date_idx ON public.learning_sessions(profile_id, practice_date_sgt DESC);

CREATE TABLE public.daily_subject_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject public.subject_code NOT NULL,
  practice_date_sgt DATE NOT NULL,
  session_id UUID REFERENCES public.learning_sessions(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, subject, practice_date_sgt)
);
COMMENT ON TABLE public.daily_subject_completions IS '注册后每日每科是否已完成。唯一键按 SGT 日期，防换机绕过。';

CREATE TABLE public.question_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.learning_sessions(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.questions(id) ON DELETE SET NULL,
  attempt_order INT NOT NULL,
  answer_given TEXT,
  normalized_answer TEXT,
  correct_answer_snapshot TEXT,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  time_spent_seconds INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, attempt_order)
);
COMMENT ON TABLE public.question_attempts IS '每题答题明细。用于报告和错题分析。';
CREATE INDEX question_attempts_profile_idx ON public.question_attempts(profile_id, created_at DESC);

CREATE TABLE public.student_mistakes_book (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  weight INT NOT NULL DEFAULT 1 CHECK (weight >= 0),
  wrong_answer_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_wrong_at TIMESTAMPTZ,
  last_correct_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, question_id)
);
COMMENT ON TABLE public.student_mistakes_book IS '当前错题状态。孩子端不展示独立错题本；家长报告可看错误答案。';

-- =============================================================================
-- 6. Badges, levels, wallets
-- =============================================================================

CREATE TABLE public.badge_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_code TEXT NOT NULL UNIQUE,
  display_name_en TEXT NOT NULL,
  display_name_zh TEXT,
  category public.badge_category NOT NULL,
  subject public.subject_code,
  icon TEXT,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.badge_definitions IS '徽章定义。010 预置现有徽章；后续可追加。';

INSERT INTO public.badge_definitions
  (badge_code, display_name_en, display_name_zh, category, subject, icon, is_hidden, description)
VALUES
  ('english_star', 'English Star', '英文之星', 'subject', 'english', '⭐', false, '英文基础练习达标'),
  ('math_genius', 'Math Genius', '数学天才', 'subject', 'math', '🧠', false, '数学基础练习达标'),
  ('science_pro', 'Science Pro', '科学达人', 'subject', 'science', '🔬', false, '科学基础练习达标'),
  ('chinese_ace', 'Chinese Ace', '华文高手', 'subject', 'chinese', '📖', false, '华文基础练习达标'),
  ('pinyin_pro', 'Pinyin Hero', '拼音英雄', 'subject', 'pinyin', '🎯', false, '拼音专项达标'),
  ('dictation_king', 'Dictation King', '听写之王', 'subject', 'tingxie', '✍️', false, '听写专项达标'),
  ('character_spirit', 'Character Spirit', '汉字精灵', 'subject', 'radical', '🌟', false, '部件/汉字结构专项达标'),
  ('sharpshooter', 'Sharpshooter', '神奇射手', 'skill', NULL, '🏹', false, '达到家长设置的目标正确率'),
  ('speed_record', 'Speed Record', '极速突破', 'skill', NULL, '⚡', false, '达到目标正确率并在目标时间内完成'),
  ('unlock_game', 'Unlock Game', '解锁游戏', 'skill', NULL, '🎮', false, '获得奖励游戏资格或首次进入奖励游戏系统'),
  ('early_bird', 'Early Bird', '早起鸟儿', 'hidden', NULL, '🌅', true, 'SGT 7:00 前完成达标练习'),
  ('night_owl', 'Night Owl', '小猫头鹰', 'hidden', NULL, '🦉', true, 'SGT 22:00 后完成达标练习'),
  ('hat_trick', 'Hat-trick', '全对三连', 'hidden', NULL, '🎩', true, '连续 3 次练习全对'),
  ('weekend_maniac', 'Weekend Maniac', '周末狂人', 'hidden', NULL, '🏆', true, '单个 SGT 周末获得 15 个以上徽章'),
  ('holiday_charge', 'Holiday Charge', '假期充电', 'hidden', NULL, '🔋', true, '新加坡小学假期期间累计打卡 15 天后触发'),
  ('streak_3', '3-Day Streak', '3 天连击', 'streak', NULL, '🔥', false, '连续打卡 3 天'),
  ('streak_5', '5-Day Streak', '5 天连击', 'streak', NULL, '🔥', false, '连续打卡 5 天'),
  ('streak_10', '10-Day Streak', '10 天连击', 'streak', NULL, '🔥', false, '连续打卡 10 天'),
  ('streak_15', '15-Day Streak', '15 天连击', 'streak', NULL, '🔥', false, '连续打卡 15 天'),
  ('streak_30', '30-Day Streak', '30 天连击', 'streak', NULL, '🔥', false, '连续打卡 30 天');

CREATE TABLE public.profile_badge_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES public.badge_definitions(id) ON DELETE CASCADE,
  count_available INT NOT NULL DEFAULT 0 CHECK (count_available >= 0),
  count_lifetime INT NOT NULL DEFAULT 0 CHECK (count_lifetime >= 0),
  current_streak INT NOT NULL DEFAULT 0,
  best_streak INT NOT NULL DEFAULT 0,
  last_awarded_date_sgt DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, badge_id)
);
COMMENT ON TABLE public.profile_badge_counters IS '每孩每种徽章的累计数量、可用数量与连击展示状态。';

CREATE TABLE public.badge_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES public.badge_definitions(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.learning_sessions(id) ON DELETE SET NULL,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  awarded_date_sgt DATE NOT NULL DEFAULT public.sgt_date(),
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
COMMENT ON TABLE public.badge_events IS '每次获得徽章事件。1 徽章 = 1 金币的资产联动由 RPC 处理。';
CREATE INDEX badge_events_profile_date_idx ON public.badge_events(profile_id, awarded_date_sgt DESC);

CREATE TABLE public.badge_level_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level_no INT NOT NULL UNIQUE CHECK (level_no > 0),
  tier_name TEXT NOT NULL,
  required_badges JSONB,
  required_crystals INT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.badge_level_config IS '等级/段位升级公式。010 先建空表，不预置公式。';

CREATE TABLE public.profile_badge_levels (
  profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  level_no INT NOT NULL DEFAULT 1,
  tier_name TEXT NOT NULL DEFAULT 'Bronze',
  badges_spent_lifetime INT NOT NULL DEFAULT 0,
  crystals_spent_lifetime INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.profile_badge_levels IS '每个孩子当前等级、段位和累计消耗。';

CREATE TABLE public.profile_wallets (
  profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  coin_balance INT NOT NULL DEFAULT 0 CHECK (coin_balance >= 0),
  crystal_balance INT NOT NULL DEFAULT 0 CHECK (crystal_balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.profile_wallets IS '孩子档案名下金币和个人水晶余额。前端禁止直写。';

CREATE TABLE public.wallet_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  currency public.currency_code NOT NULL,
  amount INT NOT NULL,
  balance_after INT,
  reason_code public.ledger_reason_code NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  created_by TEXT NOT NULL DEFAULT 'rpc',
  trace_id UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CHECK (amount <> 0)
);
COMMENT ON TABLE public.wallet_ledger IS '金币/水晶全量流水，用于对账、防作弊、排错；家长界面默认不展示。';
CREATE INDEX wallet_ledger_profile_idx ON public.wallet_ledger(profile_id, created_at DESC);

-- =============================================================================
-- 7. Rewards, tickets, games
-- =============================================================================

CREATE TABLE public.reward_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  item_type public.reward_item_type NOT NULL,
  currency public.currency_code NOT NULL,
  price INT NOT NULL CHECK (price > 0),
  stock_quantity INT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (item_type = 'physical' AND currency = 'coin')
    OR
    (item_type = 'non_physical' AND currency = 'crystal')
  )
);
COMMENT ON TABLE public.reward_catalog IS '家长奖励商品。实物用金币，非实物用水晶。';

CREATE TABLE public.reward_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reward_id UUID NOT NULL REFERENCES public.reward_catalog(id) ON DELETE RESTRICT,
  status public.redemption_status NOT NULL DEFAULT 'pending',
  currency public.currency_code NOT NULL,
  price INT NOT NULL CHECK (price > 0),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  parent_note TEXT,
  ledger_hold_id UUID REFERENCES public.wallet_ledger(id) ON DELETE SET NULL,
  ledger_refund_id UUID REFERENCES public.wallet_ledger(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.reward_redemptions IS '兑换申请与家长审批。拒绝时应退款。无需兑换码。';

CREATE TABLE public.game_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.learning_sessions(id) ON DELETE SET NULL,
  status public.ticket_status NOT NULL DEFAULT 'available',
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  spent_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
COMMENT ON TABLE public.game_tickets IS '奖励游戏 ticket。2 张可玩一次 2-3 分钟奖励游戏。';

CREATE TABLE public.game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  game_code TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INT,
  ticket_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
COMMENT ON TABLE public.game_sessions IS '奖励游戏游玩记录。游戏不承担学习判分。';

-- =============================================================================
-- 8. OCR, dictation, parent imported content
-- =============================================================================

CREATE TABLE public.ocr_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  uploaded_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject public.subject_code NOT NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'ocr_uploads',
  storage_path TEXT NOT NULL,
  original_filename TEXT,
  mime_type TEXT,
  file_size_bytes INT,
  status public.ocr_status NOT NULL DEFAULT 'uploaded',
  provider TEXT,
  provider_request_id TEXT,
  allow_training BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
COMMENT ON TABLE public.ocr_uploads IS '家长上传 OCR 文件。默认不允许第三方训练；原始文件 30 天内清理。';

CREATE TABLE public.ocr_extracted_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  upload_id UUID NOT NULL REFERENCES public.ocr_uploads(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  extracted_text TEXT NOT NULL,
  structured_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status public.ocr_status NOT NULL DEFAULT 'needs_review',
  confirmed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.ocr_extracted_items IS 'AI/OCR 识别候选项。必须家长确认后才可进入孩子练习内容。';

CREATE TABLE public.default_spelling_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade TEXT NOT NULL,
  term INT,
  week_no INT,
  word TEXT NOT NULL,
  example_sentence TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.default_spelling_lists IS '系统默认英文听写表。不上传也能用。';

CREATE TABLE public.default_tingxie_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade TEXT NOT NULL,
  term INT,
  week_no INT,
  lesson_no INT,
  hanzi TEXT NOT NULL,
  pinyin TEXT,
  example_sentence TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.default_tingxie_lists IS '系统默认华文听写表。';

CREATE TABLE public.custom_spelling_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  example_sentence TEXT,
  source_upload_id UUID REFERENCES public.ocr_uploads(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.custom_spelling_lists IS '家长确认后的英文听写表，仅本孩可见。';

CREATE TABLE public.custom_tingxie_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  hanzi TEXT NOT NULL,
  pinyin TEXT,
  example_sentence TEXT,
  lesson_no INT,
  source_upload_id UUID REFERENCES public.ocr_uploads(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.custom_tingxie_lists IS '家长确认后的华文听写表，仅本孩可见。';

CREATE TABLE public.parent_imported_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject public.subject_code NOT NULL,
  grade TEXT NOT NULL,
  question_text TEXT NOT NULL,
  options JSONB,
  correct_answer TEXT NOT NULL,
  answer_explanation TEXT,
  source_upload_id UUID REFERENCES public.ocr_uploads(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.parent_imported_questions IS '家长上传错题/自定义题，仅绑定指定孩子，不进入公共题库。';

-- =============================================================================
-- 9. Subscription, referrals, leaderboard, reports, feedback
-- =============================================================================

CREATE TABLE public.subscription_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  account_type public.account_type NOT NULL,
  plan_tier public.plan_tier NOT NULL DEFAULT 'premium',
  source public.entitlement_source NOT NULL,
  status public.entitlement_status NOT NULL DEFAULT 'active',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  external_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.subscription_entitlements IS '高级版 entitlement。需区分一孩/多孩与基础/高级。';

CREATE TABLE public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  referred_family_id UUID REFERENCES public.families(id) ON DELETE SET NULL,
  referral_code TEXT NOT NULL UNIQUE,
  status public.referral_status NOT NULL DEFAULT 'created',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);
COMMENT ON TABLE public.referrals IS '邀请裂变记录。家长指南暂不展示该机制。';

CREATE TABLE public.leaderboard_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  grade TEXT NOT NULL,
  nickname_snapshot TEXT NOT NULL,
  tier_name TEXT NOT NULL,
  level_no INT NOT NULL,
  sort_score INT NOT NULL DEFAULT 0,
  period_start_sgt DATE,
  period_end_sgt DATE,
  is_visible BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, period_start_sgt, period_end_sgt)
);
COMMENT ON TABLE public.leaderboard_entries IS '名人堂条目。不可搜索；只展示昵称与级别/段位，不展示学校、性别、精确分数。';

CREATE VIEW public.leaderboard_public_v AS
SELECT
  id,
  grade,
  nickname_snapshot,
  tier_name,
  level_no,
  period_start_sgt,
  period_end_sgt
FROM public.leaderboard_entries
WHERE is_visible = true;
COMMENT ON VIEW public.leaderboard_public_v IS '名人堂公开视图：最小字段，不含 profile_id/family_id/sort_score。';

CREATE TABLE public.learning_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_start_sgt DATE NOT NULL,
  period_end_sgt DATE NOT NULL,
  report_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  pdf_bucket TEXT DEFAULT 'report_exports',
  pdf_path TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end_sgt >= period_start_sgt)
);
COMMENT ON TABLE public.learning_reports IS '学习报告缓存。PDF/缓存 7 天，家长可自行保存。';

CREATE TABLE public.parent_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  question_id UUID REFERENCES public.questions(id) ON DELETE SET NULL,
  submitted_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category public.feedback_category NOT NULL DEFAULT 'other',
  status public.feedback_status NOT NULL DEFAULT 'open',
  title TEXT,
  message TEXT NOT NULL,
  contains_sensitive_data BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 months'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.parent_feedback IS '家长反馈与建议。提醒不要填写 NRIC、地址、电话等敏感信息。';

-- =============================================================================
-- 10. Helper functions for RLS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.current_family_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p.family_id
  FROM public.profiles p
  JOIN public.families f ON f.id = p.family_id
  WHERE p.user_id = auth.uid()
    AND p.role = 'parent'
    AND p.deleted_at IS NULL
    AND f.deleted_at IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_family_parent(target_family_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT target_family_id IS NOT NULL AND target_family_id = public.current_family_id();
$$;

CREATE OR REPLACE FUNCTION public.profile_belongs_to_current_family(target_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = target_profile_id
      AND p.family_id = public.current_family_id()
      AND p.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.current_parent_profile_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p.id
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
    AND p.role = 'parent'
    AND p.deleted_at IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.max_kids_for_account(target_family_id UUID)
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE WHEN f.account_type = 'multi_child' THEN 3 ELSE 1 END
  FROM public.families f
  WHERE f.id = target_family_id;
$$;

-- =============================================================================
-- 11. Core RPCs
-- =============================================================================

CREATE OR REPLACE FUNCTION public.register_family(
  p_parent_display_name TEXT,
  p_account_type public.account_type,
  p_parent_ui_lang public.ui_lang DEFAULT 'en',
  p_privacy_notice_version TEXT DEFAULT '2026-05-27',
  p_adult_attestation BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_family_id UUID;
  v_parent_profile_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_adult_attestation IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Parent/guardian confirmation is required';
  END IF;

  SELECT id INTO v_family_id
  FROM public.families
  WHERE owner_user_id = v_user_id
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_family_id IS NULL THEN
    INSERT INTO public.families (
      owner_user_id,
      account_type,
      plan_tier,
      privacy_notice_version_accepted,
      adult_attestation,
      family_display_name
    )
    VALUES (
      v_user_id,
      COALESCE(p_account_type, 'single_child'),
      'basic',
      p_privacy_notice_version,
      true,
      NULLIF(trim(p_parent_display_name), '')
    )
    RETURNING id INTO v_family_id;

    INSERT INTO public.profiles (
      family_id,
      user_id,
      role,
      display_name,
      ui_lang
    )
    VALUES (
      v_family_id,
      v_user_id,
      'parent',
      COALESCE(NULLIF(trim(p_parent_display_name), ''), 'Parent'),
      COALESCE(p_parent_ui_lang, 'en')
    )
    RETURNING id INTO v_parent_profile_id;

    INSERT INTO public.parent_settings (family_id, parent_ui_lang)
    VALUES (v_family_id, COALESCE(p_parent_ui_lang, 'en'));

    INSERT INTO public.consent_records (
      family_id,
      scope,
      privacy_notice_version,
      adult_attestation,
      consented_by_user_id
    )
    VALUES (
      v_family_id,
      'family_account',
      p_privacy_notice_version,
      true,
      v_user_id
    );

    INSERT INTO public.subscription_entitlements (
      family_id,
      account_type,
      plan_tier,
      source,
      status,
      starts_at,
      ends_at
    )
    VALUES (
      v_family_id,
      COALESCE(p_account_type, 'single_child'),
      'premium',
      'trial',
      'active',
      now(),
      now() + interval '30 days'
    );
  END IF;

  RETURN v_family_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_parent_pin(raw_pin TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF raw_pin !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'Parent PIN must be exactly 4 digits';
  END IF;

  UPDATE public.profiles
  SET parent_pin_hash = public.sha256_hex(raw_pin),
      parent_pin_fail_count = 0,
      parent_pin_lock_until = NULL,
      updated_at = now()
  WHERE user_id = auth.uid()
    AND role = 'parent'
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent profile not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_parent_pin(raw_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_ok BOOLEAN;
  v_backoff_seconds INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE user_id = auth.uid()
    AND role = 'parent'
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_profile.id IS NULL OR v_profile.parent_pin_hash IS NULL THEN
    RETURN false;
  END IF;

  IF v_profile.parent_pin_lock_until IS NOT NULL AND v_profile.parent_pin_lock_until > now() THEN
    RETURN false;
  END IF;

  v_ok := v_profile.parent_pin_hash = public.sha256_hex(raw_pin);

  IF v_ok THEN
    UPDATE public.profiles
    SET parent_pin_fail_count = 0,
        parent_pin_lock_until = NULL,
        updated_at = now()
    WHERE id = v_profile.id;
    RETURN true;
  END IF;

  v_backoff_seconds := CASE
    WHEN v_profile.parent_pin_fail_count + 1 >= 5
      THEN LEAST(30 * (2 ^ LEAST((v_profile.parent_pin_fail_count + 1) - 5, 5))::int, 960)
    ELSE 0
  END;

  UPDATE public.profiles
  SET parent_pin_fail_count = parent_pin_fail_count + 1,
      parent_pin_lock_until = CASE WHEN v_backoff_seconds > 0 THEN now() + make_interval(secs => v_backoff_seconds) ELSE NULL END,
      updated_at = now()
  WHERE id = v_profile.id;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_pin_exists()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = auth.uid()
      AND role = 'parent'
      AND parent_pin_hash IS NOT NULL
      AND deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.create_kid_profile(
  p_display_name TEXT,
  p_grade TEXT,
  p_avatar_id TEXT DEFAULT 'star',
  p_school_name TEXT DEFAULT NULL,
  p_gender public.gender_type DEFAULT NULL,
  p_chinese_level public.chinese_level DEFAULT 'CL',
  p_ui_lang public.ui_lang DEFAULT 'en'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id UUID := public.current_family_id();
  v_kid_count INT;
  v_max_kids INT;
  v_new_id UUID;
  v_subject public.subject_code;
BEGIN
  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Family not found';
  END IF;

  IF p_display_name IS NULL OR length(trim(p_display_name)) = 0 THEN
    RAISE EXCEPTION 'Nickname is required';
  END IF;

  SELECT COUNT(*) INTO v_kid_count
  FROM public.profiles
  WHERE family_id = v_family_id
    AND role = 'kid'
    AND deleted_at IS NULL;

  v_max_kids := public.max_kids_for_account(v_family_id);

  IF v_kid_count >= v_max_kids THEN
    RAISE EXCEPTION 'Kid profile limit reached for this account type';
  END IF;

  INSERT INTO public.profiles (
    family_id,
    role,
    display_name,
    grade,
    avatar_id,
    school_name,
    gender,
    chinese_level,
    ui_lang
  )
  VALUES (
    v_family_id,
    'kid',
    trim(p_display_name),
    p_grade,
    COALESCE(NULLIF(trim(p_avatar_id), ''), 'star'),
    NULLIF(trim(p_school_name), ''),
    p_gender,
    COALESCE(p_chinese_level, 'CL'),
    COALESCE(p_ui_lang, 'en')
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.profile_wallets (profile_id, family_id)
  VALUES (v_new_id, v_family_id);

  INSERT INTO public.profile_badge_levels (profile_id, family_id)
  VALUES (v_new_id, v_family_id);

  FOREACH v_subject IN ARRAY ARRAY['english','math','science','chinese']::public.subject_code[] LOOP
    INSERT INTO public.profile_subject_settings (profile_id, subject)
    VALUES (v_new_id, v_subject);
  END LOOP;

  INSERT INTO public.consent_records (
    family_id,
    profile_id,
    scope,
    privacy_notice_version,
    adult_attestation,
    consented_by_user_id
  )
  VALUES (
    v_family_id,
    v_new_id,
    'child_profile',
    (SELECT privacy_notice_version_accepted FROM public.families WHERE id = v_family_id),
    true,
    auth.uid()
  );

  RETURN v_new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_kid_profiles()
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(json_agg(row_to_json(k) ORDER BY k.created_at), '[]'::json)
  FROM (
    SELECT
      id,
      display_name,
      grade,
      avatar_id,
      school_name,
      gender,
      chinese_level,
      ui_lang,
      kid_pin_enabled,
      created_at
    FROM public.profiles
    WHERE family_id = public.current_family_id()
      AND role = 'kid'
      AND deleted_at IS NULL
    ORDER BY created_at
  ) k;
$$;

CREATE OR REPLACE FUNCTION public.set_kid_pin(kid_profile_id UUID, raw_pin TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.profile_belongs_to_current_family(kid_profile_id) THEN
    RAISE EXCEPTION 'Kid profile not found';
  END IF;

  IF raw_pin !~ '^\d{3}$' THEN
    RAISE EXCEPTION 'Kid PIN must be exactly 3 digits';
  END IF;

  UPDATE public.profiles
  SET kid_pin_enabled = true,
      kid_pin_hash = public.sha256_hex(raw_pin),
      kid_pin_fail_count = 0,
      kid_pin_lock_until = NULL,
      updated_at = now()
  WHERE id = kid_profile_id
    AND role = 'kid';
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_kid_pin(kid_profile_id UUID, raw_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_ok BOOLEAN;
  v_backoff_seconds INT;
BEGIN
  IF NOT public.profile_belongs_to_current_family(kid_profile_id) THEN
    RETURN false;
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = kid_profile_id
    AND role = 'kid'
    AND deleted_at IS NULL;

  IF v_profile.id IS NULL THEN
    RETURN false;
  END IF;

  IF v_profile.kid_pin_enabled IS FALSE THEN
    RETURN true;
  END IF;

  IF v_profile.kid_pin_lock_until IS NOT NULL AND v_profile.kid_pin_lock_until > now() THEN
    RETURN false;
  END IF;

  v_ok := v_profile.kid_pin_hash = public.sha256_hex(raw_pin);

  IF v_ok THEN
    UPDATE public.profiles
    SET kid_pin_fail_count = 0,
        kid_pin_lock_until = NULL,
        updated_at = now()
    WHERE id = kid_profile_id;
    RETURN true;
  END IF;

  v_backoff_seconds := CASE
    WHEN v_profile.kid_pin_fail_count + 1 >= 5
      THEN LEAST(30 * (2 ^ LEAST((v_profile.kid_pin_fail_count + 1) - 5, 5))::int, 960)
    ELSE 0
  END;

  UPDATE public.profiles
  SET kid_pin_fail_count = kid_pin_fail_count + 1,
      kid_pin_lock_until = CASE WHEN v_backoff_seconds > 0 THEN now() + make_interval(secs => v_backoff_seconds) ELSE NULL END,
      updated_at = now()
  WHERE id = kid_profile_id;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.disable_kid_pin(kid_profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.profile_belongs_to_current_family(kid_profile_id) THEN
    RAISE EXCEPTION 'Kid profile not found';
  END IF;

  UPDATE public.profiles
  SET kid_pin_enabled = false,
      kid_pin_hash = NULL,
      kid_pin_fail_count = 0,
      kid_pin_lock_until = NULL,
      updated_at = now()
  WHERE id = kid_profile_id
    AND role = 'kid';
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_kid_pin(kid_profile_id UUID, new_pin TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.set_kid_pin(kid_profile_id, new_pin);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_daily_checkin(kid_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id UUID := public.current_family_id();
  v_today DATE := public.sgt_date();
  v_badges_today INT;
  v_wallet public.profile_wallets%ROWTYPE;
BEGIN
  IF NOT public.profile_belongs_to_current_family(kid_profile_id) THEN
    RAISE EXCEPTION 'Kid profile not found';
  END IF;

  SELECT COUNT(*) INTO v_badges_today
  FROM public.badge_events
  WHERE profile_id = kid_profile_id
    AND awarded_date_sgt = v_today;

  IF v_badges_today < 1 THEN
    RAISE EXCEPTION 'At least one badge is required to unlock daily crystal';
  END IF;

  -- 防重复：同一天 daily_checkin 只记一次。
  IF EXISTS (
    SELECT 1 FROM public.wallet_ledger
    WHERE profile_id = kid_profile_id
      AND currency = 'crystal'
      AND reason_code = 'daily_checkin'
      AND (created_at AT TIME ZONE 'Asia/Singapore')::date = v_today
  ) THEN
    SELECT * INTO v_wallet FROM public.profile_wallets WHERE profile_id = kid_profile_id;
    RETURN jsonb_build_object('already_checked_in', true, 'crystal_balance', v_wallet.crystal_balance);
  END IF;

  UPDATE public.profile_wallets
  SET crystal_balance = crystal_balance + 1,
      updated_at = now()
  WHERE profile_id = kid_profile_id
  RETURNING * INTO v_wallet;

  INSERT INTO public.wallet_ledger (
    family_id, profile_id, currency, amount, balance_after, reason_code, created_by
  )
  VALUES (
    v_family_id, kid_profile_id, 'crystal', 1, v_wallet.crystal_balance, 'daily_checkin', 'rpc'
  );

  RETURN jsonb_build_object('already_checked_in', false, 'crystal_balance', v_wallet.crystal_balance);
END;
$$;

-- 练习结算 RPC：MVP 骨架。
-- 前端改造时应把 session、attempts、badge、wallet、daily completion 合并到这里做原子事务。
CREATE OR REPLACE FUNCTION public.record_learning_session(
  kid_profile_id UUID,
  p_subject public.subject_code,
  p_grade TEXT,
  p_duration_seconds INT,
  p_total_questions INT,
  p_correct_count INT,
  p_attempts JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id UUID := public.current_family_id();
  v_today DATE := public.sgt_date();
  v_settings public.profile_subject_settings%ROWTYPE;
  v_session_id UUID;
  v_accuracy NUMERIC(5,2);
  v_badge_id UUID;
  v_wallet public.profile_wallets%ROWTYPE;
  v_earned_badges INT := 0;
BEGIN
  IF NOT public.profile_belongs_to_current_family(kid_profile_id) THEN
    RAISE EXCEPTION 'Kid profile not found';
  END IF;

  SELECT * INTO v_settings
  FROM public.profile_subject_settings
  WHERE profile_id = kid_profile_id AND subject = p_subject;

  IF v_settings.id IS NULL THEN
    RAISE EXCEPTION 'Subject settings not found';
  END IF;

  IF p_total_questions <= 0 THEN
    RAISE EXCEPTION 'total questions must be positive';
  END IF;

  v_accuracy := round((p_correct_count::numeric / p_total_questions::numeric) * 100, 2);

  INSERT INTO public.learning_sessions (
    family_id, profile_id, subject, grade, practice_date_sgt,
    completed_at, duration_seconds, total_questions, correct_count, accuracy, scope_mode
  )
  VALUES (
    v_family_id, kid_profile_id, p_subject, p_grade, v_today,
    now(), p_duration_seconds, p_total_questions, p_correct_count, v_accuracy, v_settings.scope_mode
  )
  RETURNING id INTO v_session_id;

  INSERT INTO public.daily_subject_completions (
    family_id, profile_id, subject, practice_date_sgt, session_id
  )
  VALUES (v_family_id, kid_profile_id, p_subject, v_today, v_session_id);

  -- 达到基础正确率：科目徽章 + 1 金币。
  IF v_accuracy >= v_settings.base_accuracy_pct THEN
    SELECT id INTO v_badge_id
    FROM public.badge_definitions
    WHERE subject = p_subject AND category = 'subject' AND is_active = true
    LIMIT 1;

    IF v_badge_id IS NOT NULL THEN
      INSERT INTO public.badge_events (family_id, profile_id, badge_id, session_id, awarded_date_sgt, reason)
      VALUES (v_family_id, kid_profile_id, v_badge_id, v_session_id, v_today, 'base_accuracy');

      INSERT INTO public.profile_badge_counters (family_id, profile_id, badge_id, count_available, count_lifetime, last_awarded_date_sgt)
      VALUES (v_family_id, kid_profile_id, v_badge_id, 1, 1, v_today)
      ON CONFLICT (profile_id, badge_id)
      DO UPDATE SET
        count_available = public.profile_badge_counters.count_available + 1,
        count_lifetime = public.profile_badge_counters.count_lifetime + 1,
        last_awarded_date_sgt = EXCLUDED.last_awarded_date_sgt,
        updated_at = now();

      UPDATE public.profile_wallets
      SET coin_balance = coin_balance + 1,
          updated_at = now()
      WHERE profile_id = kid_profile_id
      RETURNING * INTO v_wallet;

      INSERT INTO public.wallet_ledger (
        family_id, profile_id, currency, amount, balance_after, reason_code, reference_type, reference_id, created_by
      )
      VALUES (
        v_family_id, kid_profile_id, 'coin', 1, v_wallet.coin_balance, 'badge_award', 'learning_session', v_session_id, 'rpc'
      );

      v_earned_badges := v_earned_badges + 1;
    END IF;

    INSERT INTO public.game_tickets (family_id, profile_id, session_id)
    VALUES (v_family_id, kid_profile_id, v_session_id);
  END IF;

  UPDATE public.learning_sessions
  SET earned_badges = v_earned_badges,
      earned_tickets = CASE WHEN v_accuracy >= v_settings.base_accuracy_pct THEN 1 ELSE 0 END,
      updated_at = now()
  WHERE id = v_session_id;

  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'practice_date_sgt', v_today,
    'accuracy', v_accuracy,
    'earned_badges', v_earned_badges,
    'earned_ticket', v_accuracy >= v_settings.base_accuracy_pct
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_privacy_request(
  p_request_type public.privacy_request_type,
  p_profile_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id UUID := public.current_family_id();
  v_request_id UUID;
BEGIN
  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Family not found';
  END IF;

  IF p_profile_id IS NOT NULL AND NOT public.profile_belongs_to_current_family(p_profile_id) THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  INSERT INTO public.privacy_requests (
    family_id, profile_id, request_type, requested_by_user_id, notes
  )
  VALUES (
    v_family_id, p_profile_id, p_request_type, auth.uid(), p_notes
  )
  RETURNING id INTO v_request_id;

  IF p_request_type IN ('delete_child', 'delete_family') THEN
    INSERT INTO public.data_deletion_jobs (
      family_id,
      profile_id,
      request_id,
      target_type,
      target_id
    )
    VALUES (
      v_family_id,
      p_profile_id,
      v_request_id,
      CASE WHEN p_request_type = 'delete_family' THEN 'family' ELSE 'profile' END,
      COALESCE(p_profile_id, v_family_id)
    );
  END IF;

  RETURN v_request_id;
END;
$$;

-- =============================================================================
-- 12. RLS
-- =============================================================================

-- Enable RLS for all public tables/views that store data.
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_deletion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_subject_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subject_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chinese_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_learning_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_subject_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_mistakes_book ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badge_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_badge_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badge_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badge_level_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_badge_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_extracted_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.default_spelling_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.default_tingxie_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_spelling_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_tingxie_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_imported_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_feedback ENABLE ROW LEVEL SECURITY;

-- Family-owned read policies.
CREATE POLICY families_select_own ON public.families
  FOR SELECT USING (id = public.current_family_id());
CREATE POLICY profiles_select_family ON public.profiles
  FOR SELECT USING (family_id = public.current_family_id());

CREATE POLICY family_select_parent_settings ON public.parent_settings
  FOR SELECT USING (family_id = public.current_family_id());
CREATE POLICY family_select_profile_subject_settings ON public.profile_subject_settings
  FOR SELECT USING (public.profile_belongs_to_current_family(profile_id));
CREATE POLICY family_select_profile_learning_scope ON public.profile_learning_scope
  FOR SELECT USING (public.profile_belongs_to_current_family(profile_id));
CREATE POLICY family_select_learning_sessions ON public.learning_sessions
  FOR SELECT USING (family_id = public.current_family_id());
CREATE POLICY family_select_daily_subject_completions ON public.daily_subject_completions
  FOR SELECT USING (family_id = public.current_family_id());
CREATE POLICY family_select_question_attempts ON public.question_attempts
  FOR SELECT USING (family_id = public.current_family_id());
CREATE POLICY family_select_student_mistakes_book ON public.student_mistakes_book
  FOR SELECT USING (family_id = public.current_family_id());
CREATE POLICY family_select_profile_badge_counters ON public.profile_badge_counters
  FOR SELECT USING (family_id = public.current_family_id());
CREATE POLICY family_select_badge_events ON public.badge_events
  FOR SELECT USING (family_id = public.current_family_id());
CREATE POLICY family_select_profile_badge_levels ON public.profile_badge_levels
  FOR SELECT USING (family_id = public.current_family_id());
CREATE POLICY family_select_profile_wallets ON public.profile_wallets
  FOR SELECT USING (family_id = public.current_family_id());
CREATE POLICY family_select_wallet_ledger ON public.wallet_ledger
  FOR SELECT USING (family_id = public.current_family_id());
CREATE POLICY family_select_reward_catalog ON public.reward_catalog
  FOR SELECT USING (family_id = public.current_family_id());
CREATE POLICY family_select_reward_redemptions ON public.reward_redemptions
  FOR SELECT USING (family_id = public.current_family_id());
CREATE POLICY family_select_game_tickets ON public.game_tickets
  FOR SELECT USING (family_id = public.current_family_id());
CREATE POLICY family_select_game_sessions ON public.game_sessions
  FOR SELECT USING (family_id = public.current_family_id());
CREATE POLICY family_select_ocr_uploads ON public.ocr_uploads
  FOR SELECT USING (family_id = public.current_family_id());
CREATE POLICY family_select_ocr_extracted_items ON public.ocr_extracted_items
  FOR SELECT USING (family_id = public.current_family_id());
CREATE POLICY family_select_custom_spelling_lists ON public.custom_spelling_lists
  FOR SELECT USING (family_id = public.current_family_id());
CREATE POLICY family_select_custom_tingxie_lists ON public.custom_tingxie_lists
  FOR SELECT USING (family_id = public.current_family_id());
CREATE POLICY family_select_parent_imported_questions ON public.parent_imported_questions
  FOR SELECT USING (family_id = public.current_family_id());
CREATE POLICY family_select_subscription_entitlements ON public.subscription_entitlements
  FOR SELECT USING (family_id = public.current_family_id());
CREATE POLICY family_select_referrals_referrer ON public.referrals
  FOR SELECT USING (referrer_family_id = public.current_family_id() OR referred_family_id = public.current_family_id());
CREATE POLICY family_select_learning_reports ON public.learning_reports
  FOR SELECT USING (family_id = public.current_family_id());
CREATE POLICY family_select_parent_feedback ON public.parent_feedback
  FOR SELECT USING (family_id = public.current_family_id());
CREATE POLICY family_select_consent_records ON public.consent_records
  FOR SELECT USING (family_id = public.current_family_id());
CREATE POLICY family_select_privacy_requests ON public.privacy_requests
  FOR SELECT USING (family_id = public.current_family_id());
CREATE POLICY family_select_data_deletion_jobs ON public.data_deletion_jobs
  FOR SELECT USING (family_id = public.current_family_id());

-- Reference content read policies.
CREATE POLICY ref_select_schools ON public.schools
  FOR SELECT USING (is_active = true);
CREATE POLICY ref_select_subject_topics ON public.subject_topics
  FOR SELECT USING (is_active = true);
CREATE POLICY ref_select_chinese_lessons ON public.chinese_lessons
  FOR SELECT USING (is_active = true);
CREATE POLICY ref_select_school_calendar ON public.school_calendar
  FOR SELECT USING (true);
CREATE POLICY ref_select_questions ON public.questions
  FOR SELECT USING (is_active = true);
CREATE POLICY ref_select_badge_definitions ON public.badge_definitions
  FOR SELECT USING (is_active = true);
CREATE POLICY ref_select_badge_level_config ON public.badge_level_config
  FOR SELECT USING (is_active = true);
CREATE POLICY ref_select_default_spelling_lists ON public.default_spelling_lists
  FOR SELECT USING (is_active = true);
CREATE POLICY ref_select_default_tingxie_lists ON public.default_tingxie_lists
  FOR SELECT USING (is_active = true);
CREATE POLICY ref_select_data_retention_policies ON public.data_retention_policies
  FOR SELECT USING (true);
CREATE POLICY family_select_leaderboard_entries ON public.leaderboard_entries
  FOR SELECT USING (family_id = public.current_family_id());

-- Parent-managed inserts/updates for low-risk family tables.
CREATE POLICY family_manage_reward_catalog ON public.reward_catalog
  FOR ALL USING (family_id = public.current_family_id())
  WITH CHECK (family_id = public.current_family_id());
CREATE POLICY family_manage_parent_feedback ON public.parent_feedback
  FOR INSERT WITH CHECK (family_id = public.current_family_id() AND submitted_by_user_id = auth.uid());
CREATE POLICY family_manage_privacy_requests ON public.privacy_requests
  FOR INSERT WITH CHECK (family_id = public.current_family_id() AND requested_by_user_id = auth.uid());

-- Sensitive writes are intentionally not exposed through RLS:
-- profiles, wallets, ledger, sessions, attempts, badges, redemptions,
-- OCR confirmation, deletion jobs should be changed via SECURITY DEFINER RPCs.

-- =============================================================================
-- 13. Triggers
-- =============================================================================

CREATE TRIGGER trg_families_updated_at BEFORE UPDATE ON public.families
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_data_retention_policies_updated_at BEFORE UPDATE ON public.data_retention_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_parent_settings_updated_at BEFORE UPDATE ON public.parent_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_profile_subject_settings_updated_at BEFORE UPDATE ON public.profile_subject_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_schools_updated_at BEFORE UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_subject_topics_updated_at BEFORE UPDATE ON public.subject_topics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_chinese_lessons_updated_at BEFORE UPDATE ON public.chinese_lessons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_profile_learning_scope_updated_at BEFORE UPDATE ON public.profile_learning_scope
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_school_calendar_updated_at BEFORE UPDATE ON public.school_calendar
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_questions_updated_at BEFORE UPDATE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_learning_sessions_updated_at BEFORE UPDATE ON public.learning_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_student_mistakes_book_updated_at BEFORE UPDATE ON public.student_mistakes_book
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_badge_definitions_updated_at BEFORE UPDATE ON public.badge_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_profile_badge_counters_updated_at BEFORE UPDATE ON public.profile_badge_counters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_badge_level_config_updated_at BEFORE UPDATE ON public.badge_level_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_reward_catalog_updated_at BEFORE UPDATE ON public.reward_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_reward_redemptions_updated_at BEFORE UPDATE ON public.reward_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_ocr_uploads_updated_at BEFORE UPDATE ON public.ocr_uploads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_ocr_extracted_items_updated_at BEFORE UPDATE ON public.ocr_extracted_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_default_spelling_lists_updated_at BEFORE UPDATE ON public.default_spelling_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_default_tingxie_lists_updated_at BEFORE UPDATE ON public.default_tingxie_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_custom_spelling_lists_updated_at BEFORE UPDATE ON public.custom_spelling_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_custom_tingxie_lists_updated_at BEFORE UPDATE ON public.custom_tingxie_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_parent_imported_questions_updated_at BEFORE UPDATE ON public.parent_imported_questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_subscription_entitlements_updated_at BEFORE UPDATE ON public.subscription_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_leaderboard_entries_updated_at BEFORE UPDATE ON public.leaderboard_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_parent_feedback_updated_at BEFORE UPDATE ON public.parent_feedback
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 14. Grants
-- =============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.reward_catalog TO authenticated;
GRANT INSERT ON public.parent_feedback TO authenticated;
GRANT INSERT ON public.privacy_requests TO authenticated;

GRANT EXECUTE ON FUNCTION public.register_family(TEXT, public.account_type, public.ui_lang, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_parent_pin(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_parent_pin(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_pin_exists() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_kid_profile(TEXT, TEXT, TEXT, TEXT, public.gender_type, public.chinese_level, public.ui_lang) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_kid_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_kid_pin(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_kid_pin(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disable_kid_pin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_kid_pin(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_daily_checkin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_learning_session(UUID, public.subject_code, TEXT, INT, INT, INT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_privacy_request(public.privacy_request_type, UUID, TEXT) TO authenticated;

COMMIT;

-- =============================================================================
-- End of 010_rebuild_core_schema.sql
-- =============================================================================
