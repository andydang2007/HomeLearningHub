// student/synthesis.js — Badge Synthesis & Level-Up Forge

'use strict';

const db = window.SupabaseClient;
const urlParams = new URLSearchParams(window.location.search);
const kidId = urlParams.get('kid');

/* ═══════════════════════════════════════════════════════
   TIER CONFIG
   ═══════════════════════════════════════════════════════ */
const TIERS = {
    Bronze:  { emoji: '🥉', color: '#cd7f32', glow: '#ff9f52', rgb: '205,127,50'  },
    Silver:  { emoji: '🥈', color: '#b0bec5', glow: '#e8eaf0', rgb: '176,190,197' },
    Gold:    { emoji: '🥇', color: '#ffd700', glow: '#fff176', rgb: '255,215,0'   },
    Diamond: { emoji: '💎', color: '#4fc3f7', glow: '#b3e5fc', rgb: '79,195,247'  },
    Legend:  { emoji: '⭐', color: '#ce93d8', glow: '#f48fb1', rgb: '206,147,216' },
};

function getTier(lvl) {
    if (lvl <=  9) return 'Bronze';
    if (lvl <= 24) return 'Silver';
    if (lvl <= 44) return 'Gold';
    if (lvl <= 69) return 'Diamond';
    return 'Legend';
}

function t(key, vars) {
    return (typeof AppI18n !== 'undefined') ? AppI18n.t(key, vars) : key;
}

/* ═══════════════════════════════════════════════════════
   PAGE STATE
   ═══════════════════════════════════════════════════════ */
const S = {
    profileId:       kidId,
    profileName:     urlParams.get('name') || 'Student',
    isPremium:       false,
    currentLevel:    1,
    currentTier:     'Bronze',
    crystalBalance:  0,
    regularBadges:   [],   // {badge_id, display_name_en, display_name_zh, icon, available}
    hiddenBadges:    [],   // same + is_hidden
    requiredBadges:  10,
    requiredCrystals: 0,
    nextLevel:       2,
    nextTier:        'Bronze',
    spend:           {},   // badge_id → qty
    hiddenSpend:     {},   // badge_id → { mode: 'badges'|'crystals', qty: number }
    selectedBadgeId: null,
    selectedHiddenId: null,
    hiddenDraftMode: 'badges',
    hiddenDraftQty:  0,
};

/* ═══════════════════════════════════════════════════════
   AMBIENT PARTICLE SYSTEM
   ═══════════════════════════════════════════════════════ */
const ambCanvas = document.getElementById('particle-canvas');
const ambCtx    = ambCanvas.getContext('2d');
let   ambParts  = [];

function resizeAmbCanvas() {
    ambCanvas.width  = window.innerWidth;
    ambCanvas.height = window.innerHeight;
}

function makeAmbPart() {
    return {
        x:     Math.random() * ambCanvas.width,
        y:     Math.random() * ambCanvas.height,
        r:     Math.random() * 1.4 + 0.4,
        speed: Math.random() * 0.25 + 0.06,
        angle: Math.random() * Math.PI * 2,
        alpha: Math.random() * 0.45 + 0.1,
        spin:  (Math.random() - 0.5) * 0.015,
    };
}

function loopAmbient() {
    const tier = TIERS[S.currentTier] || TIERS.Bronze;
    ambCtx.clearRect(0, 0, ambCanvas.width, ambCanvas.height);
    ambParts.forEach(p => {
        p.angle += p.spin;
        p.x += Math.cos(p.angle) * p.speed;
        p.y += Math.sin(p.angle) * p.speed;
        if (p.x < -4 || p.x > ambCanvas.width + 4 || p.y < -4 || p.y > ambCanvas.height + 4) {
            Object.assign(p, makeAmbPart());
        }
        ambCtx.beginPath();
        ambCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ambCtx.fillStyle = `rgba(${tier.rgb},${p.alpha})`;
        ambCtx.fill();
    });
    requestAnimationFrame(loopAmbient);
}

