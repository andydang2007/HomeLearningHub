// Student hub — dynamic profile picker + badge wall

let currentUser  = '';
let currentGrade = '';

function getProfileAvatar(profile, index) {
    if (profile.avatarId) return ProfileCatalog.emojiForId(profile.avatarId);
    return ProfileCatalog.AVATARS[index % ProfileCatalog.AVATARS.length].emoji;
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
    document.getElementById('school-term-display').innerHTML = `
        <div class="term-date">📅 ${now.getDate()} ${months[now.getMonth()]}</div>
        <div class="term-label">${termStr}</div>`;
}

function updateStreakUI() {
    const totalDays   = parseInt(localStorage.getItem(`total_days_${currentUser}`) || '0', 10);
    const lastCheckin = localStorage.getItem(`last_checkin_date_${currentUser}`)
        || localStorage.getItem(`last_date_${currentUser}`);
    const todayStr  = getSGTDateString();
    const streakEl = document.getElementById('dash-streak');

    if (totalDays === 0) {
        streakEl.className = 'streak-badge pending';
        streakEl.textContent = AppI18n.t('index.streak_start');
    } else if (lastCheckin === todayStr) {
        streakEl.className = 'streak-badge completed';
        streakEl.textContent = AppI18n.t('index.checkin', { n: totalDays });
    } else {
        streakEl.className = 'streak-badge pending';
        streakEl.textContent = AppI18n.t('index.streak_pending', { n: totalDays });
    }
}

function renderBadgeItemHTML(b, totalRef) {
    totalRef.count += b.count > 0 ? b.count : (b.isCrown ? 1 : 0);

    const classes = ['badge-item'];
    if (b.count > 0 || b.isCrown) {
        classes.push('unlocked');
        if (b.tier) classes.push(b.tier);
    } else {
        classes.push('locked');
    }

    const countHtml = b.count > 1
        ? `<div class="badge-count">x${b.count}</div>`
        : '';

    let progressHtml = '';
    if (b.isCrown) {
        progressHtml = `<div class="badge-progress crown">${b.currentStreak} ${AppI18n.getLang() === 'zh' ? '天' : 'days'}</div>`;
    } else if (b.count === 0 && b.targetStreak != null) {
        progressHtml = `<div class="badge-progress">${b.currentStreak}/${b.targetStreak}</div>`;
    }

    return `
        <div class="${classes.join(' ')}">
            <div class="badge-icon-wrapper">
                <div class="badge-icon">${b.icon}</div>
                ${countHtml}
            </div>
            <div class="badge-name">${b.name}</div>
            ${progressHtml}
        </div>`;
}

