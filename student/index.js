// Student hub — dynamic profile picker + badge wall

let currentUser      = '';
let currentGrade     = '';
let currentCloudId   = '';  // Supabase profile UUID for the active kid
let cloudStreakData  = null; // { current_streak, max_streak, last_checkin_date, total_checkin_days } | null
let currentLevelProfileId = '';
let currentLevelTier = 'Bronze';
let currentLevelNo = 1;
let avatarPickerIsPremium = false;
/** Set at bootstrap: parent Supabase session present → cloud-managed profiles. */
let hubParentLoggedIn = false;

const LEVEL_TIER_EMOJI = { Bronze: '🥉', Silver: '🥈', Gold: '🥇', Diamond: '💎', Legend: '⭐' };
const CUSTOM_AVATAR_FILES = [
    'a1.png', 'a2.png', 'a3.png', 'a4.png', 'a5.png',
    'b1.png', 'b2.png', 'b3.png',
    'c1.png', 'c2.png', 'c3.png', 'c4.png', 'c5.png', 'c6.png',
    'd1.png', 'd2.png', 'd3.png', 'd4.png',
];
const CUSTOM_AVATAR_BASE = '../assets/images/avatars/';
const CUSTOM_AVATAR_MAP_KEY = 'kid_custom_avatar_map';
const DEFAULT_AVATAR_IDS = ['star', 'girl_blonde', 'girl', 'boy', 'child', 'panda'];
const DEFAULT_AVATAR_TRANSLATE = {
    star: 'translate(0, 3%)',
    girl_blonde: 'translate(2%, 0)',
    boy: 'translate(-2%, 3%)',
    child: 'translate(-1%, 1%)',
};
// Per-avatar visual center tuning (for images that look off-center on homepage).
const CUSTOM_AVATAR_POSITIONS = {
    // Example: 'a1.png': '50% 46%',
};

function formatLevelChipText(tierName, levelNo) {
    applyLevelChipContent(tierName, levelNo);
}

function applyLevelChipContent(tierName, levelNo) {
    const tier = tierName || 'Bronze';
    const tierKeyMap = {
        Bronze: 'index.tier_bronze',
        Silver: 'index.tier_silver',
        Gold: 'index.tier_gold',
        Diamond: 'index.tier_diamond',
        Legend: 'index.tier_legend',
    };
    const tierLabel = (typeof AppI18n !== 'undefined')
        ? AppI18n.t(tierKeyMap[tier] || 'index.tier_bronze')
        : 'Bronze';
    const levelLabel = (typeof AppI18n !== 'undefined')
        ? AppI18n.t('index.level_short', { n: levelNo || 1 })
        : `Level ${levelNo || 1}`;

    const emojiEl = document.getElementById('level-chip-emoji');
    const tierEl  = document.getElementById('level-chip-tier');
    const levelEl = document.getElementById('level-chip-level');
    if (tierEl)  tierEl.textContent  = tierLabel;
    if (levelEl) levelEl.textContent = levelLabel;
}

function applyLevelChipTierColor(tierName) {
    const chip = document.getElementById('level-chip');
    if (!chip) return;
    chip.classList.remove('tier-bronze', 'tier-silver', 'tier-gold', 'tier-diamond', 'tier-legend');
    const t = String(tierName || 'Bronze').toLowerCase();
    chip.classList.add(`tier-${t}`);
}

function getProfileAvatar(profile, index) {
    if (profile.avatarId) return ProfileCatalog.emojiForId(profile.avatarId);
    return ProfileCatalog.AVATARS[index % ProfileCatalog.AVATARS.length].emoji;
}

function getCustomAvatarMap() {
    try {
        return JSON.parse(localStorage.getItem(CUSTOM_AVATAR_MAP_KEY) || '{}');
    } catch {
        return {};
    }
}

function setCustomAvatarMap(map) {
    localStorage.setItem(CUSTOM_AVATAR_MAP_KEY, JSON.stringify(map));
}

function currentAvatarProfileKey() {
    if (!currentUser) return '';
    return currentCloudId ? `cloud:${currentCloudId}` : `local:${currentUser}|${currentGrade}`;
}

function getCurrentCustomAvatarFile() {
    const map = getCustomAvatarMap();
    const key = currentAvatarProfileKey();
    const file = key ? map[key] : '';
    return (file && CUSTOM_AVATAR_FILES.includes(file)) ? file : '';
}

function getCurrentAvatarSelection() {
    const map = getCustomAvatarMap();
    const key = currentAvatarProfileKey();
    const raw = key ? map[key] : '';
    if (!raw) return null;
    if (typeof raw === 'string' && raw.startsWith('default:')) {
        const avatarId = raw.slice('default:'.length);
        return DEFAULT_AVATAR_IDS.includes(avatarId) ? { type: 'default', avatarId } : null;
    }
    if (typeof raw === 'string' && CUSTOM_AVATAR_FILES.includes(raw)) {
        return { type: 'custom', file: raw };
    }
    return null;
}

function renderDashboardAvatar() {
    const el = document.getElementById('dash-avatar');
    if (!el) return;
    const selection = getCurrentAvatarSelection();
    if (selection?.type === 'custom') {
        const pos = CUSTOM_AVATAR_POSITIONS[selection.file] || '50% 50%';
        el.innerHTML = `<img src="${CUSTOM_AVATAR_BASE}${selection.file}" alt="avatar" style="object-position:${pos};">`;
        return;
    }
    if (selection?.type === 'default') {
        const emoji = ProfileCatalog.emojiForId(selection.avatarId);
        const transform = DEFAULT_AVATAR_TRANSLATE[selection.avatarId] || 'none';
        el.innerHTML = `<span class="dash-avatar-emoji" style="transform:${transform};">${emoji}</span>`;
        return;
    }
    el.textContent = getAvatarForName(currentUser);
}

async function refreshAvatarPremiumStatus() {
    avatarPickerIsPremium = false;
    try {
        if (typeof window.QA_HARNESS !== 'undefined' && window.QA_HARNESS.isActive()) {
            const fo = window.QA_HARNESS.getFamilyInfoOverride();
            if (fo?.plan_tier === 'premium') {
                avatarPickerIsPremium = true;
                return;
            }
        }
        if (typeof AUTH === 'undefined' || typeof AUTH.getParentSession !== 'function') return;
        const session = await AUTH.getParentSession();
        if (!session || typeof AUTH.fetchFamilyInfo !== 'function') return;
        const { info, error } = await AUTH.fetchFamilyInfo();
        if (error || !info) return;
        avatarPickerIsPremium = String(info.plan_tier || '').toLowerCase() === 'premium';
    } catch {
        avatarPickerIsPremium = false;
    }
}

async function enforceAvatarSelectionForCurrentPlan() {
    if (avatarPickerIsPremium) return;
    const key = currentAvatarProfileKey();
    if (!key) return;

    const selection = getCurrentAvatarSelection();
    // Basic users: only default avatars are allowed.
    if (selection?.type === 'custom') {
        const fallbackAvatarId = DEFAULT_AVATAR_IDS[0];
        const map = getCustomAvatarMap();
        map[key] = `default:${fallbackAvatarId}`;
        setCustomAvatarMap(map);
        AUTH.updateKidProfile(currentUser, { avatarId: fallbackAvatarId });
        if (currentCloudId) {
            const profile = AUTH.getKidProfiles().find((p) => p.name === currentUser);
            if (profile?.cloudId) {
                await AUTH.updateKidProfileOnCloud(profile.cloudId, profile);
            }
        }
    }
}