/* ═══════════════════════════════════════════════════════
   LEVEL-UP BURST PARTICLES
   ═══════════════════════════════════════════════════════ */
const burstCanvas = document.getElementById('levelup-canvas');
const burstCtx    = burstCanvas.getContext('2d');
let   burstParts  = [];
let   burstRAF    = 0;

function fireBurst(tierName) {
    burstCanvas.width  = window.innerWidth;
    burstCanvas.height = window.innerHeight;
    const cx = burstCanvas.width  / 2;
    const cy = burstCanvas.height / 2;
    const tc = TIERS[tierName] || TIERS.Legend;
    burstParts = [];

    for (let i = 0; i < 140; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 7 + 2;
        burstParts.push({
            x: cx, y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1,
            r:    Math.random() * 4 + 1.5,
            life: 1,
            decay: Math.random() * 0.018 + 0.012,
            color: Math.random() > 0.45 ? tc.color : tc.glow,
            shape: Math.random() > 0.7 ? 'rect' : 'circle',
        });
    }
    cancelAnimationFrame(burstRAF);
    loopBurst();
}

function loopBurst() {
    burstCtx.clearRect(0, 0, burstCanvas.width, burstCanvas.height);
    burstParts = burstParts.filter(p => p.life > 0.02);
    burstParts.forEach(p => {
        p.x  += p.vx;
        p.y  += p.vy;
        p.vy += 0.12; // gravity
        p.life -= p.decay;
        burstCtx.globalAlpha = Math.max(0, p.life);
        burstCtx.fillStyle = p.color;
        if (p.shape === 'rect') {
            burstCtx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r * 1.6);
        } else {
            burstCtx.beginPath();
            burstCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            burstCtx.fill();
        }
    });
    burstCtx.globalAlpha = 1;
    if (burstParts.length > 0) burstRAF = requestAnimationFrame(loopBurst);
}

/* ═══════════════════════════════════════════════════════
   DATA LOADING
   ═══════════════════════════════════════════════════════ */
async function loadData() {
    if (!kidId) {
        showGlobalError('No profile ID in URL. Please go back and try again.');
        return;
    }

    try {
        const { data, error } = await db.rpc('get_synthesis_data', { kid_profile_id: kidId });
        if (error) throw error;
        if (!data)  throw new Error('Empty response from server');

        S.currentLevel   = data.current_level    || 1;
        S.currentTier    = data.current_tier      || getTier(S.currentLevel);
        S.crystalBalance = data.crystal_balance   || 0;
        S.isPremium      = data.plan_tier         === 'premium';
        S.nextLevel      = S.currentLevel + 1;
        S.nextTier       = getTier(S.nextLevel);

        const nc = data.next_level_config;
        S.requiredBadges   = nc ? (nc.badge_cost   || 0) : 0;
        S.requiredCrystals = nc ? (nc.crystal_cost || 0) : 0;

        const allBadges = Array.isArray(data.badges) ? data.badges : [];
        S.regularBadges = allBadges.filter(b => {
            const cat = b.category || b.badge_category || '';
            const code = b.badge_code || '';
            const isStreak = cat === 'streak' || code.startsWith('streak_');
            return !b.is_hidden && b.available > 0 && !isStreak;
        });
        S.hiddenBadges  = allBadges.filter(b => b.is_hidden && b.available > 0);

        S.spend    = {};
        S.hiddenSpend = {};
        S.regularBadges.forEach(b => { S.spend[b.badge_id]    = 0; });
        S.hiddenBadges.forEach(b  => { S.hiddenSpend[b.badge_id] = { mode: 'badges', qty: 0 }; });

        renderPage();
    } catch (err) {
        showGlobalError(err.message || 'Failed to load data. Please try again.');
    }
}

/* ═══════════════════════════════════════════════════════
   RENDER
   ═══════════════════════════════════════════════════════ */
function renderPage() {
    applyTierTheme();
    renderHeader();
    renderLevelDisplay();
    renderBadgeSelectorUI();
    renderHiddenBadges();
    updateCostPanel();
    updateForgeBtn();
}

