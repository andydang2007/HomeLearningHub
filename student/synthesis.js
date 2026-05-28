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
    hiddenSpend:     {},   // badge_id → { badgesQty: number, crystalsQty: number }
    selectedBadgeId: null,
    selectedHiddenId: null,
    crystalSpend:    0, // manual spend from wallet slider
    badgeSpendTarget: 0,
    badgeControlMode: 'total', // 'total' | 'manual'
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
        S.crystalSpend = 0;
        S.badgeSpendTarget = 0;
        S.badgeControlMode = 'total';
        S.regularBadges.forEach(b => { S.spend[b.badge_id]    = 0; });
        S.hiddenBadges.forEach(b  => { S.hiddenSpend[b.badge_id] = { badgesQty: 0, crystalsQty: 0 }; });

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
    const title = document.getElementById('synth-title');
    if (title) title.textContent = S.profileName || 'Profile';
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

function badgeNameHtml(b, lang) {
    const name = getBadgeName(b, lang);
    if (typeof BadgeIcons !== 'undefined') {
        return BadgeIcons.formatBadgeNameHtml(name, lang, b.badge_code);
    }
    return name;
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
        return;
    }

    container.innerHTML = S.regularBadges.map(b => {
        const spent = S.spend[b.badge_id] || 0;
        const isSelected = S.selectedBadgeId === b.badge_id;
        return `
        <div class="badge-tile ${isSelected ? 'active' : ''}" id="bcard-${b.badge_id}">
            <div class="badge-tile-icon">${typeof BadgeIcons !== 'undefined'
                ? BadgeIcons.renderBadgeIconContent(b.badge_code, b.icon || '🏅')
                : (b.icon || '🏅')}</div>
            <div class="badge-tile-name">${badgeNameHtml(b, lang)}</div>
            <div class="badge-tile-avail">x${b.available}</div>
            <div class="badge-tile-spend" id="bcount-${b.badge_id}">${spent > 0 ? `-${spent}` : ''}</div>
        </div>`;
    }).join('');

    container.querySelectorAll('.badge-tile').forEach(card => {
        card.addEventListener('click', () => {
            S.selectedBadgeId = card.id.replace('bcard-', '');
            renderBadgeSelectorUI();
            updateSingleSliderPanel();
        });
    });
    updateSingleSliderPanel();
}

function redistributeBadgesEvenly(total) {
    // Precise round-robin allocation:
    // guarantees sum(spend) === min(total, sum(available)) with 1-step granularity.
    const left = {};
    S.regularBadges.forEach(b => {
        left[b.badge_id] = b.available || 0;
        S.spend[b.badge_id] = 0;
    });

    let rem = Math.max(0, total);
    while (rem > 0) {
        let movedThisRound = 0;
        for (const b of S.regularBadges) {
            if (rem <= 0) break;
            const bid = b.badge_id;
            if ((left[bid] || 0) <= 0) continue;
            S.spend[bid] += 1;
            left[bid] -= 1;
            rem -= 1;
            movedThisRound += 1;
        }
        if (movedThisRound === 0) break;
    }
}

function setDraggerFill(el, pct, ok) {
    const color = ok ? '#4ade80' : 'var(--t-color, #cd7f32)';
    const p = Math.max(0, Math.min(100, pct));
    el.style.background = `linear-gradient(90deg, ${color} 0%, ${color} ${p}%, rgba(255,255,255,0.12) ${p}%, rgba(255,255,255,0.12) 100%)`;
}

/** Update only the spend label on a hidden tile without re-rendering the whole list */
function updateHiddenTileSpend(badgeId) {
    const tileEl = document.getElementById(`hcard-${badgeId}`);
    if (!tileEl) return;
    const hs = S.hiddenSpend[badgeId] || { badgesQty: 0, crystalsQty: 0 };
    const totalUsed = (hs.badgesQty || 0) + (hs.crystalsQty || 0);
    const spendEl = tileEl.querySelector('.hidden-tile-spend');
    if (spendEl) spendEl.textContent = totalUsed > 0 ? `-${totalUsed}` : '';
}