async function openAvatarModal() {
    const modal = document.getElementById('avatar-modal');
    if (!modal || !currentUser) return;
    await refreshAvatarPremiumStatus();
    await enforceAvatarSelectionForCurrentPlan();
    renderDashboardAvatar();
    renderAvatarPicker();
    modal.classList.remove('is-hidden');
}

function closeAvatarModal() {
    document.getElementById('avatar-modal')?.classList.add('is-hidden');
}

function renderAvatarPicker() {
    const grid = document.getElementById('avatar-grid');
    if (!grid) return;
    const selected = getCurrentAvatarSelection();
    const t = (key) => (typeof AppI18n !== 'undefined' ? AppI18n.t(key) : key);
    const groups = [
        {
            id: 'default',
            title: t('index.avatar_group_default'),
            items: DEFAULT_AVATAR_IDS.map((avatarId) => ({ kind: 'default', avatarId })),
        },
        {
            id: 'a',
            title: t('index.avatar_group_a'),
            items: CUSTOM_AVATAR_FILES.filter((f) => f.startsWith('a')).map((file) => ({ kind: 'custom', file })),
        },
        {
            id: 'b',
            title: t('index.avatar_group_b'),
            items: CUSTOM_AVATAR_FILES.filter((f) => f.startsWith('b')).map((file) => ({ kind: 'custom', file })),
        },
        {
            id: 'c',
            title: t('index.avatar_group_c'),
            items: CUSTOM_AVATAR_FILES.filter((f) => f.startsWith('c')).map((file) => ({ kind: 'custom', file })),
        },
        {
            id: 'd',
            title: t('index.avatar_group_d'),
            items: CUSTOM_AVATAR_FILES.filter((f) => f.startsWith('d')).map((file) => ({ kind: 'custom', file })),
        },
    ];

    grid.innerHTML = groups.map((g) => {
        if (!g.items.length) return '';
        const groupLocked = g.id !== 'default' && !avatarPickerIsPremium;
        const itemHtml = g.items.map((item) => {
            if (item.kind === 'default') {
                const isSelected = selected?.type === 'default' && selected.avatarId === item.avatarId;
                const transform = DEFAULT_AVATAR_TRANSLATE[item.avatarId] || 'none';
                return `
                    <button type="button" class="avatar-pick ${isSelected ? 'selected' : ''}" data-kind="default" data-avatar-id="${item.avatarId}">
                        <span class="avatar-pick-emoji" style="transform:${transform};">${ProfileCatalog.emojiForId(item.avatarId)}</span>
                    </button>
                `;
            }
            const isSelected = selected?.type === 'custom' && selected.file === item.file;
            const pos = CUSTOM_AVATAR_POSITIONS[item.file] || '50% 50%';
            return `
                <button type="button" class="avatar-pick avatar-pick--image ${isSelected ? 'selected' : ''}" data-kind="custom" data-file="${item.file}" ${groupLocked ? 'disabled' : ''}>
                    <img src="${CUSTOM_AVATAR_BASE}${item.file}" alt="" width="64" height="64" loading="lazy" decoding="async" style="object-position:${pos};">
                </button>
            `;
        }).join('');
        const sectionHtml = `
            <section class="avatar-group-section ${g.id === 'default' ? 'avatar-group-section--default' : ''} ${groupLocked ? 'avatar-group-section--locked' : ''}">
                <div class="avatar-group-title">${g.title}</div>
                <div class="avatar-group-grid">${itemHtml}</div>
            </section>
        `;
        if (!avatarPickerIsPremium && g.id === 'default') {
            return `${sectionHtml}<div class="avatar-premium-hint">🔒 Premium Features</div>`;
        }
        return sectionHtml;
    }).join('');

    grid.querySelectorAll('.avatar-pick').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const key = currentAvatarProfileKey();
            if (!key) return;
            const map = getCustomAvatarMap();
            const kind = btn.dataset.kind;

            if (kind === 'default') {
                const avatarId = btn.dataset.avatarId;
                if (!DEFAULT_AVATAR_IDS.includes(avatarId)) return;
                map[key] = `default:${avatarId}`;
                setCustomAvatarMap(map);
                AUTH.updateKidProfile(currentUser, { avatarId });
                if (currentCloudId) {
                    const profile = AUTH.getKidProfiles().find((p) => p.name === currentUser);
                    if (profile?.cloudId) {
                        await AUTH.updateKidProfileOnCloud(profile.cloudId, profile);
                    }
                }
            } else {
                if (!avatarPickerIsPremium) return;
                const file = btn.dataset.file;
                if (!CUSTOM_AVATAR_FILES.includes(file)) return;
                map[key] = file;
                setCustomAvatarMap(map);
            }

            renderDashboardAvatar();
            closeAvatarModal();
        });
    });
}

function getSGTDate() {
    const d = new Date();
    return new Date(d.getTime() + (d.getTimezoneOffset() + 480) * 60000);
}

function getSGTDateString() {
    const sgt = getSGTDate();
    return `${sgt.getFullYear()}-${String(sgt.getMonth() + 1).padStart(2, '0')}-${String(sgt.getDate()).padStart(2, '0')}`;
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('is-visible');
        s.classList.add('is-hidden');
    });
    const el = document.getElementById(id);
    el.classList.remove('is-hidden');
    el.classList.add('is-visible');
    updateLangToggleVisibility();
}

function updateLangToggleVisibility() {
    const tools = document.querySelector('.global-tools');
    const dash  = document.getElementById('dashboard-screen');
    if (!tools || !dash) return;
    tools.classList.toggle('is-hidden', dash.classList.contains('is-visible'));
}

function showHubNotice(msg) {
    const modal = document.getElementById('hub-notice-modal');
    const textEl = document.getElementById('hub-notice-text');
    if (!modal || !textEl) return;
    textEl.textContent = msg;
    modal.classList.remove('is-hidden');
}

function closeHubNotice() {
    document.getElementById('hub-notice-modal')?.classList.add('is-hidden');
}

function toggleAppLanguage() {
    const next = AppI18n.getLang() === 'en' ? 'zh' : 'en';
    AppI18n.setLang(next);
    const langBtn = document.getElementById('lang-toggle');
    if (langBtn) langBtn.textContent = AppI18n.t('lang.toggle');
    refreshHub();
    refreshUserScreenI18n();
    if (!document.getElementById('avatar-modal')?.classList.contains('is-hidden')) {
        renderAvatarPicker();
    }
    if (currentUser) {
        document.getElementById('dash-name').textContent = currentUser;
        loadAndShowLevel(currentCloudId, currentUser);
    }
    showHubNotice(next === 'zh' ? '语言：中文' : 'Language: English');
}

function wireCalendarLangToggle() {
    const cal = document.getElementById('school-term-display');
    if (!cal) return;
    cal.classList.add('hero-calendar--clickable');
    cal.addEventListener('click', toggleAppLanguage);
}