function renderBadges() {
    const container = document.getElementById('badges-container');
    container.innerHTML = '';

    let localPerfects = 0;
    let localGames = 0;
    const subPerfects = { English: 0, Math: 0, '华文': 0, Science: 0 };

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key.startsWith('practice_stats_') || !key.includes(`_${currentUser}_`)) continue;
        try {
            const parts = key.split('_');
            const sub   = parts[4];
            const stats = JSON.parse(localStorage.getItem(key));
            localPerfects += stats.perfects || 0;
            localGames    += stats.gamesPlayed || 0;
            if (sub && subPerfects[sub] !== undefined) subPerfects[sub] += stats.perfects || 0;
        } catch (e) { /* skip */ }
    }

    const totalRef = { count: 0 };
    const u = currentUser;
    const ls = (k) => parseInt(localStorage.getItem(`${k}_${u}`) || '0', 10);

    const coreBadges = [
        { icon: '🎯', name: AppI18n.t('index.badge_sharpshooter'), count: Math.max(localPerfects, ls('perfects_count')) },
        { icon: '⚡️', name: AppI18n.t('index.badge_speed'),        count: ls('speed_breaks') },
        { icon: '🎈', name: AppI18n.t('index.badge_balloon'),      count: Math.max(localGames, ls('games_count')) },
    ];

    container.innerHTML += `
        <div class="badge-category">
            <div class="badge-category-title">🌟 ${AppI18n.t('index.badge_core')}</div>
            <div class="badge-grid">${coreBadges.map(b => renderBadgeItemHTML(b, totalRef)).join('')}</div>
        </div>`;

    const subBadges = [
        { icon: '🔤', name: AppI18n.t('index.badge_english'), count: Math.max(subPerfects.English, ls('eng_badge_count')) },
        { icon: '🔢', name: AppI18n.t('index.badge_math'),    count: Math.max(subPerfects.Math, ls('math_badge_count')) },
        { icon: '🐼', name: AppI18n.t('index.badge_chinese'), count: Math.max(subPerfects['华文'], ls('cn_badge_count')) },
        { icon: '🌱', name: AppI18n.t('index.badge_science'), count: Math.max(subPerfects.Science, ls('sci_badge_count')) },
        { icon: '🎮', name: AppI18n.t('index.badge_pinyin'),  count: ls('pinyin_badge_count') },
        { icon: '👑', name: AppI18n.t('index.badge_tingxie'), count: ls('tingxie_badge_count') },
        { icon: '🧚', name: AppI18n.t('index.badge_hanzi'),   count: ls('hanzi_badge_count') },
    ];

    container.innerHTML += `
        <div class="badge-category">
            <div class="badge-category-title">🎓 ${AppI18n.t('index.badge_subject')}</div>
            <div class="badge-grid">${subBadges.map(b => renderBadgeItemHTML(b, totalRef)).join('')}</div>
        </div>`;

    const currentStreak = parseInt(localStorage.getItem(`current_streak_${u}`) || '0', 10);
    const maxStreak     = Math.max(parseInt(localStorage.getItem(`max_streak_${u}`) || '0', 10), currentStreak);

    let streakMilestones = [3, 5, 10, 15, 30];
    if (currentStreak >= 30) {
        const nextTarget = (Math.floor(currentStreak / 5) + 1) * 5;
        streakMilestones = [nextTarget - 20, nextTarget - 15, nextTarget - 10, nextTarget - 5, nextTarget];
    }

    const streakBadges = [
        {
            icon: '👑',
            name: AppI18n.t('index.badge_max_streak'),
            count: 1,
            tier: 'gold',
            targetStreak: maxStreak,
            currentStreak: maxStreak,
            isCrown: true,
        },
    ];

    streakMilestones.forEach(day => {
        const achieved = currentStreak >= day;
        streakBadges.push({
            icon: '🔥',
            name: AppI18n.t('index.streak_milestone', { n: day }),
            count: achieved ? 1 : 0,
            tier: day >= 15 ? 'gold' : (day >= 10 ? 'silver' : 'bronze'),
            targetStreak: day,
            currentStreak: currentStreak,
        });
    });

    container.innerHTML += `
        <div class="badge-category">
            <div class="badge-category-title">📅 ${AppI18n.t('index.badge_streak_current', { n: currentStreak })}</div>
            <div class="badge-grid">${streakBadges.map(b => renderBadgeItemHTML(b, totalRef)).join('')}</div>
        </div>`;

    const easterData = [
        { icon: '🌅', name: AppI18n.t('index.badge_earlybird'), count: ls('easter_earlybird'), tier: 'gold' },
        { icon: '🦉', name: AppI18n.t('index.badge_nightowl'),  count: ls('easter_nightowl'),  tier: 'gold' },
        { icon: '🔥', name: AppI18n.t('index.badge_hattrick'),   count: ls('easter_hattrick'),   tier: 'gold' },
        { icon: '🎉', name: AppI18n.t('index.badge_weekend'),   count: ls('easter_weekend'),   tier: 'gold' },
        { icon: '🔋', name: AppI18n.t('index.badge_holiday'),   count: ls('easter_holiday'),   tier: 'gold' },
    ].filter(b => b.count > 0);

    if (easterData.length > 0) {
        container.innerHTML += `
            <div class="badge-category">
                <div class="badge-category-title easter">🎁 ${AppI18n.t('index.badge_easter')}</div>
                <div class="badge-grid">${easterData.map(b => renderBadgeItemHTML(b, totalRef)).join('')}</div>
            </div>`;
    }

    document.getElementById('total-badge-count').textContent = totalRef.count;
}

function executeSwitchUser(name, grade) {
    currentUser  = name;
    currentGrade = grade;
    AUTH.setActiveKid(name, grade);

    document.getElementById('dash-avatar').textContent = getAvatarForName(name);
    document.getElementById('dash-name').textContent   = AppI18n.t('index.greeting', { name });
    document.getElementById('cn-label').textContent    =
        grade === 'P3' || grade === 'P4' || grade === 'P5' || grade === 'P6'
            ? AppI18n.t('index.subject_cn')
            : AppI18n.t('index.subject_cn_short');

    updateStreakUI();
    renderBadges();
    showScreen('dashboard-screen');
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

// ── Dynamic user screen ──────────────────────────────────────────────────────

let selectedGrade    = '';
let selectedAvatarId = 'star';

function buildUserScreen() {
    const profiles  = AUTH.getKidProfiles();
    const screen    = document.getElementById('user-screen');

    if (profiles.length === 0) {
        renderNameGate(screen);
    } else {
        renderProfilePicker(screen, profiles);
    }
}

function renderProfilePicker(screen, profiles) {
    const canAdd = profiles.length < 3;
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
        btn.addEventListener('click', () => executeSwitchUser(btn.dataset.user, btn.dataset.grade));
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

function refreshHub() {
    AppI18n.applyTranslations();
    initDate();
    updateStreakUI();
    if (currentUser) renderBadges();
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    AppI18n.applyTranslations();
    initDate();

    // Top nav: lang toggle
    const langBtn = document.getElementById('lang-toggle');
    langBtn.textContent = AppI18n.t('lang.toggle');
    langBtn.addEventListener('click', () => {
        const next = AppI18n.getLang() === 'en' ? 'zh' : 'en';
        AppI18n.setLang(next);
        langBtn.textContent = AppI18n.t('lang.toggle');
        refreshHub();
        refreshUserScreenI18n();
        if (currentUser) {
            document.getElementById('dash-name').textContent = AppI18n.t('index.greeting', { name: currentUser });
        }
    });

    // Shop button
    document.getElementById('shop-btn').addEventListener('click', () => {
        window.location.href = 'shop.html';
    });

    // Switch user from dashboard
    document.getElementById('switch-user-btn').addEventListener('click', () => {
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
    const active = AUTH.getActiveKid();
    if (active) {
        executeSwitchUser(active.name, active.grade);
    } else {
        buildUserScreen();
        showScreen('user-screen');
    }
});