/** Push badge slider to its maximum right point (filling remaining need) */
function syncBadgeSliderToMax() {
    const hiddenBadgeContrib = S.hiddenBadges.reduce((sum, b) => {
        const hs = S.hiddenSpend[b.badge_id] || { badgesQty: 0, crystalsQty: 0 };
        return sum + ((hs.badgesQty || 0) * 50);
    }, 0);
    const totalBadgeAssets = S.regularBadges.reduce((s, b) => s + (b.available || 0), 0);
    const maxRegularNeed = Math.max(0, S.requiredBadges - hiddenBadgeContrib);
    S.badgeControlMode = 'total';
    S.badgeSpendTarget = Math.min(totalBadgeAssets, maxRegularNeed);
}

/** Push crystal slider to its maximum right point (filling remaining need from wallet) */
function syncCrystalSliderToMax() {
    const hiddenCrystalContrib = S.hiddenBadges.reduce((sum, b) => {
        const hs = S.hiddenSpend[b.badge_id] || { badgesQty: 0, crystalsQty: 0 };
        return sum + ((hs.crystalsQty || 0) * 10);
    }, 0);
    const remainingNeed = Math.max(0, S.requiredCrystals - hiddenCrystalContrib);
    S.crystalSpend = Math.min(S.crystalBalance, remainingNeed);
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
        const locked = !S.isPremium;
        const avail  = b.available || 0;

        if (locked) {
            return `
            <div class="hidden-tile locked">
                <div class="hidden-tile-icon">${typeof BadgeIcons !== 'undefined'
                    ? BadgeIcons.renderBadgeIconContent(b.badge_code, b.icon || '✨')
                    : (b.icon || '✨')}</div>
                <div class="hidden-tile-name">${badgeNameHtml(b, lang)}</div>
                <div class="hidden-tile-avail">x${avail}</div>
                <div class="hidden-tile-lock">🔒</div>
            </div>`;
        }
        const hs = S.hiddenSpend[b.badge_id] || { badgesQty: 0, crystalsQty: 0 };
        const totalUsed = (hs.badgesQty || 0) + (hs.crystalsQty || 0);
        const spendLabel = totalUsed > 0 ? `-${totalUsed}` : '';

        return `
        <div class="hidden-tile premium ${S.selectedHiddenId === b.badge_id ? 'active' : ''}" id="hcard-${b.badge_id}">
            <div class="hidden-tile-icon">${typeof BadgeIcons !== 'undefined'
                ? BadgeIcons.renderBadgeIconContent(b.badge_code, b.icon || '✨')
                : (b.icon || '✨')}</div>
            <div class="hidden-tile-name">${badgeNameHtml(b, lang)}</div>
            <div class="hidden-tile-avail">x${avail}</div>
            <div class="hidden-tile-spend">${spendLabel}</div>
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
            // Switch active tile without re-rendering (avoids closing modal)
            container.querySelectorAll('.hidden-tile.premium').forEach(t => t.classList.remove('active'));
            tile.classList.add('active');
            S.selectedHiddenId = hid;
            updateHiddenPanel();
            modal.style.display = 'block';
            modal.classList.add('open');
            positionHiddenModal();
        });
    });
    updateHiddenPanel();
}

function positionHiddenModal() {
    const section = document.getElementById('hidden-section');
    const list = document.getElementById('hidden-badge-list');
    const card = document.querySelector('#hidden-modal .hidden-modal-card');
    if (!section || !card) return;
    const r = section.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const width = Math.min(cardRect.width, window.innerWidth - 24);
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, r.left + (r.width - width) / 2));
    // Position bottom edge of card just above the tile grid (with a small gap)
    const tileAreaTop = list ? list.getBoundingClientRect().top : r.top + 90;
    const desiredBottom = tileAreaTop - 10;
    const topEdge = Math.max(72, desiredBottom - cardRect.height);
    card.style.left = `${left + width / 2}px`;
    card.style.top = `${topEdge + cardRect.height / 2}px`;
}

function updateHiddenPanel() {
    const selected = S.hiddenBadges.find(b => b.badge_id === S.selectedHiddenId);
    const meta = document.getElementById('hidden-selected-meta');
    const bbtn = document.getElementById('hidden-mode-badges');
    const cbtn = document.getElementById('hidden-mode-crystals');
    const inputBadges = document.getElementById('hidden-qty-badges');
    const inputCrystals = document.getElementById('hidden-qty-crystals');

    if (!selected) {
        meta.textContent = 'Select hidden badge';
        inputBadges.disabled = true;
        inputBadges.max = 0;
        inputBadges.value = 0;
        inputCrystals.disabled = true;
        inputCrystals.max = 0;
        inputCrystals.value = 0;
        bbtn.classList.remove('active');
        cbtn.classList.remove('active');
        return;
    }

    const hs = S.hiddenSpend[selected.badge_id] || { badgesQty: 0, crystalsQty: 0 };
    meta.textContent = `${selected.icon || '✨'} ${getBadgeName(selected, (typeof AppI18n !== 'undefined') ? AppI18n.getLang() : 'en')} x${selected.available}`;
    bbtn.classList.add('active');
    cbtn.classList.add('active');

    // Limit hidden usage by remaining needed progress (and own stock).
    const regUsed = Object.values(S.spend).reduce((a, v) => a + (v || 0), 0);
    const othersHiddenBadge = S.hiddenBadges.reduce((sum, hb) => {
        if (hb.badge_id === selected.badge_id) return sum;
        const x = S.hiddenSpend[hb.badge_id] || { badgesQty: 0, crystalsQty: 0 };
        return sum + ((x.badgesQty || 0) * 50);
    }, 0);
    const othersHiddenCrystal = S.hiddenBadges.reduce((sum, hb) => {
        if (hb.badge_id === selected.badge_id) return sum;
        const x = S.hiddenSpend[hb.badge_id] || { badgesQty: 0, crystalsQty: 0 };
        return sum + ((x.crystalsQty || 0) * 10);
    }, 0);
    const allowedMaxBadgesByNeed = Math.max(0, Math.floor(Math.max(0, S.requiredBadges - (regUsed + othersHiddenBadge)) / 50));
    const allowedMaxCrystalsByNeed = Math.max(0, Math.floor(Math.max(0, S.requiredCrystals - (S.crystalSpend + othersHiddenCrystal)) / 10));
    let badgesQty = Math.max(0, Math.min(hs.badgesQty || 0, selected.available));
    let crystalsQty = Math.max(0, Math.min(hs.crystalsQty || 0, selected.available));
    badgesQty = Math.min(badgesQty, allowedMaxBadgesByNeed);
    crystalsQty = Math.min(crystalsQty, allowedMaxCrystalsByNeed);
    if (badgesQty + crystalsQty > selected.available) {
        const overflow = badgesQty + crystalsQty - selected.available;
        if (crystalsQty >= overflow) crystalsQty -= overflow;
        else {
            badgesQty = Math.max(0, badgesQty - (overflow - crystalsQty));
            crystalsQty = 0;
        }
    }
    S.hiddenSpend[selected.badge_id] = { badgesQty, crystalsQty };

    const allowedMaxBadges = Math.max(0, Math.min(
        selected.available,
        allowedMaxBadgesByNeed,
        selected.available - crystalsQty
    ));

    const allowedMaxCrystals = Math.max(0, Math.min(
        selected.available,
        allowedMaxCrystalsByNeed,
        selected.available - badgesQty
    ));

    inputBadges.disabled = false;
    // Show values as multiples of 50 (e.g. 0, 50, 100, 150…)
    inputBadges.innerHTML = Array.from({ length: allowedMaxBadges + 1 }, (_, i) => `<option value="${i}">${i * 50}</option>`).join('');
    inputBadges.value = String(Math.min(badgesQty, allowedMaxBadges));
    inputCrystals.disabled = false;
    // Show values as multiples of 10 (e.g. 0, 10, 20, 30…)
    inputCrystals.innerHTML = Array.from({ length: allowedMaxCrystals + 1 }, (_, i) => `<option value="${i}">${i * 10}</option>`).join('');
    inputCrystals.value = String(Math.min(crystalsQty, allowedMaxCrystals));
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
        const hs = S.hiddenSpend[b.badge_id] || { badgesQty: 0, crystalsQty: 0 };
        const bq = Math.max(0, Math.min(b.available, hs.badgesQty || 0));
        const cq = Math.max(0, Math.min(b.available - bq, hs.crystalsQty || 0));
        if (bq > 0) hiddenBadges += (50 * bq);
        if (cq > 0) hiddenCrysts += (10 * cq);
    });

    return {
        totalBadges:   regBadges + hiddenBadges,
        hiddenCrysts,
        walletCrysts: S.crystalSpend,
        regBadges,
        hiddenBadges,
    };
}

function updateCostPanel() {
    const reqB = S.requiredBadges;
    const reqC = S.requiredCrystals;
    const totalBadgeAssets = S.regularBadges.reduce((s, b) => s + (b.available || 0), 0);
    const hiddenBadgeContribution = S.hiddenBadges.reduce((sum, b) => {
        const hs = S.hiddenSpend[b.badge_id] || { badgesQty: 0, crystalsQty: 0 };
        return sum + ((hs.badgesQty || 0) * 50);
    }, 0);

    // Keep slider and allocation in sync BEFORE computing totals,
    // otherwise the displayed progress can lag by one step.
    const maxRegularNeed = Math.max(0, reqB - hiddenBadgeContribution);
    const maxRegularUse = Math.min(totalBadgeAssets, maxRegularNeed);
    if (S.badgeControlMode === 'total') {
        S.badgeSpendTarget = Math.max(0, Math.min(S.badgeSpendTarget, maxRegularUse));
        redistributeBadgesEvenly(S.badgeSpendTarget);
    } else {
        // manual mode: clamp current per-badge values only
        let manualTotal = 0;
        S.regularBadges.forEach(b => {
            const v = Math.max(0, Math.min(b.available || 0, S.spend[b.badge_id] || 0));
            S.spend[b.badge_id] = v;
            manualTotal += v;
        });
        S.badgeSpendTarget = Math.min(manualTotal, maxRegularUse);
    }

    const { totalBadges, hiddenCrysts } = calcTotals();

    // Badge progress
    const pct  = reqB > 0 ? Math.min(100, (totalBadges / reqB) * 100) : 100;

    const remainingBadgeAssets = totalBadgeAssets - S.badgeSpendTarget;
    document.querySelector('#badge-bar-fill').closest('.cost-info').querySelector('.cost-label').textContent = `BADGES · ${remainingBadgeAssets}`;
    const badgeSlider = document.getElementById('badge-total-slider');
    // Slider range is always [0, reqB] so thumb% == fill% (same coordinate system)
    badgeSlider.disabled = reqB <= 0 || (maxRegularUse === 0 && hiddenBadgeContribution === 0);
    badgeSlider.min = 0;
    badgeSlider.max = reqB;
    badgeSlider.value = Math.min(totalBadges, reqB);
    setDraggerFill(badgeSlider, pct, totalBadges >= reqB);
    const badgeFill = document.getElementById('badge-bar-fill');
    badgeFill.style.width = `${pct}%`;
    badgeFill.classList.toggle('ok', totalBadges >= reqB);
    const bNum = document.getElementById('badge-numbers');
    bNum.textContent = `${totalBadges} / ${reqB}`;
    bNum.className   = 'cost-numbers ' + (totalBadges >= reqB ? 'ok' : 'short');

    // Crystal row
    const crystalRow = document.getElementById('crystal-cost-row');
    const crystalSlider = document.getElementById('crystal-direct-slider');
    const crystalFill = document.getElementById('crystal-bar-fill');
    crystalRow.style.display = 'flex';
    const remainingNeedAfterHidden = Math.max(0, reqC - hiddenCrysts);
    const maxWalletUse = Math.min(S.crystalBalance, remainingNeedAfterHidden);
    S.crystalSpend = Math.min(S.crystalSpend, maxWalletUse);
    crystalSlider.disabled = reqC <= 0 || (maxWalletUse === 0 && hiddenCrysts === 0);
    crystalSlider.min = 0;
    crystalSlider.max = reqC > 0 ? reqC : 0;
    // Slider value = total crystal contribution (hidden + wallet) so thumb == fill right edge
    crystalSlider.value = Math.min(hiddenCrysts + S.crystalSpend, reqC);

    const walletCrysts = S.crystalSpend;
    const totalCrystalContribution = hiddenCrysts + walletCrysts;
    const canCover = reqC === 0 ? true : totalCrystalContribution >= reqC;
    const remainingCrystalBalance = S.crystalBalance - walletCrysts;
    document.querySelector('#crystal-numbers').closest('.cost-row').querySelector('.cost-label').textContent = `CRYSTALS · ${remainingCrystalBalance}`;
    document.getElementById('crystal-detail').textContent = '';
    const cNum = document.getElementById('crystal-numbers');
    cNum.textContent = `${Math.min(totalCrystalContribution, reqC)} / ${reqC}`;
    cNum.className   = 'cost-numbers ' + (reqC === 0 ? 'ok' : (canCover ? 'ok' : 'short'));
    const cpct = reqC === 0 ? 100 : Math.min(100, (totalCrystalContribution / reqC) * 100);
    crystalFill.style.width = `${cpct}%`;
    crystalFill.classList.toggle('ok', canCover);
    setDraggerFill(crystalSlider, cpct, canCover);

    S.regularBadges.forEach(b => {
        const el = document.getElementById(`bcount-${b.badge_id}`);
        if (el) el.textContent = (S.spend[b.badge_id] || 0) > 0 ? `-${S.spend[b.badge_id]}` : '';
    });
}

function updateForgeBtn() {
    const { totalBadges, hiddenCrysts, walletCrysts } = calcTotals();
    const reqB = S.requiredBadges;
    const reqC = S.requiredCrystals;

    const badgesOk  = totalBadges >= reqB;
    const crystsOk  = reqC === 0 || (hiddenCrysts + walletCrysts >= reqC);
    document.getElementById('forge-btn').disabled = !(badgesOk && crystsOk);
}

function updateSingleSliderPanel() {
    const slider = document.getElementById('single-badge-slider');
    const num = document.getElementById('single-slider-num');
    const meta = document.getElementById('selected-badge-meta');
    const lang = (typeof AppI18n !== 'undefined') ? AppI18n.getLang() : 'en';
    const selected = S.regularBadges.find(b => b.badge_id === S.selectedBadgeId);
    if (!selected) {
        slider.disabled = true;
        slider.min = 0;
        slider.max = 0;
        slider.value = 0;
        num.textContent = '0';
        meta.textContent = t('synth.choose_badge');
        return;
    }
    const hiddenBadgeContribution = S.hiddenBadges.reduce((sum, b) => {
        const hs = S.hiddenSpend[b.badge_id] || { badgesQty: 0, crystalsQty: 0 };
        return sum + ((hs.badgesQty || 0) * 50);
    }, 0);
    const otherSpend = S.regularBadges.reduce((sum, b) => {
        if (b.badge_id === selected.badge_id) return sum;
        return sum + (S.spend[b.badge_id] || 0);
    }, 0);
    const maxNeedByProgress = Math.max(0, S.requiredBadges - hiddenBadgeContribution - otherSpend);
    const maxSelectable = Math.min(selected.available || 0, maxNeedByProgress);
    const current = Math.min(S.spend[selected.badge_id] || 0, maxSelectable);
    S.spend[selected.badge_id] = current;
    slider.disabled = maxSelectable <= 0;
    slider.min = 0;
    slider.max = maxSelectable;
    slider.value = current;
    num.textContent = String(current);
    meta.textContent = `${selected.icon || '🏅'} ${getBadgeName(selected, lang)} × ${selected.available}`;
}

/* ═══════════════════════════════════════════════════════
   FORGE / SYNTHESIZE
   ═══════════════════════════════════════════════════════ */
async function doForge() {
    const btn = document.getElementById('forge-btn');
    btn.disabled = true;
    btn.querySelector('.forge-btn-text').textContent = t('synth.forging');

    const crystalDirect = S.crystalSpend;

    const badgeSpend = S.regularBadges
        .filter(b => (S.spend[b.badge_id] || 0) > 0)
        .map(b => ({ badge_id: b.badge_id, qty: S.spend[b.badge_id] }));

    const hiddenAsBadges = [];
    const hiddenAsCrystals = [];
    S.hiddenBadges.forEach(b => {
        const hs = S.hiddenSpend[b.badge_id] || { badgesQty: 0, crystalsQty: 0 };
        const bq = Math.max(0, Math.min(b.available, hs.badgesQty || 0));
        const cq = Math.max(0, Math.min(b.available - bq, hs.crystalsQty || 0));
        for (let i = 0; i < bq; i++) hiddenAsBadges.push(b.badge_id);
        for (let i = 0; i < cq; i++) hiddenAsCrystals.push(b.badge_id);
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
        if (!S.selectedBadgeId) return;
        S.badgeControlMode = 'manual';
        const v = parseInt(document.getElementById('single-badge-slider').value, 10) || 0;
        S.spend[S.selectedBadgeId] = v;
        document.getElementById('single-slider-num').textContent = String(v);
        // reflect on total badge slider without overriding manual selection
        S.badgeSpendTarget = Object.values(S.spend).reduce((a, n) => a + (n || 0), 0);
        updateCostPanel();
        updateForgeBtn();
        updateHiddenPanel();
        renderBadgeSelectorUI();
    });
    document.getElementById('badge-total-slider').addEventListener('input', () => {
        S.badgeControlMode = 'total';
        const sliderVal = parseInt(document.getElementById('badge-total-slider').value, 10) || 0;
        // Slider represents total committed; subtract hidden contribution to get regular target
        const hiddenBadgeContrib = S.hiddenBadges.reduce((sum, b) => {
            const hs = S.hiddenSpend[b.badge_id] || { badgesQty: 0, crystalsQty: 0 };
            return sum + ((hs.badgesQty || 0) * 50);
        }, 0);
        const totalBadgeAssets = S.regularBadges.reduce((s, b) => s + (b.available || 0), 0);
        S.badgeSpendTarget = Math.min(totalBadgeAssets, Math.max(0, sliderVal - hiddenBadgeContrib));
        updateCostPanel();
        updateForgeBtn();
        updateHiddenPanel();
        renderBadgeSelectorUI();
        updateSingleSliderPanel();
    });
    document.getElementById('crystal-direct-slider').addEventListener('input', () => {
        const sliderVal = parseInt(document.getElementById('crystal-direct-slider').value, 10) || 0;
        // Slider represents total crystal contribution; subtract hidden to get wallet portion
        const hiddenCrystalContrib = S.hiddenBadges.reduce((sum, b) => {
            const hs = S.hiddenSpend[b.badge_id] || { badgesQty: 0, crystalsQty: 0 };
            return sum + ((hs.crystalsQty || 0) * 10);
        }, 0);
        S.crystalSpend = Math.min(S.crystalBalance, Math.max(0, sliderVal - hiddenCrystalContrib));
        updateCostPanel();
        updateForgeBtn();
        updateHiddenPanel();
    });
    document.getElementById('hidden-mode-badges').addEventListener('click', () => {
        document.getElementById('hidden-qty-badges')?.focus();
    });
    document.getElementById('hidden-mode-crystals').addEventListener('click', () => {
        document.getElementById('hidden-qty-crystals')?.focus();
    });
    document.getElementById('hidden-qty-badges').addEventListener('change', () => {
        if (!S.selectedHiddenId) return;
        const qty = parseInt(document.getElementById('hidden-qty-badges').value || '0', 10) || 0;
        const prev = S.hiddenSpend[S.selectedHiddenId] || { badgesQty: 0, crystalsQty: 0 };
        S.hiddenSpend[S.selectedHiddenId] = { badgesQty: qty, crystalsQty: prev.crystalsQty || 0 };
        updateHiddenTileSpend(S.selectedHiddenId);
        updateCostPanel();
        updateForgeBtn();
        updateSingleSliderPanel();
        updateHiddenPanel();
        renderBadgeSelectorUI();
    });
    document.getElementById('hidden-qty-crystals').addEventListener('change', () => {
        if (!S.selectedHiddenId) return;
        const qty = parseInt(document.getElementById('hidden-qty-crystals').value || '0', 10) || 0;
        const prev = S.hiddenSpend[S.selectedHiddenId] || { badgesQty: 0, crystalsQty: 0 };
        S.hiddenSpend[S.selectedHiddenId] = { badgesQty: prev.badgesQty || 0, crystalsQty: qty };
        updateHiddenTileSpend(S.selectedHiddenId);
        updateCostPanel();
        updateForgeBtn();
        updateSingleSliderPanel();
        updateHiddenPanel();
        renderBadgeSelectorUI();
    });
    // Close hidden modal on click outside the card AND outside the hidden section
    document.addEventListener('click', (e) => {
        const modal = document.getElementById('hidden-modal');
        if (!modal.classList.contains('open')) return;
        const card = modal.querySelector('.hidden-modal-card');
        const hiddenSection = document.getElementById('hidden-section');
        if (card && card.contains(e.target)) return;
        if (hiddenSection && hiddenSection.contains(e.target)) return;
        modal.classList.remove('open');
        modal.style.display = 'none';
        S.selectedHiddenId = null;
    });
    window.addEventListener('resize', () => {
        const modal = document.getElementById('hidden-modal');
        if (modal.classList.contains('open')) positionHiddenModal();
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