function initDate() {
    const now = getSGTDate();
    const t2 = new Date(2026, 2, 23);
    const t3 = new Date(2026, 5, 29);
    const t4 = new Date(2026, 8, 14);
    const diff = (d1, d2) => Math.floor((d1 - d2) / 864e5);

    let termStr = 'Term 1';
    if (now >= t4) {
        const w = Math.floor(diff(now, t4) / 7) + 1;
        termStr = w <= 10 ? `Term 4 Week ${w}` : 'Holiday';
    } else if (now >= t3) {
        const w = Math.floor(diff(now, t3) / 7) + 1;
        termStr = w <= 10 ? `Term 3 Week ${w}` : 'Holiday';
    } else if (now >= t2) {
        const w = Math.floor(diff(now, t2) / 7) + 1;
        termStr = w <= 10 ? `Term 2 Week ${w}` : 'Holiday';
    }

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const termMatch = termStr.match(/^(Term \d+)\s+Week\s+(\d+)$/);
    let termLabelHtml;
    if (termMatch) {
        termLabelHtml = `<div class="term-label"><span class="term-name">${termMatch[1]}</span><span class="term-week">Week ${termMatch[2]}</span></div>`;
    } else {
        termLabelHtml = `<div class="term-label term-label--solo">${termStr}</div>`;
    }

    const el = document.getElementById('school-term-display');
    if (!el) return;
    el.innerHTML = `
        <div class="term-date">📅 ${now.getDate()} ${months[now.getMonth()]}</div>
        ${termLabelHtml}`;
}

// Fetch streak from cloud; evaluate break status (SGT); sync local cache.
// Populates module-level `cloudStreakData` and returns it (or null on error).
function daysBetweenSgtDates(dateStrA, dateStrB) {
    if (!dateStrA || !dateStrB) return null;
    const a = new Date(`${dateStrA}T12:00:00`);
    const b = new Date(`${dateStrB}T12:00:00`);
    return Math.round((b - a) / 86400000);
}

function localStreakResolutionKey(user, lastDate) {
    return `streak_break_resolved_${user}_${lastDate || 'none'}`;
}

function syncStreakToLocalStorage(status, user) {
    const u = user || currentUser;
    if (!u || !status) return;
    const effective = status.effective_streak ?? status.current_streak ?? 0;
    localStorage.setItem(`current_streak_${u}`, String(effective));
    if (status.max_streak != null) {
        localStorage.setItem(`max_streak_${u}`, String(status.max_streak));
    }
    if (status.total_checkin_days != null) {
        localStorage.setItem(`total_days_${u}`, String(status.total_checkin_days));
    }
    if (status.last_checkin_date) {
        localStorage.setItem(`last_checkin_date_${u}`, status.last_checkin_date);
        localStorage.setItem(`last_date_${u}`, status.last_checkin_date);
    }
}

function evaluateLocalStreakStatus(user) {
    const u = user || currentUser;
    const today = getSGTDateString();
    const last = localStorage.getItem(`last_checkin_date_${u}`)
              || localStorage.getItem(`last_date_${u}`);
    const current = parseInt(localStorage.getItem(`current_streak_${u}`) || '0', 10);
    const maxS = Math.max(
        parseInt(localStorage.getItem(`max_streak_${u}`) || '0', 10),
        current
    );
    const total = parseInt(localStorage.getItem(`total_days_${u}`) || '0', 10);
    const gap = last ? daysBetweenSgtDates(last, today) : null;
    let effective = current;
    let breakPending = false;
    let streakAtRisk = 0;

    if (gap != null && gap > 1) {
        streakAtRisk = current;
        if (sessionStorage.getItem(localStreakResolutionKey(u, last))) {
            effective = 0;
        } else {
            breakPending = true;
            effective = 0;
        }
    }

    return {
        current_streak: current,
        max_streak: maxS,
        last_checkin_date: last || null,
        total_checkin_days: total,
        today_sgt: today,
        effective_streak: effective,
        streak_at_risk: streakAtRisk,
        is_broken: gap != null && gap > 1,
        break_pending: breakPending,
        plan_tier: 'basic',
        shields_remaining: 0,
        shields_quota: 3,
        local_only: true,
    };
}

function resolveLocalStreakBreak(action, user) {
    const u = user || currentUser;
    const last = localStorage.getItem(`last_checkin_date_${u}`)
              || localStorage.getItem(`last_date_${u}`);
    if (action === 'accept') {
        localStorage.setItem(`current_streak_${u}`, '0');
    }
    if (last) sessionStorage.setItem(localStreakResolutionKey(u, last), action);
    return evaluateLocalStreakStatus(u);
}

async function loadStreakStatus(cloudId) {
    if (!cloudId || typeof window.SupabaseClient === 'undefined') {
        cloudStreakData = evaluateLocalStreakStatus();
        if (typeof window.QA_HARNESS !== 'undefined' && window.QA_HARNESS.isActive()) {
            cloudStreakData = window.QA_HARNESS.mergeStreakStatus(cloudStreakData);
        }
        return cloudStreakData;
    }
    const db = window.SupabaseClient;
    const u = currentUser;
    try {
        let { data, error } = await db.rpc('get_streak_status', { kid_profile_id: cloudId });
        if (error) throw error;

        if (!data || !data.last_checkin_date) {
            const localDate = localStorage.getItem(`last_checkin_date_${u}`)
                           || localStorage.getItem(`last_date_${u}`)
                           || null;
            if (localDate) {
                const localCurrent = parseInt(localStorage.getItem(`current_streak_${u}`) || '0', 10);
                const localMax = Math.max(
                    parseInt(localStorage.getItem(`max_streak_${u}`) || '0', 10),
                    localCurrent
                );
                const localTotal = parseInt(localStorage.getItem(`total_days_${u}`) || '0', 10);
                const { error: syncErr } = await db.rpc('upsert_checkin_streak', {
                    kid_profile_id: cloudId,
                    p_current_streak: localCurrent,
                    p_max_streak: localMax,
                    p_last_checkin_date: localDate,
                    p_total_checkin_days: localTotal,
                });
                if (!syncErr) {
                    const res = await db.rpc('get_streak_status', { kid_profile_id: cloudId });
                    if (!res.error) data = res.data;
                }
            }
        }

        cloudStreakData = data || evaluateLocalStreakStatus();
        if (typeof window.QA_HARNESS !== 'undefined' && window.QA_HARNESS.isActive()) {
            cloudStreakData = window.QA_HARNESS.mergeStreakStatus(cloudStreakData);
        }
        syncStreakToLocalStorage(cloudStreakData, u);
        return cloudStreakData;
    } catch {
        cloudStreakData = evaluateLocalStreakStatus();
        if (typeof window.QA_HARNESS !== 'undefined' && window.QA_HARNESS.isActive()) {
            cloudStreakData = window.QA_HARNESS.mergeStreakStatus(cloudStreakData);
        }
        return cloudStreakData;
    }
}

function getStreakModalVariant(status) {
    if (!status?.break_pending) return null;
    const tier = String(status.plan_tier || 'basic').toLowerCase();
    const shields = status.shields_remaining ?? 0;
    if (tier === 'premium' && shields > 0) return 'shield_offer';
    if (tier === 'premium') return 'shield_empty';
    return 'basic';
}

function closeStreakBreakModal() {
    document.getElementById('streak-break-modal')?.classList.add('is-hidden');
}