function applyTierTheme() {
    document.body.className = `tier-${S.currentTier}`;
}

function renderHeader() {
    // Title-only header
}

function renderLevelDisplay() {
    const cur  = TIERS[S.currentTier]  || TIERS.Bronze;
    const nxt  = TIERS[S.nextTier]     || cur;

    document.getElementById('current-level-num').textContent = `L${S.currentLevel}`;
    document.getElementById('current-tier-emoji').textContent = cur.emoji;
    document.getElementById('current-tier-label').textContent = S.currentTier;

    document.getElementById('next-level-num').textContent  = `L${S.nextLevel}`;
    document.getElementById('next-tier-emoji').textContent = nxt.emoji;
    document.getElementById('next-tier-label').textContent = S.nextTier;

    // Arrow shows only icon/shape now.
}

function getBadgeName(b, lang) {
    return (lang === 'zh' && b.display_name_zh) ? b.display_name_zh : b.display_name_en;
}

function getRemainingBadgeNeedFor(badgeId) {
    const { totalBadges } = calcTotals();
    const current = S.spend[badgeId] || 0;
    return Math.max(0, S.requiredBadges - (totalBadges - current));
}

function renderBadgeSelectorUI() {
    const container = document.getElementById('badge-list');
    const lang = (typeof AppI18n !== 'undefined') ? AppI18n.getLang() : 'en';

    if (S.regularBadges.length === 0) {
        container.innerHTML = `<div class="empty-badges-msg">${t('synth.no_badges')}</div>`;
        document.getElementById('single-slider-panel').style.display = 'none';
        return;
    }
    document.getElementById('single-slider-panel').style.display = 'block';

    container.innerHTML = S.regularBadges.map(b => {
        const name = getBadgeName(b, lang);
        const spent = S.spend[b.badge_id] || 0;
        const isSelected = S.selectedBadgeId === b.badge_id;
        return `
        <div class="badge-tile ${isSelected ? 'active' : ''}" id="bcard-${b.badge_id}">
            <div class="badge-tile-icon">${b.icon || '🏅'}</div>
            <div class="badge-tile-name">${name}</div>
            <div class="badge-tile-avail">x${b.available}</div>
            <div class="badge-tile-spend" id="bcount-${b.badge_id}">${spent > 0 ? `-${spent}` : ''}</div>
        </div>`;
    }).join('');

    container.querySelectorAll('.badge-tile').forEach(card => {
        card.addEventListener('click', () => {
            const bid = card.id.replace('bcard-', '');
            S.selectedBadgeId = bid;
            updateSingleSliderPanel();
            renderBadgeSelectorUI();
        });
    });

    updateSingleSliderPanel();
}

function updateSingleSliderPanel() {
    const slider = document.getElementById('single-badge-slider');
    const num = document.getElementById('single-slider-num');
    const meta = document.getElementById('selected-badge-meta');
    const lang = (typeof AppI18n !== 'undefined') ? AppI18n.getLang() : 'en';
    const selected = S.regularBadges.find(b => b.badge_id === S.selectedBadgeId);
    if (!selected) {
        slider.disabled = true;
        slider.max = 0;
        slider.value = 0;
        num.textContent = '0';
        meta.textContent = t('synth.choose_badge');
        return;
    }

    const remainingNeed = getRemainingBadgeNeedFor(selected.badge_id);
    const maxSelectable = Math.min(selected.available, remainingNeed || selected.available);
    const current = S.spend[selected.badge_id] || 0;
    const val = Math.min(current, maxSelectable);

    slider.disabled = maxSelectable <= 0;
    slider.min = 0;
    slider.max = maxSelectable;
    slider.value = val;
    num.textContent = String(val);
    meta.textContent = `${selected.icon || '🏅'} ${getBadgeName(selected, lang)} × ${selected.available}`;
    // Also reflect current spend on tile
    const countEl = document.getElementById(`bcount-${selected.badge_id}`);
    if (countEl) countEl.textContent = val > 0 ? `-${val}` : '';
}

