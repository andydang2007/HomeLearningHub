/**
 * common/js/qa-harness.js
 * Local QA scenario presets — overrides family plan / streak UI without Admin DB edits.
 * Active only when localStorage.hlh_qa_scenario is set (via dev/qa.html).
 */
(function (root) {
    'use strict';

    const STORAGE_KEY = 'hlh_qa_scenario';
    const TEST_CLOUD_ID = 'aaaaaaaa-bbbb-cccc-dddd-000000000001';
    const TEST_CLOUD_ID_2 = 'aaaaaaaa-bbbb-cccc-dddd-000000000002';
    const TEST_CLOUD_ID_3 = 'aaaaaaaa-bbbb-cccc-dddd-000000000003';

    function kid(name, grade, cloudId) {
        return {
            name,
            grade: grade || 'P3',
            avatarId: 'star',
            gender: '',
            schoolName: '',
            chineseLevel: 'CL',
            cloudId: cloudId || '',
        };
    }

    /** @type {Record<string, object>} */
    const SCENARIOS = {
        guest_fresh: {
            id: 'guest_fresh',
            group: 'guest',
            titleZh: '初次使用（游客）',
            titleEn: 'First visit (guest)',
            descZh: '清空本机档案，打开学生端会进入「选用户 / 新建档案」页。',
            descEn: 'No local profiles — student hub shows the user picker.',
            requiresLogin: false,
            apply() {
                clearLocalProfiles();
            },
        },
        guest_one_kid: {
            id: 'guest_one_kid',
            group: 'guest',
            titleZh: '游客 · 一个孩子',
            titleEn: 'Guest · one child',
            descZh: '本机一个孩子，未登录家长账户（无 cloudId）。',
            descEn: 'One local child, no parent login / cloud sync.',
            requiresLogin: false,
            apply() {
                clearLocalProfiles();
                setProfiles([kid('小明')]);
                setActiveKid('小明', 'P3');
            },
        },
        guest_two_kids: {
            id: 'guest_two_kids',
            group: 'guest',
            titleZh: '游客 · 两个孩子',
            titleEn: 'Guest · two children',
            descZh: '本机两个孩子，可测 Switch User。',
            descEn: 'Two local profiles for switch-user flow.',
            requiresLogin: false,
            apply() {
                clearLocalProfiles();
                setProfiles([kid('小明'), kid('小红', 'P1')]);
                setActiveKid('小明', 'P3');
            },
        },
        parent_empty_basic: {
            id: 'parent_empty_basic',
            group: 'account',
            titleZh: '已登录 · 尚无孩子（基础版）',
            titleEn: 'Logged in · no children (Basic)',
            descZh: '需已登录家长。清空本机孩子，模拟新家庭刚注册、尚未添加档案。',
            descEn: 'Requires parent login. Empty kid list; simulates post-signup before first child.',
            requiresLogin: true,
            familyOverride: { plan_tier: 'basic', account_type: 'multi_child' },
            apply() {
                clearLocalProfiles();
            },
        },
        basic_single: {
            id: 'basic_single',
            group: 'account',
            titleZh: '单孩 · 基础版',
            titleEn: 'Individual · Basic',
            descZh: '需已登录家长。模拟 account_type=single_child、plan_tier=basic，最多 1 孩。',
            descEn: 'Requires parent login. Mocks Individual Basic (1 child max).',
            requiresLogin: true,
            familyOverride: { plan_tier: 'basic', account_type: 'single_child' },
            apply() {
                clearLocalProfiles();
                setProfiles([kid('Alex', 'P3', TEST_CLOUD_ID)]);
                setActiveKid('Alex', 'P3');
            },
        },
        premium_single: {
            id: 'premium_single',
            group: 'account',
            titleZh: '单孩 · 高级版',
            titleEn: 'Individual · Premium',
            descZh: '需已登录家长。模拟单孩 Premium（头像分组、护盾等）。',
            descEn: 'Requires parent login. Mocks Individual Premium.',
            requiresLogin: true,
            familyOverride: { plan_tier: 'premium', account_type: 'single_child' },
            apply() {
                clearLocalProfiles();
                setProfiles([kid('Alex', 'P3', TEST_CLOUD_ID)]);
                setActiveKid('Alex', 'P3');
            },
        },
        basic_multi: {
            id: 'basic_multi',
            group: 'account',
            titleZh: '多孩 · 基础版',
            titleEn: 'Family · Basic',
            descZh: '需已登录家长。模拟家庭基础版，最多 3 孩。',
            descEn: 'Requires parent login. Mocks Family Basic (3 children max).',
            requiresLogin: true,
            familyOverride: { plan_tier: 'basic', account_type: 'multi_child' },
            apply() {
                clearLocalProfiles();
                setProfiles([
                    kid('Alex', 'P3', TEST_CLOUD_ID),
                    kid('Ben', 'P1', TEST_CLOUD_ID_2),
                    kid('Cara', 'P5', TEST_CLOUD_ID_3),
                ]);
                setActiveKid('Alex', 'P3');
            },
        },
        premium_multi: {
            id: 'premium_multi',
            group: 'account',
            titleZh: '多孩 · 高级版',
            titleEn: 'Family · Premium',
            descZh: '需已登录家长。模拟家庭高级版 + 3 孩。',
            descEn: 'Requires parent login. Mocks Family Premium with 3 children.',
            requiresLogin: true,
            familyOverride: { plan_tier: 'premium', account_type: 'multi_child' },
            apply() {
                clearLocalProfiles();
                setProfiles([
                    kid('Alex', 'P3', TEST_CLOUD_ID),
                    kid('Ben', 'P1', TEST_CLOUD_ID_2),
                    kid('Cara', 'P5', TEST_CLOUD_ID_3),
                ]);
                setActiveKid('Alex', 'P3');
            },
        },
        streak_break_basic: {
            id: 'streak_break_basic',
            group: 'streak',
            titleZh: '连击中断 · 基础版',
            titleEn: 'Streak break · Basic',
            descZh: '打开学生端应弹出「连击中断了」弹窗（无护盾）。',
            descEn: 'Student hub should show Basic streak-break modal.',
            requiresLogin: false,
            familyOverride: { plan_tier: 'basic', account_type: 'single_child' },
            streakOverride: {
                break_pending: true,
                plan_tier: 'basic',
                streak_at_risk: 8,
                current_streak: 8,
                effective_streak: 0,
                shields_remaining: 0,
                shields_quota: 3,
            },
            apply() {
                clearLocalProfiles();
                setProfiles([kid('小明')]);
                setActiveKid('小明', 'P3');
                seedLocalStreakGap('小明', 8);
            },
        },
        streak_shield_offer: {
            id: 'streak_shield_offer',
            group: 'streak',
            titleZh: '连击中断 · 高级版（有护盾）',
            titleEn: 'Streak break · Premium (shields left)',
            descZh: 'Premium 护盾提供弹窗，剩余 2/3。',
            descEn: 'Premium shield-offer modal with 2 shields remaining.',
            requiresLogin: false,
            familyOverride: { plan_tier: 'premium', account_type: 'single_child' },
            streakOverride: {
                break_pending: true,
                plan_tier: 'premium',
                streak_at_risk: 12,
                current_streak: 12,
                effective_streak: 0,
                shields_remaining: 2,
                shields_quota: 3,
            },
            apply() {
                clearLocalProfiles();
                setProfiles([kid('Alex', 'P3', TEST_CLOUD_ID)]);
                setActiveKid('Alex', 'P3');
                seedLocalStreakGap('Alex', 12);
            },
        },
        streak_shield_empty: {
            id: 'streak_shield_empty',
            group: 'streak',
            titleZh: '连击中断 · 高级版（护盾用尽）',
            titleEn: 'Streak break · Premium (no shields)',
            descZh: 'Premium 但本月护盾为 0。',
            descEn: 'Premium with 0 shields left this month.',
            requiresLogin: false,
            familyOverride: { plan_tier: 'premium', account_type: 'single_child' },
            streakOverride: {
                break_pending: true,
                plan_tier: 'premium',
                streak_at_risk: 5,
                current_streak: 5,
                effective_streak: 0,
                shields_remaining: 0,
                shields_quota: 3,
            },
            apply() {
                clearLocalProfiles();
                setProfiles([kid('Alex', 'P3', TEST_CLOUD_ID)]);
                setActiveKid('Alex', 'P3');
                seedLocalStreakGap('Alex', 5);
            },
        },
    };

    function isAllowedHost() {
        const h = root.location?.hostname || '';
        if (h === 'localhost' || h === '127.0.0.1') return true;
        try {
            return new URLSearchParams(root.location.search).has('force');
        } catch {
            return false;
        }
    }

    function clearLocalProfiles() {
        const keys = [
            'kid_profiles', 'currentPlayer', 'currentGrade', 'active_kid_profile_id',
            'parent_pin_verified', 'parent_streak_break_hint',
        ];
        keys.forEach((k) => localStorage.removeItem(k));
        Object.keys(localStorage).forEach((k) => {
            if (k.startsWith('current_streak_') || k.startsWith('max_streak_')
                || k.startsWith('last_checkin_date_') || k.startsWith('last_date_')
                || k.startsWith('total_days_') || k.startsWith('hlh_local_streak_res_')) {
                localStorage.removeItem(k);
            }
        });
    }

    function setProfiles(profiles) {
        localStorage.setItem('kid_profiles', JSON.stringify(profiles));
    }

    function setActiveKid(name, grade) {
        localStorage.setItem('currentPlayer', name);
        localStorage.setItem('currentGrade', grade);
        const p = JSON.parse(localStorage.getItem('kid_profiles') || '[]')
            .find((x) => x.name === name);
        if (p?.cloudId) {
            localStorage.setItem('active_kid_profile_id', p.cloudId);
        } else {
            localStorage.removeItem('active_kid_profile_id');
        }
    }

    function sgtYesterdayString(daysAgo) {
        const d = new Date();
        const sgt = new Date(d.getTime() + (d.getTimezoneOffset() + 480) * 60000);
        sgt.setDate(sgt.getDate() - daysAgo);
        const y = sgt.getFullYear();
        const m = String(sgt.getMonth() + 1).padStart(2, '0');
        const day = String(sgt.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function seedLocalStreakGap(userName, streak) {
        localStorage.setItem(`current_streak_${userName}`, String(streak));
        localStorage.setItem(`max_streak_${userName}`, String(Math.max(streak, 10)));
        localStorage.setItem(`last_checkin_date_${userName}`, sgtYesterdayString(2));
        localStorage.removeItem(`hlh_local_streak_res_${userName}_` + sgtYesterdayString(2));
    }

    function getActiveId() {
        return localStorage.getItem(STORAGE_KEY) || '';
    }

    function getActive() {
        const id = getActiveId();
        return id ? SCENARIOS[id] || null : null;
    }

    function isActive() {
        return !!getActiveId();
    }

    function getFamilyInfoOverride() {
        const s = getActive();
        return s?.familyOverride ? { ...s.familyOverride } : null;
    }

    function getStreakOverride() {
        const s = getActive();
        return s?.streakOverride ? { ...s.streakOverride } : null;
    }

    function getKidSummaryMock() {
        const s = getActive();
        if (!s) return null;
        const fo = s.familyOverride || {};
        return {
            level_no: 3,
            tier_name: 'Bronze',
            current_streak: 5,
            effective_streak: 5,
            max_streak: 10,
            total_checkin_days: 20,
            sessions_7d: 4,
            minutes_7d: 45,
            sessions_total: 28,
            badges_lifetime: 6,
            plan_tier: fo.plan_tier || 'basic',
            streak_shields_remaining: s.streakOverride?.shields_remaining ?? (fo.plan_tier === 'premium' ? 3 : 0),
            streak_shields_quota: 3,
        };
    }

    function mergeFamilyInfo(info) {
        const o = getFamilyInfoOverride();
        if (!o) return info;
        return { ...(info || {}), ...o };
    }

    function mergeStreakStatus(status) {
        const o = getStreakOverride();
        if (!o) return status;
        return { ...(status || {}), ...o };
    }

    function mergeKidSummary(summary) {
        const mock = getKidSummaryMock();
        if (!mock) return summary;
        return { ...(summary || {}), ...mock };
    }

    function listScenarios() {
        return Object.values(SCENARIOS);
    }

    function applyScenario(id) {
        const s = SCENARIOS[id];
        if (!s) return { ok: false, error: 'unknown_scenario' };
        if (typeof s.apply === 'function') s.apply();
        localStorage.setItem(STORAGE_KEY, id);
        sessionStorage.removeItem('parent_streak_break_hint');
        return { ok: true, scenario: s };
    }

    function clearScenario() {
        localStorage.removeItem(STORAGE_KEY);
    }

    function injectBanner() {
        if (!isActive() || !root.document?.body) return;
        const s = getActive();
        if (!s || root.document.getElementById('hlh-qa-banner')) return;
        const bar = root.document.createElement('div');
        bar.id = 'hlh-qa-banner';
        bar.setAttribute('role', 'status');
        const label = s.titleZh || s.id;
        bar.innerHTML = `🧪 QA 场景：<strong>${label}</strong> — 计划/连击为模拟数据，非数据库真实状态。 <a href="../dev/qa.html">更换场景</a>`;
        bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;padding:8px 12px;background:#fef3c7;border-top:2px solid #f59e0b;font:800 13px/1.4 Nunito,sans-serif;color:#92400e;text-align:center;';
        bar.querySelector('a').style.color = '#b45309';
        root.document.body.appendChild(bar);
    }

    root.QA_HARNESS = {
        SCENARIOS,
        STORAGE_KEY,
        TEST_CLOUD_ID,
        isAllowedHost,
        isActive,
        getActive,
        getActiveId,
        listScenarios,
        applyScenario,
        clearScenario,
        getFamilyInfoOverride,
        getStreakOverride,
        getKidSummaryMock,
        mergeFamilyInfo,
        mergeStreakStatus,
        mergeKidSummary,
        injectBanner,
    };

    if (root.document?.readyState === 'loading') {
        root.document.addEventListener('DOMContentLoaded', injectBanner);
    } else if (isActive()) {
        injectBanner();
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);