function renderStreakBreakModal(status) {
    const variant = getStreakModalVariant(status);
    if (!variant) return;

    const modal = document.getElementById('streak-break-modal');
    const titleEl = document.getElementById('streak-break-title');
    const bodyEl = document.getElementById('streak-break-body');
    const hintEl = document.getElementById('streak-break-hint');
    const metaEl = document.getElementById('streak-break-meta');
    const actionsEl = document.getElementById('streak-break-actions');
    if (!modal || !titleEl || !bodyEl || !actionsEl) return;

    const n = status.streak_at_risk || status.current_streak || 0;
    const quota = status.shields_quota ?? 3;
    const rem = status.shields_remaining ?? 0;
    const t = (key, vars) => AppI18n.t(key, vars);

    hintEl.classList.add('is-hidden');
    metaEl.classList.add('is-hidden');
    actionsEl.innerHTML = '';

    if (variant === 'shield_offer') {
        titleEl.textContent = t('index.streak_shield_title');
        bodyEl.textContent = t('index.streak_shield_body', { n });
        metaEl.textContent = t('index.streak_shield_remaining', { rem, quota });
        metaEl.classList.remove('is-hidden');
        actionsEl.innerHTML = `
            <button type="button" class="btn-action btn-action--shield" id="streak-break-use-shield">${t('index.streak_shield_use')}</button>
            <button type="button" class="btn-action btn-action--secondary" id="streak-break-accept">${t('index.streak_shield_skip')}</button>`;
    } else if (variant === 'shield_empty') {
        titleEl.textContent = t('index.streak_shield_empty_title');
        bodyEl.textContent = t('index.streak_shield_empty_body', { quota });
        actionsEl.innerHTML = `
            <button type="button" class="btn-action" id="streak-break-accept">${t('index.streak_break_continue')}</button>`;
    } else {
        titleEl.textContent = t('index.streak_break_title');
        bodyEl.textContent = t('index.streak_break_body', { n });
        hintEl.textContent = t('index.streak_break_premium_hint', { quota });
        hintEl.classList.remove('is-hidden');
        actionsEl.innerHTML = `
            <button type="button" class="btn-action" id="streak-break-accept">${t('index.streak_break_continue')}</button>
            <button type="button" class="btn-action btn-action--secondary" id="streak-break-ask-parent">${t('index.streak_break_ask_parent')}</button>`;
    }

    document.getElementById('streak-break-use-shield')?.addEventListener('click', () => {
        void handleStreakBreakResolve('shield');
    });
    document.getElementById('streak-break-accept')?.addEventListener('click', () => {
        void handleStreakBreakResolve('accept');
    });
    document.getElementById('streak-break-ask-parent')?.addEventListener('click', () => {
        sessionStorage.setItem('parent_streak_break_hint', JSON.stringify({
            kidName: currentUser,
            streak: n,
            ts: Date.now(),
        }));
        showHubNotice(t('index.streak_break_ask_toast'));
        void handleStreakBreakResolve('accept');
    });

    modal.classList.remove('is-hidden');
}

async function handleStreakBreakResolve(action) {
    closeStreakBreakModal();
    try {
        if (currentCloudId && typeof window.SupabaseClient !== 'undefined' && !cloudStreakData?.local_only) {
            const { data, error } = await window.SupabaseClient.rpc('resolve_streak_break', {
                kid_profile_id: currentCloudId,
                p_action: action,
            });
            if (error) throw error;
            cloudStreakData = data;
            syncStreakToLocalStorage(data);
        } else {
            cloudStreakData = resolveLocalStreakBreak(action);
        }
        if (action === 'shield') {
            showHubNotice(AppI18n.t('index.streak_shield_saved'));
        }
    } catch (e) {
        console.error('[streak-break]', e);
        cloudStreakData = resolveLocalStreakBreak('accept');
    }
    updateStreakUI();
    await renderBadges();
}

function maybeShowStreakBreakModal() {
    if (!cloudStreakData?.break_pending) return;
    renderStreakBreakModal(cloudStreakData);
}

/** @deprecated alias */
async function loadCloudStreak(cloudId) {
    return loadStreakStatus(cloudId);
}

function updateStreakUI() {
    let totalDays, lastCheckin;

    if (cloudStreakData) {
        totalDays   = cloudStreakData.total_checkin_days || 0;
        lastCheckin = cloudStreakData.last_checkin_date  || null;
    } else {
        totalDays   = parseInt(localStorage.getItem(`total_days_${currentUser}`) || '0', 10);
        lastCheckin = localStorage.getItem(`last_checkin_date_${currentUser}`)
                   || localStorage.getItem(`last_date_${currentUser}`);
    }

    const todayStr = getSGTDateString();
    const titleEl = document.getElementById('section-subject-title');
    if (!titleEl) return;

    if (lastCheckin === todayStr) {
        titleEl.textContent = AppI18n.t('index.select_subject_hint_done', { n: totalDays });
        titleEl.className = 'section-title section-title--done';
    } else {
        titleEl.textContent = AppI18n.t('index.select_subject_hint_pending', { n: totalDays + 1 });
        titleEl.className = 'section-title section-title--pending';
    }
}

function maxStreakNumClass(n) {
    const len = String(Math.max(0, n ?? 0)).length;
    if (len >= 4) return 'streak-num-d4';
    if (len === 3) return 'streak-num-d3';
    if (len === 2) return 'streak-num-d2';
    return 'streak-num-d1';
}

function badgeIconInner(b) {
    if (b.isCrown) {
        const n = Math.max(0, b.currentStreak ?? b.targetStreak ?? 0);
        return `<span class="badge-streak-num ${maxStreakNumClass(n)}">${n}</span>`;
    }
    if (b.badgeCode && typeof BadgeIcons !== 'undefined') {
        return BadgeIcons.renderBadgeIconContent(b.badgeCode, b.icon);
    }
    return b.icon || '🏅';
}

function badgeNameInner(b) {
    const lang = AppI18n.getLang();
    if (typeof BadgeIcons !== 'undefined') {
        return BadgeIcons.formatBadgeNameHtml(b.name, lang, b.badgeCode);
    }
    return b.name;
}

function renderBadgeItemHTML(b, totalRef) {
    if (!b.isCrown) totalRef.count += b.count > 0 ? b.count : 0;

    const isStreakFrame = b.isStreak || b.tier === 'streak'
        || (b.badgeCode && b.badgeCode.startsWith('streak_'));

    const classes = ['badge-item'];
    if (b.count > 0 || b.isCrown) {
        classes.push('unlocked');
        if (isStreakFrame) classes.push('streak');
        else if (b.tier) classes.push(b.tier);
    } else {
        classes.push('locked');
        if (isStreakFrame) classes.push('streak');
    }

    const countHtml = b.count > 1
        ? `<div class="badge-count">x${b.count}</div>`
        : '';

    let progressHtml = '';
    if (!b.isCrown && b.count === 0 && b.targetStreak != null) {
        progressHtml = `<div class="badge-progress">${b.currentStreak}/${b.targetStreak}</div>`;
    }

    return `
        <div class="${classes.join(' ')}">
            <div class="badge-icon-wrapper">
                <div class="badge-icon">${badgeIconInner(b)}</div>
                ${countHtml}
            </div>
            <div class="badge-name">${badgeNameInner(b)}</div>
            ${progressHtml}
        </div>`;
}