function renderHiddenBadges() {
    const section   = document.getElementById('hidden-section');
    const infoBar   = document.getElementById('hidden-info-bar');
    const container = document.getElementById('hidden-badge-list');
    const modal     = document.getElementById('hidden-modal');

    if (S.hiddenBadges.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';

    const langForInfo = (typeof AppI18n !== 'undefined') ? AppI18n.getLang() : 'en';
    if (langForInfo === 'en') {
        infoBar.innerHTML = '1 hidden badge = 50 regular badges OR 10 crystals<br>(Premium only)';
    } else {
        infoBar.textContent = t('synth.hidden_info');
    }

    const lang = (typeof AppI18n !== 'undefined') ? AppI18n.getLang() : 'en';

    container.innerHTML = S.hiddenBadges.map(b => {
        const name   = (lang === 'zh' && b.display_name_zh) ? b.display_name_zh : b.display_name_en;
        const locked = !S.isPremium;
        const avail  = b.available || 0;

        if (locked) {
            return `
            <div class="hidden-tile locked">
                <div class="hidden-tile-icon">${b.icon || '✨'}</div>
                <div class="hidden-tile-name">${name}</div>
                <div class="hidden-tile-avail">x${avail}</div>
                <div class="hidden-tile-lock">🔒</div>
            </div>`;
        }
        const hs = S.hiddenSpend[b.badge_id] || { mode: 'badges', qty: 0 };

        return `
        <div class="hidden-tile premium ${S.selectedHiddenId === b.badge_id ? 'active' : ''}" id="hcard-${b.badge_id}">
            <div class="hidden-tile-icon">${b.icon || '✨'}</div>
            <div class="hidden-tile-name">${name}</div>
            <div class="hidden-tile-avail">x${avail}</div>
            <div class="hidden-tile-spend">${hs.qty > 0 ? `-${hs.qty}` : ''}</div>
        </div>`;
    }).join('');

    if (!S.isPremium) {
        modal.classList.remove('open');
        modal.style.display = 'none';
        return;
    }

    container.querySelectorAll('.hidden-tile.premium').forEach(tile => {
        tile.addEventListener('click', () => {
            const hid = tile.id.replace('hcard-', '');
            S.selectedHiddenId = hid;
            renderHiddenBadges();
            updateHiddenPanel();
            modal.style.display = 'block';
            modal.classList.add('open');
        });
    });
    updateHiddenPanel();
}

function updateHiddenPanel() {
    const selected = S.hiddenBadges.find(b => b.badge_id === S.selectedHiddenId);
    const meta = document.getElementById('hidden-selected-meta');
    const bbtn = document.getElementById('hidden-mode-badges');
    const cbtn = document.getElementById('hidden-mode-crystals');
    const slider = document.getElementById('hidden-qty-slider');
    const num = document.getElementById('hidden-qty-num');

    if (!selected) {
        meta.textContent = 'Select hidden badge';
        slider.disabled = true;
        slider.max = 0;
        slider.value = 0;
        num.textContent = '0';
        bbtn.classList.remove('active');
        cbtn.classList.remove('active');
        return;
    }

    const hs = S.hiddenSpend[selected.badge_id] || { mode: 'badges', qty: 0 };
    S.hiddenDraftMode = hs.mode;
    S.hiddenDraftQty = hs.qty;
    meta.textContent = `${selected.icon || '✨'} ${getBadgeName(selected, (typeof AppI18n !== 'undefined') ? AppI18n.getLang() : 'en')} x${selected.available}`;
    bbtn.classList.toggle('active', S.hiddenDraftMode === 'badges');
    cbtn.classList.toggle('active', S.hiddenDraftMode === 'crystals');
    cbtn.style.display = S.requiredCrystals > 0 ? 'inline-flex' : 'none';

    // Limit hidden usage by remaining needed progress (and own stock).
    const othersHiddenBadge = S.hiddenBadges.reduce((sum, hb) => {
        if (hb.badge_id === selected.badge_id) return sum;
        const x = S.hiddenSpend[hb.badge_id] || { mode: 'badges', qty: 0 };
        return sum + (x.mode === 'badges' ? (x.qty * 50) : 0);
    }, 0);
    const othersHiddenCrystal = S.hiddenBadges.reduce((sum, hb) => {
        if (hb.badge_id === selected.badge_id) return sum;
        const x = S.hiddenSpend[hb.badge_id] || { mode: 'badges', qty: 0 };
        return sum + (x.mode === 'crystals' ? (x.qty * 10) : 0);
    }, 0);
    const maxByNeed = S.hiddenDraftMode === 'badges'
        ? Math.ceil(Math.max(0, S.requiredBadges - ((Object.values(S.spend).reduce((a, v) => a + v, 0)) + othersHiddenBadge)) / 50)
        : Math.ceil(Math.max(0, S.requiredCrystals - othersHiddenCrystal) / 10);
    const allowedMax = Math.max(0, Math.min(selected.available, maxByNeed || selected.available));
    S.hiddenDraftQty = Math.min(S.hiddenDraftQty, allowedMax);

    slider.disabled = false;
    slider.min = 0;
    slider.max = allowedMax;
    slider.value = S.hiddenDraftQty;
    num.textContent = String(S.hiddenDraftQty);
}

/* ═══════════════════════════════════════════════════════
   COST CALCULATIONS
   ═══════════════════════════════════════════════════════ */
function calcTotals() {
    let regBadges     = 0;
    let hiddenBadges  = 0;  // badge-equiv from hidden as badges
    let hiddenCrysts  = 0;  // crystal-equiv from hidden as crystals

    Object.entries(S.spend).forEach(([, v])  => { regBadges   += v; });

    S.hiddenBadges.forEach(b => {
        const hs = S.hiddenSpend[b.badge_id] || { mode: 'badges', qty: 0 };
        const qty = Math.max(0, Math.min(b.available, hs.qty || 0));
        if (hs.mode === 'badges'   && qty > 0) hiddenBadges += (50 * qty);
        if (hs.mode === 'crystals' && qty > 0) hiddenCrysts += (10 * qty);
    });

    return {
        totalBadges:   regBadges + hiddenBadges,
        hiddenCrysts,
        regBadges,
        hiddenBadges,
    };
}

function updateCostPanel() {
    const { totalBadges, hiddenCrysts } = calcTotals();
    const reqB = S.requiredBadges;
    const reqC = S.requiredCrystals;
    const totalBadgeAssets = S.regularBadges.reduce((s, b) => s + (b.available || 0), 0);

    // Badge progress
    const pct  = reqB > 0 ? Math.min(100, (totalBadges / reqB) * 100) : 100;
    const fill = document.getElementById('badge-bar-fill');
    fill.style.width = pct + '%';
    fill.classList.toggle('ok', totalBadges >= reqB);

    document.querySelector('#badge-bar-fill').closest('.cost-info').querySelector('.cost-label').textContent = `BADGES · Total ${totalBadgeAssets}`;
    const bNum = document.getElementById('badge-numbers');
    bNum.textContent = `${totalBadges} / ${reqB}`;
    bNum.className   = 'cost-numbers ' + (totalBadges >= reqB ? 'ok' : 'short');

    // Crystal row
    const crystalRow = document.getElementById('crystal-cost-row');
    const crystalFill = document.getElementById('crystal-bar-fill');
    crystalRow.style.display = 'flex';
    const canCover     = reqC === 0 ? true : hiddenCrysts >= reqC;
    document.querySelector('#crystal-numbers').closest('.cost-row').querySelector('.cost-label').textContent = `CRYSTALS · Total ${S.crystalBalance}`;
    document.getElementById('crystal-detail').textContent =
        hiddenCrysts > 0 ? `Hidden conversion: +${hiddenCrysts}` : '';
    const cNum = document.getElementById('crystal-numbers');
    cNum.textContent = `${Math.min(hiddenCrysts, reqC)} / ${reqC}`;
    cNum.className   = 'cost-numbers ' + (reqC === 0 ? 'ok' : (canCover ? 'ok' : 'short'));
    const cpct = reqC === 0 ? 100 : Math.min(100, (hiddenCrysts / reqC) * 100);
    crystalFill.style.width = `${cpct}%`;
    crystalFill.classList.toggle('ok', canCover);
}

function updateForgeBtn() {
    const { totalBadges, hiddenCrysts } = calcTotals();
    const reqB = S.requiredBadges;
    const reqC = S.requiredCrystals;

    const badgesOk  = totalBadges >= reqB;
    const crystsOk  = reqC === 0 || (hiddenCrysts >= reqC);
    document.getElementById('forge-btn').disabled = !(badgesOk && crystsOk);
}

/* ═══════════════════════════════════════════════════════
   FORGE / SYNTHESIZE
   ═══════════════════════════════════════════════════════ */
async function doForge() {
    const btn = document.getElementById('forge-btn');
    btn.disabled = true;
    btn.querySelector('.forge-btn-text').textContent = t('synth.forging');

    const crystalDirect = 0;

    const badgeSpend = S.regularBadges
        .filter(b => (S.spend[b.badge_id] || 0) > 0)
        .map(b => ({ badge_id: b.badge_id, qty: S.spend[b.badge_id] }));

    const hiddenAsBadges = [];
    const hiddenAsCrystals = [];
    S.hiddenBadges.forEach(b => {
        const hs = S.hiddenSpend[b.badge_id] || { mode: 'badges', qty: 0 };
        const qty = Math.max(0, Math.min(b.available, hs.qty || 0));
        for (let i = 0; i < qty; i++) {
            if (hs.mode === 'badges') hiddenAsBadges.push(b.badge_id);
            if (hs.mode === 'crystals') hiddenAsCrystals.push(b.badge_id);
        }
    });

    try {
        const { data, error } = await db.rpc('level_up_profile', {
            kid_profile_id:     kidId,
            badge_spend:        badgeSpend,
            hidden_as_badges:   hiddenAsBadges,
            hidden_as_crystals: hiddenAsCrystals,
            crystals_direct:    crystalDirect,
        });

        if (error)        throw error;
        if (!data?.success) throw new Error('Level up was not confirmed by server');

        showLevelUpAnimation(data);
    } catch (err) {
        btn.disabled = false;
        btn.querySelector('.forge-btn-text').textContent = t('synth.forge_btn');
        showToast(err.message || t('synth.forge_error'));
    }
}

/* ═══════════════════════════════════════════════════════
   LEVEL-UP ANIMATION
   ═══════════════════════════════════════════════════════ */
function showLevelUpAnimation(result) {
    // Update body class to new tier for correct CSS variables during animation
    document.body.className = `tier-${result.new_tier}`;

    const overlay = document.getElementById('levelup-overlay');
    document.getElementById('anim-new-level').textContent  = `L${result.new_level}`;
    document.getElementById('anim-tier-emoji').textContent = TIERS[result.new_tier]?.emoji || '⭐';
    document.getElementById('anim-label').textContent      = t('synth.level_up');

    const tierChange = document.getElementById('anim-tier-change');
    if (result.tier_changed) {
        tierChange.textContent = `✨ ${result.old_tier} → ${result.new_tier} ✨`;
        tierChange.style.display = 'block';
    } else {
        tierChange.style.display = 'none';
    }

    overlay.classList.add('active');

    // Fire particle burst after ring-pop starts
    setTimeout(() => fireBurst(result.new_tier), 250);

    overlay.addEventListener('click', () => {
        window.location.href = 'index.html';
    }, { once: true });
}

/* ═══════════════════════════════════════════════════════
   UI HELPERS
   ═══════════════════════════════════════════════════════ */
function showGlobalError(msg) {
    document.getElementById('loading-screen').innerHTML = `
        <div style="text-align:center;padding:40px 24px;color:#f87171;font-size:15px;font-weight:800;font-family:Nunito,sans-serif;">
            ⚠️ ${msg}
            <br><br>
            <button onclick="window.history.back()"
                style="margin-top:16px;padding:12px 24px;background:#f87171;color:#fff;border:none;
                       border-radius:16px;font-size:15px;font-weight:900;font-family:inherit;cursor:pointer;">
                ← Go Back
            </button>
        </div>`;
}

function showToast(msg) {
    let toast = document.getElementById('synth-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'synth-toast';
        toast.className = 'synth-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._tid);
    toast._tid = setTimeout(() => toast.classList.remove('show'), 3200);
}

/* ═══════════════════════════════════════════════════════
   BOOTSTRAP
   ═══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
    // Set up canvas sizes
    resizeAmbCanvas();
    window.addEventListener('resize', resizeAmbCanvas);

    // Start ambient particles immediately
    for (let i = 0; i < 90; i++) ambParts.push(makeAmbPart());
    loopAmbient();

    // Apply i18n
    if (typeof AppI18n !== 'undefined') {
        document.documentElement.lang = AppI18n.getLang() === 'zh' ? 'zh' : 'en';
        AppI18n.applyTranslations();
    }

    // Back button
    document.getElementById('back-btn').addEventListener('click', () => {
        window.history.length > 1 ? window.history.back() : (window.location.href = 'index.html');
    });

    // Forge button
    document.getElementById('forge-btn').addEventListener('click', doForge);
    document.getElementById('single-badge-slider').addEventListener('input', () => {
        const v = parseInt(document.getElementById('single-badge-slider').value, 10) || 0;
        document.getElementById('single-slider-num').textContent = String(v);
        const selected = S.selectedBadgeId;
        if (!selected) return;
        S.spend[selected] = v;
        const countEl = document.getElementById(`bcount-${selected}`);
        if (countEl) countEl.textContent = v > 0 ? `-${v}` : '';
        updateCostPanel();
        updateForgeBtn();
    });
    document.getElementById('hidden-mode-badges').addEventListener('click', () => {
        if (!S.selectedHiddenId) return;
        S.hiddenDraftMode = 'badges';
        document.getElementById('hidden-mode-badges').classList.add('active');
        document.getElementById('hidden-mode-crystals').classList.remove('active');
        updateHiddenPanel();
        S.hiddenSpend[S.selectedHiddenId] = { mode: S.hiddenDraftMode, qty: S.hiddenDraftQty };
        renderHiddenBadges();
        updateCostPanel();
        updateForgeBtn();
    });
    document.getElementById('hidden-mode-crystals').addEventListener('click', () => {
        if (!S.selectedHiddenId || S.requiredCrystals <= 0) return;
        S.hiddenDraftMode = 'crystals';
        document.getElementById('hidden-mode-crystals').classList.add('active');
        document.getElementById('hidden-mode-badges').classList.remove('active');
        updateHiddenPanel();
        S.hiddenSpend[S.selectedHiddenId] = { mode: S.hiddenDraftMode, qty: S.hiddenDraftQty };
        renderHiddenBadges();
        updateCostPanel();
        updateForgeBtn();
    });
    document.getElementById('hidden-qty-slider').addEventListener('input', () => {
        S.hiddenDraftQty = parseInt(document.getElementById('hidden-qty-slider').value, 10) || 0;
        document.getElementById('hidden-qty-num').textContent = String(S.hiddenDraftQty);
        S.hiddenSpend[S.selectedHiddenId] = {
            mode: S.hiddenDraftMode,
            qty: S.hiddenDraftQty,
        };
        renderHiddenBadges();
        updateCostPanel();
        updateForgeBtn();
        updateSingleSliderPanel();
    });
    document.getElementById('hidden-modal-close').addEventListener('click', () => {
        document.getElementById('hidden-modal').classList.remove('open');
        document.getElementById('hidden-modal').style.display = 'none';
    });

    // Auth check — parent session must be active
    if (typeof AUTH !== 'undefined') {
        const session = await AUTH.getParentSession();
        if (!session) {
            window.location.href = '../parent/index.html';
            return;
        }
    }

    // Reveal main, hide loading
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('synth-main').style.display     = 'block';
    document.getElementById('forge-btn-wrap').style.display = 'block';

    await loadData();
});