// Fetch full badge catalog + this profile's counts from cloud (two parallel queries).
// Returns array of {id, badge_code, display_name_en, display_name_zh, icon, category, is_hidden, count}
// or null on error/unavailable.
async function fetchAllCloudBadges(profileId) {
    if (!profileId || typeof window.SupabaseClient === 'undefined') return null;
    const db = window.SupabaseClient;
    try {
        const [defsRes, cntRes] = await Promise.all([
            db.from('badge_definitions')
              .select('id, badge_code, display_name_en, display_name_zh, icon, category, is_hidden')
              .eq('is_active', true),
            db.from('profile_badge_counters')
              .select('badge_id, count_available')
              .eq('profile_id', profileId),
        ]);
        if (defsRes.error || cntRes.error) return null;

        const countMap = {};
        (cntRes.data || []).forEach(r => { countMap[r.badge_id] = r.count_available || 0; });

        return (defsRes.data || []).map(bd => ({ ...bd, count: countMap[bd.id] || 0 }));
    } catch {
        return null;
    }
}

async function renderBadges() {
    const container = document.getElementById('badges-container');
    container.innerHTML = '';
    const totalRef = { count: 0 };
    const u    = currentUser;
    const lang = AppI18n.getLang();

    // ── CLOUD PATH — authoritative for all registered profiles ──────────────
    if (currentCloudId) {
        const allBadges = await fetchAllCloudBadges(currentCloudId);
        if (allBadges) {
            const bycat = { subject: [], skill: [], streak: [], hidden: [] };
            allBadges.forEach(b => {
                const c = bycat[b.category] ? b.category : 'subject';
                bycat[c].push(b);
            });

            const bdName = b => (lang === 'zh' && b.display_name_zh) ? b.display_name_zh : b.display_name_en;

            // Subject badges (all shown; locked if count = 0)
            if (bycat.subject.length) {
                const items = bycat.subject.map(b => ({
                    badgeCode: b.badge_code, icon: b.icon || '🏅', name: bdName(b), count: b.count,
                }));
                container.innerHTML += `
                    <div class="badge-category">
                        <div class="badge-category-title">🎓 ${AppI18n.t('index.badge_subject')}</div>
                        <div class="badge-grid">${items.map(b => renderBadgeItemHTML(b, totalRef)).join('')}</div>
                    </div>`;
            }

            // Skill badges
            if (bycat.skill.length) {
                const items = bycat.skill.map(b => ({
                    badgeCode: b.badge_code, icon: b.icon || '🌟', name: bdName(b), count: b.count,
                }));
                container.innerHTML += `
                    <div class="badge-category">
                        <div class="badge-category-title">🌟 ${AppI18n.t('index.badge_core')}</div>
                        <div class="badge-grid">${items.map(b => renderBadgeItemHTML(b, totalRef)).join('')}</div>
                    </div>`;
            }

            // Streak badges — rendered last (after easter eggs when present)
            let streakHtml = '';
            if (bycat.streak.length) {
                const currentStreak = cloudStreakData
                    ? (cloudStreakData.effective_streak ?? cloudStreakData.current_streak ?? 0)
                    : evaluateLocalStreakStatus(u).effective_streak;
                const maxStreak = cloudStreakData
                    ? (cloudStreakData.max_streak || 0)
                    : Math.max(parseInt(localStorage.getItem(`max_streak_${u}`) || '0', 10), currentStreak);
                const STREAK_DAYS = { streak_3: 3, streak_5: 5, streak_10: 10, streak_15: 15, streak_30: 30 };

                const streakItems = [{
                    badgeCode: 'max_streak', name: AppI18n.t('index.badge_max_streak'),
                    count: 1, tier: 'streak', isStreak: true,
                    currentStreak: maxStreak, targetStreak: maxStreak, isCrown: true,
                }];
                bycat.streak.forEach(b => {
                    const target  = STREAK_DAYS[b.badge_code] || 0;
                    const achieved = b.count > 0 || currentStreak >= target;
                    streakItems.push({
                        badgeCode: b.badge_code, icon: b.icon || '🔥', name: bdName(b),
                        count: achieved ? Math.max(b.count, 1) : 0,
                        tier: 'streak', isStreak: true,
                        targetStreak: target, currentStreak,
                    });
                });
                streakHtml = `
                    <div class="badge-category streak-category">
                        <div class="badge-category-title streak">📅 ${AppI18n.t('index.badge_streak_current', { n: currentStreak })}</div>
                        <div class="badge-grid">${streakItems.map(b => renderBadgeItemHTML(b, totalRef)).join('')}</div>
                    </div>`;
            }

            // Hidden badges — only show ones already earned (count > 0)
            const earnedHidden = bycat.hidden.filter(b => b.count > 0);
            if (earnedHidden.length) {
                const items = earnedHidden.map(b => ({
                    badgeCode: b.badge_code, icon: b.icon || '✨', name: bdName(b), count: b.count, tier: 'gold',
                }));
                container.innerHTML += `
                    <div class="badge-category">
                        <div class="badge-category-title easter">🎁 ${AppI18n.t('index.badge_easter')}</div>
                        <div class="badge-grid">${items.map(b => renderBadgeItemHTML(b, totalRef)).join('')}</div>
                    </div>`;
            }

            if (streakHtml) container.innerHTML += streakHtml;

            document.getElementById('total-badge-count').textContent = totalRef.count;
            return;
        }
        // Cloud fetch failed — fall through to local path as graceful degradation
    }

    // ── LOCAL PATH — no registered account or cloud unreachable ─────────────
    let localPerfects = 0;
    let localGames = 0;
    const subPerfects = { English: 0, Math: 0, '华文': 0, Science: 0 };
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key.startsWith('practice_stats_') || !key.includes(`_${u}_`)) continue;
        try {
            const parts = key.split('_');
            const sub   = parts[4];
            const stats = JSON.parse(localStorage.getItem(key));
            localPerfects += stats.perfects || 0;
            localGames    += stats.gamesPlayed || 0;
            if (sub && subPerfects[sub] !== undefined) subPerfects[sub] += stats.perfects || 0;
        } catch (e) { /* skip */ }
    }

    const ls = (k) => parseInt(localStorage.getItem(`${k}_${u}`) || '0', 10);

    const coreBadges = [
        { badgeCode: 'sharpshooter', icon: '🎯', name: AppI18n.t('index.badge_sharpshooter'), count: Math.max(localPerfects, ls('perfects_count')) },
        { badgeCode: 'speed_record', icon: '⚡️', name: AppI18n.t('index.badge_speed'), count: ls('speed_breaks') },
        { badgeCode: 'unlock_game', icon: '🎈', name: AppI18n.t('index.badge_balloon'), count: Math.max(localGames, ls('games_count')) },
    ];

    const subBadges = [
        { badgeCode: 'english_star', icon: '🔤', name: AppI18n.t('index.badge_english'), count: Math.max(subPerfects.English, ls('eng_badge_count')) },
        { badgeCode: 'math_genius', icon: '🔢', name: AppI18n.t('index.badge_math'), count: Math.max(subPerfects.Math, ls('math_badge_count')) },
        { badgeCode: 'chinese_ace', icon: '🐼', name: AppI18n.t('index.badge_chinese'), count: Math.max(subPerfects['华文'], ls('cn_badge_count')) },
        { badgeCode: 'science_pro', icon: '🌱', name: AppI18n.t('index.badge_science'), count: Math.max(subPerfects.Science, ls('sci_badge_count')) },
        { badgeCode: 'pinyin_pro', icon: '🎮', name: AppI18n.t('index.badge_pinyin'), count: ls('pinyin_badge_count') },
        { badgeCode: 'dictation_king', icon: '👑', name: AppI18n.t('index.badge_tingxie'), count: ls('tingxie_badge_count') },
        { badgeCode: 'character_spirit', icon: '🧚', name: AppI18n.t('index.badge_hanzi'), count: ls('hanzi_badge_count') },
    ];
    container.innerHTML += `
        <div class="badge-category">
            <div class="badge-category-title">🎓 ${AppI18n.t('index.badge_subject')}</div>
            <div class="badge-grid">${subBadges.map(b => renderBadgeItemHTML(b, totalRef)).join('')}</div>
        </div>`;
    container.innerHTML += `
        <div class="badge-category">
            <div class="badge-category-title">🌟 ${AppI18n.t('index.badge_core')}</div>
            <div class="badge-grid">${coreBadges.map(b => renderBadgeItemHTML(b, totalRef)).join('')}</div>
        </div>`;

    const currentStreak = (cloudStreakData || evaluateLocalStreakStatus(u)).effective_streak
        ?? parseInt(localStorage.getItem(`current_streak_${u}`) || '0', 10);
    const maxStreak     = Math.max(parseInt(localStorage.getItem(`max_streak_${u}`) || '0', 10), currentStreak);
    let streakMilestones = [3, 5, 10, 15, 30];
    if (currentStreak >= 30) {
        const nextTarget = (Math.floor(currentStreak / 5) + 1) * 5;
        streakMilestones = [nextTarget - 20, nextTarget - 15, nextTarget - 10, nextTarget - 5, nextTarget];
    }
    const streakBadges = [{
        badgeCode: 'max_streak', name: AppI18n.t('index.badge_max_streak'),
        count: 1, tier: 'streak', isStreak: true,
        targetStreak: maxStreak, currentStreak: maxStreak, isCrown: true,
    }];
    const streakCodeForDay = { 3: 'streak_3', 5: 'streak_5', 10: 'streak_10', 15: 'streak_15', 30: 'streak_30' };
    streakMilestones.forEach(day => {
        streakBadges.push({
            badgeCode: streakCodeForDay[day] || `streak_${day}`,
            icon: '🔥', name: AppI18n.t('index.streak_milestone', { n: day }),
            count: currentStreak >= day ? 1 : 0,
            tier: 'streak', isStreak: true,
            targetStreak: day, currentStreak,
        });
    });

    const easterData = [
        { badgeCode: 'early_bird', icon: '🌅', name: AppI18n.t('index.badge_earlybird'), count: ls('easter_earlybird'), tier: 'gold' },
        { badgeCode: 'night_owl', icon: '🦉', name: AppI18n.t('index.badge_nightowl'), count: ls('easter_nightowl'), tier: 'gold' },
        { badgeCode: 'hat_trick', icon: '🔥', name: AppI18n.t('index.badge_hattrick'), count: ls('easter_hattrick'), tier: 'gold' },
        { badgeCode: 'weekend_maniac', icon: '🎉', name: AppI18n.t('index.badge_weekend'), count: ls('easter_weekend'), tier: 'gold' },
        { badgeCode: 'holiday_charge', icon: '🔋', name: AppI18n.t('index.badge_holiday'), count: ls('easter_holiday'), tier: 'gold' },
    ].filter(b => b.count > 0);
    if (easterData.length) {
        container.innerHTML += `
            <div class="badge-category">
                <div class="badge-category-title easter">🎁 ${AppI18n.t('index.badge_easter')}</div>
                <div class="badge-grid">${easterData.map(b => renderBadgeItemHTML(b, totalRef)).join('')}</div>
            </div>`;
    }

    container.innerHTML += `
        <div class="badge-category streak-category">
            <div class="badge-category-title streak">📅 ${AppI18n.t('index.badge_streak_current', { n: currentStreak })}</div>
            <div class="badge-grid">${streakBadges.map(b => renderBadgeItemHTML(b, totalRef)).join('')}</div>
        </div>`;

    document.getElementById('total-badge-count').textContent = totalRef.count;
}

let pendingKidSwitch = null;
let kidPinValue = '';

/** Guest trial: switch + local add. Registered: switch only when 2+ profiles (add via parent). */
function shouldShowSwitchUserBtn() {
    if (!hubParentLoggedIn) return true;
    return AUTH.getKidProfiles().length > 1;
}

function canAddProfileOnStudentHub() {
    if (hubParentLoggedIn) return false;
    return AUTH.getKidProfiles().length < 3;
}

function updateSwitchUserVisibility() {
    const btn = document.getElementById('switch-user-btn');
    const footer = document.querySelector('.footer-actions');
    if (!btn) return;
    const show = shouldShowSwitchUserBtn();
    btn.hidden = !show;
    btn.style.display = show ? '' : 'none';
    footer?.classList.toggle('footer-actions--single', !show);
}

async function executeSwitchUser(name, grade) {
    currentUser  = name;
    currentGrade = grade;
    AUTH.setActiveKid(name, grade);

    currentCloudId = await AUTH.resolveKidCloudId(name);
    // Reset level cache when switching to a different profile.
    if (currentLevelProfileId !== currentCloudId) {
        currentLevelProfileId = currentCloudId;
        currentLevelTier = 'Bronze';
        currentLevelNo = 1;
    }

    renderDashboardAvatar();
    document.getElementById('dash-name').textContent = name;
    updateCnSubjectLabel();

    cloudStreakData = null; // reset until cloud fetch resolves
    updateStreakUI();       // immediate render from local while we wait

    await Promise.all([
        loadStreakStatus(currentCloudId).then(() => updateStreakUI()),
        renderBadges(),
        loadAndShowLevel(currentCloudId, name),
        refreshAvatarPremiumStatus().then(() => enforceAvatarSelectionForCurrentPlan()).then(() => renderDashboardAvatar()),
    ]);

    maybeShowStreakBreakModal();
    updateSwitchUserVisibility();
    showScreen('dashboard-screen');
}

async function loadAndShowLevel(_cloudId, name) {
    const chip = document.getElementById('level-chip');

    if (!chip) return;

    const validId = await AUTH.resolveKidCloudId(name);
    currentCloudId = validId;

    // Render immediately from cache to avoid visual flash on language switch.
    const showTier = (currentLevelProfileId === validId) ? currentLevelTier : 'Bronze';
    const showLevel = (currentLevelProfileId === validId) ? currentLevelNo : 1;
    applyLevelChipContent(showTier, showLevel);
    chip.style.display = 'flex';
    applyLevelChipTierColor(showTier);

    chip.onclick = async () => {
        const id = await AUTH.resolveKidCloudId(name);
        currentCloudId = id;
        if (!id) {
            showHubNotice((typeof AppI18n !== 'undefined')
                ? AppI18n.t('index.forge_need_register')
                : 'Register as a parent to save progress and unlock Forge. Tap 🔒 Parent on the home screen.');
            return;
        }
        window.location.href =
            `synthesis.html?kid=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}`;
    };

    if (!validId || typeof window.SupabaseClient === 'undefined') return;

    try {
        const { data } = await window.SupabaseClient
            .from('profile_badge_levels')
            .select('level_no, tier_name')
            .eq('profile_id', validId)
            .single();
        if (data) {
            const tierName = data.tier_name || 'Bronze';
            currentLevelProfileId = validId;
            currentLevelTier = tierName;
            currentLevelNo = data.level_no || 1;
            applyLevelChipContent(tierName, data.level_no);
            applyLevelChipTierColor(tierName);
        }
    } catch (_) { /* silent — chip keeps default */ }
}

function getAvatarForName(name) {
    const profiles = AUTH.getKidProfiles();
    const idx = profiles.findIndex(p => p.name === name);
    if (idx === -1) return '🌟';
    return getProfileAvatar(profiles[idx], idx);
}

function launchPractice(subject) {
    localStorage.setItem('currentSubject', subject);
    window.location.href = 'practice.html';
}

function updateKidPinDots(isError = false) {
    for (let i = 0; i < 3; i++) {
        const dot = document.getElementById(`kid-dot-${i}`);
        if (!dot) continue;
        dot.classList.toggle('filled', i < kidPinValue.length);
        dot.classList.toggle('error', isError);
    }
}

function resetKidPinEntry() {
    kidPinValue = '';
    const input = document.getElementById('kid-pin-input');
    if (input) input.value = '';
    updateKidPinDots(false);
    const msg = document.getElementById('kid-pin-msg');
    if (msg) msg.textContent = '';
}

function showKidPinScreen(profile) {
    pendingKidSwitch = { name: profile.name, grade: profile.grade, cloudId: profile.cloudId || '' };
    resetKidPinEntry();

    const idx = AUTH.getKidProfiles().findIndex((p) => p.name === profile.name);
    document.getElementById('kid-pin-avatar').textContent = getProfileAvatar(profile, idx >= 0 ? idx : 0);
    document.getElementById('kid-pin-title').textContent = AppI18n.t('index.child_pin_title', { name: profile.name });
    document.getElementById('kid-pin-subtitle').textContent = AppI18n.t('index.child_pin_subtitle');

    showScreen('kid-pin-screen');
    setTimeout(() => document.getElementById('kid-pin-input')?.focus(), 100);
}

async function submitKidPin() {
    const pin = kidPinValue;
    kidPinValue = '';
    document.getElementById('kid-pin-input').value = '';

    if (!pendingKidSwitch) return;

    const { cloudId, name, grade } = pendingKidSwitch;
    if (!cloudId) {
        document.getElementById('kid-pin-msg').textContent = AppI18n.t('index.child_pin_no_cloud');
        updateKidPinDots(true);
        setTimeout(resetKidPinEntry, 600);
        return;
    }

    const { ok, error } = await AUTH.verifyKidPinOnCloud(cloudId, pin);
    if (error && error.includes('Not authenticated')) {
        document.getElementById('kid-pin-msg').textContent = AppI18n.t('index.child_pin_need_parent');
        updateKidPinDots(true);
        setTimeout(resetKidPinEntry, 800);
        return;
    }
    if (!ok) {
        document.getElementById('kid-pin-msg').textContent = AppI18n.t('index.child_pin_wrong');
        updateKidPinDots(true);
        setTimeout(resetKidPinEntry, 600);
        return;
    }

    AUTH.setKidPinSessionVerified(cloudId);
    const target = pendingKidSwitch;
    pendingKidSwitch = null;
    executeSwitchUser(target.name, target.grade);
}

function requestProfileSwitch(profile) {
    if (!profile.kidPinEnabled) {
        executeSwitchUser(profile.name, profile.grade);
        return;
    }
    if (profile.cloudId && AUTH.isKidPinSessionVerified(profile.cloudId)) {
        executeSwitchUser(profile.name, profile.grade);
        return;
    }
    showKidPinScreen(profile);
}

function appendKidPinDigit(d) {
    if (kidPinValue.length >= 3) return;
    kidPinValue += d;
    document.getElementById('kid-pin-input').value = kidPinValue;
    updateKidPinDots(false);
    if (kidPinValue.length === 3) submitKidPin();
}

function deleteKidPinDigit() {
    kidPinValue = kidPinValue.slice(0, -1);
    document.getElementById('kid-pin-input').value = kidPinValue;
    updateKidPinDots(false);
}

function wireKidPinScreen() {
    document.querySelectorAll('.kid-pin-key[data-digit]').forEach((btn) => {
        btn.addEventListener('click', () => {
            appendKidPinDigit(btn.dataset.digit);
            document.getElementById('kid-pin-input')?.focus();
        });
    });
    document.getElementById('kid-pin-del')?.addEventListener('click', () => {
        deleteKidPinDigit();
        document.getElementById('kid-pin-input')?.focus();
    });

    const input = document.getElementById('kid-pin-input');
    input?.addEventListener('input', () => {
        kidPinValue = input.value.replace(/\D/g, '').slice(0, 3);
        input.value = kidPinValue;
        updateKidPinDots(false);
        if (kidPinValue.length === 3) submitKidPin();
    });

    document.getElementById('kid-pin-cancel-btn')?.addEventListener('click', () => {
        pendingKidSwitch = null;
        resetKidPinEntry();
        buildUserScreen();
        showScreen('user-screen');
    });
}

// ── Dynamic user screen ──────────────────────────────────────────────────────

let selectedGrade    = '';
let selectedAvatarId = 'star';

function buildUserScreen() {
    const profiles  = AUTH.getKidProfiles();
    const screen    = document.getElementById('user-screen');

    if (profiles.length === 0) {
        if (hubParentLoggedIn) {
            renderRegisteredEmptyState(screen);
        } else {
            renderNameGate(screen);
        }
    } else {
        renderProfilePicker(screen, profiles);
    }
}

function renderRegisteredEmptyState(screen) {
    screen.innerHTML = `
        <h2 class="user-screen-title" data-i18n="index.who_learning"></h2>
        <p class="registered-empty-msg" data-i18n="index.registered_no_profiles"></p>
        <a class="btn-action" href="../parent/dashboard.html" data-i18n="index.go_parent_dashboard"></a>`;
    AppI18n.applyTranslations();
}

function renderProfilePicker(screen, profiles) {
    const canAdd = canAddProfileOnStudentHub();
    const addBtn = canAdd
        ? `<button type="button" class="name-btn-add" id="show-name-gate-btn" data-i18n="index.add_profile"></button>`
        : '';

    screen.innerHTML = `
        <h2 class="user-screen-title" data-i18n="index.who_learning"></h2>
        ${profiles.map((p, i) => `
            <button class="name-btn" data-user="${p.name}" data-grade="${p.grade}">
                <span class="avatar">${getProfileAvatar(p, i)}</span> ${p.name}
            </button>`).join('')}
        ${addBtn}`;

    AppI18n.applyTranslations();

    screen.querySelectorAll('.name-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const profile = profiles.find((p) => p.name === btn.dataset.user);
            if (profile) requestProfileSwitch(profile);
            else executeSwitchUser(btn.dataset.user, btn.dataset.grade);
        });
    });

    const gateBtn = screen.querySelector('#show-name-gate-btn');
    if (gateBtn) gateBtn.addEventListener('click', () => renderNameGate(screen));
}

function buildAvatarPickerHTML(selectedId) {
    return ProfileCatalog.AVATARS.map((a) => `
        <button type="button" class="avatar-pick-btn${a.id === selectedId ? ' selected' : ''}"
                data-avatar-id="${a.id}" aria-label="${a.id}">
            <span class="avatar-pick-emoji">${a.emoji}</span>
        </button>`).join('');
}

function renderNameGate(screen) {
    selectedAvatarId = 'star';
    screen.innerHTML = `
        <h2 class="user-screen-title" data-i18n="index.who_learning"></h2>
        <div class="name-gate">
            <input type="text" id="new-kid-name" class="name-gate-input"
                   maxlength="20" autocomplete="off">
            <div>
                <p class="name-gate-label" data-i18n="index.select_grade"></p>
                <div class="grade-picker" id="grade-picker">
                    ${['P1','P2','P3','P4','P5','P6'].map(g =>
                        `<button type="button" class="grade-btn" data-grade="${g}">${g}</button>`
                    ).join('')}
                </div>
            </div>
            <div>
                <p class="name-gate-label" data-i18n="index.select_avatar"></p>
                <div class="avatar-picker-grid" id="avatar-picker">
                    ${buildAvatarPickerHTML(selectedAvatarId)}
                </div>
            </div>
            <div class="name-gate-error" id="name-gate-error"></div>
            <button type="button" class="btn-start" id="start-learning-btn" disabled data-i18n="index.start_learning"></button>
            ${AUTH.getKidProfiles().length > 0
                ? `<button type="button" class="btn-action" id="back-to-profiles-btn" style="margin-top:0;" data-i18n="index.back_profiles"></button>`
                : ''}
        </div>`;

    AppI18n.applyTranslations();

    selectedGrade = '';
    const nameInput  = screen.querySelector('#new-kid-name');
    const startBtn   = screen.querySelector('#start-learning-btn');
    const errorEl    = screen.querySelector('#name-gate-error');
    const backBtn    = screen.querySelector('#back-to-profiles-btn');

    nameInput.placeholder = AppI18n.t('index.name_placeholder');

    function checkReady() {
        startBtn.disabled = !(nameInput.value.trim().length >= 2 && selectedGrade && selectedAvatarId);
    }

    nameInput.addEventListener('input', () => {
        nameInput.classList.remove('error');
        errorEl.textContent = '';
        checkReady();
    });

    screen.querySelectorAll('.avatar-pick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            screen.querySelectorAll('.avatar-pick-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedAvatarId = btn.dataset.avatarId;
            checkReady();
        });
    });

    screen.querySelectorAll('.grade-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            screen.querySelectorAll('.grade-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedGrade = btn.dataset.grade;
            checkReady();
        });
    });

    startBtn.addEventListener('click', () => {
        if (hubParentLoggedIn) return;
        const name = nameInput.value.trim();
        if (name.length < 2) return;
        const ok = AUTH.addKidProfile({
            name,
            grade: selectedGrade,
            avatarId: selectedAvatarId,
        });
        if (!ok) {
            const msg = AUTH.getKidProfiles().length >= 3
                ? AppI18n.t('index.profile_full')
                : AppI18n.t('index.name_taken');
            errorEl.textContent = msg;
            nameInput.classList.add('error');
            return;
        }
        executeSwitchUser(name, selectedGrade);
    });

    if (backBtn) backBtn.addEventListener('click', () => buildUserScreen());

    setTimeout(() => nameInput.focus(), 100);
}

// ── Hub refresh ──────────────────────────────────────────────────────────────

function refreshUserScreenI18n() {
    const screen = document.getElementById('user-screen');
    if (!screen.classList.contains('is-visible')) return;

    const savedName = document.getElementById('new-kid-name')?.value ?? '';

    if (document.getElementById('new-kid-name')) {
        renderNameGate(screen);
        const input = document.getElementById('new-kid-name');
        if (input && savedName) input.value = savedName;
        if (selectedAvatarId) {
            screen.querySelector(`.avatar-pick-btn[data-avatar-id="${selectedAvatarId}"]`)?.classList.add('selected');
        }
        if (selectedGrade) {
            screen.querySelector(`.grade-btn[data-grade="${selectedGrade}"]`)?.classList.add('selected');
        }
        document.getElementById('start-learning-btn').disabled =
            !(savedName.trim().length >= 2 && selectedGrade && selectedAvatarId);
    } else {
        buildUserScreen();
    }
    showScreen('user-screen');
}

function updateCnSubjectLabel() {
    const el = document.getElementById('cn-label');
    if (!el || !currentUser) return;
    const profile = AUTH.getKidProfiles().find((p) => p.name === currentUser);
    const level = profile?.chineseLevel === 'HCL' ? 'HCL' : 'CL';
    const lang = (typeof AppI18n !== 'undefined') ? AppI18n.getLang() : 'en';
    el.textContent = ProfileCatalog.chineseLabel(level, lang);
}

function refreshHub() {
    AppI18n.applyTranslations();
    initDate();
    updateCnSubjectLabel();
    updateStreakUI();
    if (currentUser) renderBadges();
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    AppI18n.applyTranslations();
    initDate();
    wireKidPinScreen();

    hubParentLoggedIn = !!(await AUTH.getParentSession());
    if (hubParentLoggedIn) {
        await AUTH.reconcileLocalKidsWithCloud();
    }

    // Top nav: lang toggle (hidden on dashboard; long-press calendar to switch there)
    const langBtn = document.getElementById('lang-toggle');
    langBtn.textContent = AppI18n.t('lang.toggle');
    langBtn.addEventListener('click', toggleAppLanguage);
    wireCalendarLangToggle();
    updateLangToggleVisibility();

    // Shop button
    document.getElementById('shop-btn').addEventListener('click', () => {
        window.location.href = 'shop.html';
    });
    document.getElementById('dash-avatar-btn')?.addEventListener('click', openAvatarModal);
    document.getElementById('avatar-modal-close')?.addEventListener('click', closeAvatarModal);
    document.getElementById('avatar-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'avatar-modal') closeAvatarModal();
    });

    document.getElementById('hub-notice-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'hub-notice-modal') closeHubNotice();
    });
    document.querySelector('#hub-notice-modal .hub-notice-card')?.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Switch user from dashboard (guest always; registered only when 2+ profiles)
    document.getElementById('switch-user-btn').addEventListener('click', () => {
        if (!shouldShowSwitchUserBtn()) return;
        buildUserScreen();
        showScreen('user-screen');
    });

    // Subject cards
    document.querySelectorAll('.grid-cards .card-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.subject) launchPractice(btn.dataset.subject);
            else if (btn.dataset.action) showScreen(btn.dataset.action);
        });
    });

    // Submenu buttons
    document.querySelectorAll('.menu-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.subject) launchPractice(btn.dataset.subject);
            else if (btn.dataset.link) window.location.href = btn.dataset.link;
        });
    });

    // Back buttons
    document.querySelectorAll('.back-hub-btn').forEach(btn => {
        btn.addEventListener('click', () => showScreen(btn.dataset.screen));
    });

    // Determine initial view
    updateSwitchUserVisibility();
    const active = AUTH.getActiveKid();
    if (active) {
        executeSwitchUser(active.name, active.grade);
    } else {
        buildUserScreen();
        showScreen('user-screen');
    }
});
