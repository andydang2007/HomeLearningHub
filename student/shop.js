// ─────────────────────────────────────────────────────────────────────────────
// Shop Module
// UI strings are served through AppI18n.t() — see common/js/i18n.js
//
// SECURITY RULE: This module MUST NOT modify any balance (gold/crystal) directly.
// All exchange operations are routed through requestRewardExchange(), which is
// an async stub ready to call a Supabase Edge Function / RPC.
// ─────────────────────────────────────────────────────────────────────────────

// ── Mock Catalog ─────────────────────────────────────────────────────────────
// TODO: Replace with live fetch from Supabase `reward_catalog` table.
const CATALOG = [
    {
        id:            'soft_serve',
        name:          '甜筒',
        image:         '../assets/images/shop-rewards/reward_soft-serve.png',
        fallback_icon: 'https://img.icons8.com/fluency/240/ice-cream-cone.png',
        cost:          7,
        currency_type: 'crystal',
    },
    {
        id:            'mcflurry',
        name:          '麦旋风',
        image:         '../assets/images/shop-rewards/reward_mcflurry.png',
        fallback_icon: 'https://img.icons8.com/fluency/240/ice-cream-sundae.png',
        cost:          14,
        currency_type: 'crystal',
    },
    {
        id:            'hamburger',
        name:          '汉堡',
        image:         '../assets/images/shop-rewards/reward_hamburger.png',
        fallback_icon: 'https://img.icons8.com/fluency/240/hamburger.png',
        cost:          67,
        currency_type: 'gold',
    },
    {
        id:            'burger_combo',
        name:          '汉堡套餐',
        image:         '../assets/images/shop-rewards/reward_burger-combo.png',
        fallback_icon: 'https://img.icons8.com/fluency/240/paper-bag-with-food.png',
        cost:          134,
        currency_type: 'gold',
    },
    {
        id:            'pizza',
        name:          '披萨大餐',
        image:         '../assets/images/shop-rewards/reward_pizza.png',
        fallback_icon: 'https://img.icons8.com/fluency/240/pizza.png',
        cost:          268,
        currency_type: 'gold',
    },
];

// ── i18n shorthand ────────────────────────────────────────────────────────────
const t = (key, vars) => AppI18n.t(key, vars);

function getItemName(item) {
    const key = `shop.item_${item.id}`;
    const localized = t(key);
    return localized !== key ? localized : item.name;
}

// ── Session State ─────────────────────────────────────────────────────────────
const currentUser = localStorage.getItem('currentPlayer') || 'Student';
let selectedItem  = null;
let activeTab     = 'gold';

// ── RPC Stub ──────────────────────────────────────────────────────────────────
/**
 * Submits a reward exchange request to the backend.
 *
 * IMPORTANT: This function MUST NOT touch any balance values locally.
 * All deduction logic lives exclusively in the Supabase Edge Function / RPC.
 * The frontend only submits the request and reflects the server response.
 *
 * @param {string} itemId        - Catalog item id (e.g. 'hamburger')
 * @param {number} cost          - Cost in the relevant currency
 * @param {string} currencyType  - 'gold' | 'crystal'
 * @returns {Promise<{success: boolean, code?: string, error?: string}>}
 */
async function requestRewardExchange(itemId, cost, currencyType) {
    // ── STUB: Replace the body below with a real Supabase RPC call ────────────
    // Example future implementation:
    //
    // const { data, error } = await supabase.rpc('redeem_reward', {
    //     p_user_id:       currentUserId,
    //     p_item_id:       itemId,
    //     p_cost:          cost,
    //     p_currency_type: currencyType,
    // });
    // if (error) return { success: false, error: error.message };
    // return { success: true, code: data.redemption_code };
    // ─────────────────────────────────────────────────────────────────────────

    console.warn('[Shop] requestRewardExchange() is a stub. Backend RPC not yet connected.');
    console.log(`[Shop] Pending exchange → item: ${itemId}, cost: ${cost} ${currencyType}`);

    // Local pending record only — does NOT modify balance.
    const redemptionKey = `pending_redemption_${itemId}_${currentUser}`;
    const existing      = JSON.parse(localStorage.getItem(redemptionKey) || '{"count":0,"codes":[]}');
    const sgt           = getSGTDate();
    const datePart      = String(sgt.getMonth() + 1).padStart(2, '0') + String(sgt.getDate()).padStart(2, '0');
    const checksum      = String(sgt.getDate() + cost).padStart(3, '0');
    const code          = `${itemId.toUpperCase().slice(0, 4)}-${datePart}-${checksum}`;

    existing.count++;
    existing.codes.push(code);
    localStorage.setItem(redemptionKey, JSON.stringify(existing));

    return { success: true, code };
}

// ── Supabase Data Layer ───────────────────────────────────────────────────────

/**
 * Fetch real crystal and gold balances from Supabase `profiles` table.
 * On success, updates localStorage cache and refreshes the balance UI.
 * On failure, silently falls back to localStorage values (no UI disruption).
 *
 * Supabase column names assumed:
 *   profiles.crystal_balance  — integer, personal crystal count
 *   profiles.gold_balance     — integer, shared team gold vault
 *
 * TODO: Adjust column names above if your schema differs.
 */
async function fetchUserBalance() {
    const user = getCurrentUser();
    try {
        const { data, error } = await SupabaseClient
            .from('profiles')
            .select('crystal_balance, gold_balance')
            .eq('id', user.id)
            .single();

        if (error) throw error;

        if (data) {
            localStorage.setItem(`crystals_${user.username}`, data.crystal_balance ?? 0);
            localStorage.setItem('gold_coins_vault',           data.gold_balance   ?? 0);
            updateBalanceDisplay();
        }
    } catch (err) {
        console.warn('[Shop] Balance fetch failed, using local cache:', err.message);
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getSGTDate() {
    const d = new Date();
    return new Date(d.getTime() + (d.getTimezoneOffset() + 480) * 60000);
}

function getBalance(currencyType) {
    const key = currencyType === 'gold'
        ? 'gold_coins_vault'
        : `crystals_${currentUser}`;
    return parseInt(localStorage.getItem(key) || '0');
}

function getPendingCount(itemId) {
    const rec = JSON.parse(localStorage.getItem(`pending_redemption_${itemId}_${currentUser}`) || '{"count":0}');
    return rec.count;
}

function getLastCode(itemId) {
    const rec = JSON.parse(localStorage.getItem(`pending_redemption_${itemId}_${currentUser}`) || '{"codes":[]}');
    return rec.codes?.[rec.codes.length - 1] || null;
}

// ── UI Rendering ──────────────────────────────────────────────────────────────
function updateBalanceDisplay() {
    document.getElementById('balance-gold').textContent    = getBalance('gold');
    document.getElementById('balance-crystal').textContent = getBalance('crystal');
}

function renderGrid(currencyType) {
    const grid  = document.getElementById(`grid-${currencyType}`);
    const items = CATALOG.filter(item => item.currency_type === currencyType);

    grid.innerHTML = items.map(item => {
        const count       = getPendingCount(item.id);
        const badgeHtml   = count > 0
            ? `<span class="item-badge is-visible">${t('shop.redeemed_badge', { count })}</span>`
            : `<span class="item-badge"></span>`;
        const priceClass  = currencyType === 'crystal' ? 'item-price--crystal' : 'item-price--gold';
        const priceSymbol = currencyType === 'crystal' ? '💎' : '💰';
        const itemClass   = `shop-item shop-item--${currencyType}`;

        return `
        <div class="${itemClass}" data-id="${item.id}" data-cost="${item.cost}" data-currency="${currencyType}">
            ${badgeHtml}
            <img class="item-img" src="${item.image}" alt="${getItemName(item)}" onerror="this.src='${item.fallback_icon}'">
            <span class="item-name">${getItemName(item)}</span>
            <span class="item-price ${priceClass}">${priceSymbol} ${item.cost}</span>
        </div>`;
    }).join('');

    grid.querySelectorAll('.shop-item').forEach(el => {
        el.addEventListener('click', () => handleItemSelect(el));
    });
}

function refreshBadges() {
    CATALOG.forEach(item => {
        const count = getPendingCount(item.id);
        const badge = document.querySelector(`[data-id="${item.id}"] .item-badge`);
        if (!badge) return;
        if (count > 0) { badge.textContent = t('shop.redeemed_badge', { count }); badge.classList.add('is-visible'); }
        else           { badge.textContent = '';                                    badge.classList.remove('is-visible'); }
    });
}

// ── Interaction Handlers ──────────────────────────────────────────────────────
function handleItemSelect(el) {
    document.querySelectorAll('.shop-item').forEach(i => i.classList.remove('is-selected'));
    el.classList.add('is-selected');

    const item = CATALOG.find(c => c.id === el.dataset.id);
    selectedItem = item || null;

    const confirmBtn = document.getElementById('confirm-btn');
    if (selectedItem) {
        confirmBtn.disabled = false;
        confirmBtn.classList.add('is-ready');
    }
}

function switchTab(tab) {
    activeTab    = tab;
    selectedItem = null;

    document.querySelectorAll('.balance-card').forEach((card) => {
        const isActive = card.dataset.tab === tab;
        card.classList.toggle('is-active', isActive);
        card.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('is-active'));
    document.getElementById(`panel-${tab}`).classList.add('is-active');

    document.querySelectorAll('.shop-item').forEach(i => i.classList.remove('is-selected'));
    document.getElementById('confirm-btn').disabled = true;
    document.getElementById('confirm-btn').classList.remove('is-ready');
}

async function handleConfirmRedeem() {
    if (!selectedItem) return;

    const balance  = getBalance(selectedItem.currency_type);
    const currency = selectedItem.currency_type === 'gold'
        ? t('shop.gold_currency') : t('shop.crystal_currency');

    if (balance < selectedItem.cost) {
        alert(t('shop.balance_low', { currency, diff: selectedItem.cost - balance }));
        return;
    }

    if (!confirm(t('shop.confirm_dialog', { cost: selectedItem.cost, currency, name: getItemName(selectedItem) }))) {
        return;
    }

    const confirmBtn = document.getElementById('confirm-btn');
    confirmBtn.disabled = true;
    confirmBtn.textContent = t('shop.submitting');

    try {
        const result = await requestRewardExchange(selectedItem.id, selectedItem.cost, selectedItem.currency_type);

        if (result.success) {
            document.getElementById('redemption-code').textContent = result.code || '--';
            showModal('modal-redeem');
            refreshBadges();
        } else {
            alert(t('shop.exchange_fail', { error: result.error || '?' }));
        }
    } catch (err) {
        console.error('[Shop] Exchange request failed:', err);
        alert(t('shop.net_error'));
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = t('shop.confirm_btn');
    }
}

function openBackpack() {
    const itemsWithPending = CATALOG.filter(item => getPendingCount(item.id) > 0);
    const list = document.getElementById('backpack-list');

    if (itemsWithPending.length === 0) {
        list.innerHTML = `<div class="backpack-empty">${t('shop.backpack_empty').replace('\n', '<br>')}</div>`;
    } else {
        list.innerHTML = itemsWithPending.map(item => {
            const count    = getPendingCount(item.id);
            const lastCode = getLastCode(item.id) || '--';
            const currency = item.currency_type === 'gold' ? t('shop.gold_currency') : t('shop.crystal_currency');
            return `
            <div class="backpack-item" data-item-id="${item.id}">
                <div class="backpack-item-header">
                    <span class="backpack-item-name">${getItemName(item)} <span class="backpack-item-qty">(×${count})</span></span>
                    <span class="backpack-item-value">${t('shop.item_value', { cost: item.cost, currency })}</span>
                </div>
                <div class="backpack-item-code">${lastCode}</div>
                <button class="backpack-refund-btn" data-item-id="${item.id}">${t('shop.cancel_btn', { currency })}</button>
            </div>`;
        }).join('');

        list.querySelectorAll('.backpack-refund-btn').forEach(btn => {
            btn.addEventListener('click', () => handleRefund(btn.dataset.itemId));
        });
    }

    showModal('modal-backpack');
}

function handleRefund(itemId) {
    const item = CATALOG.find(c => c.id === itemId);
    if (!item) return;

    const currency = item.currency_type === 'gold' ? t('shop.gold_currency') : t('shop.crystal_currency');
    if (!confirm(t('shop.refund_confirm', { name: getItemName(item), cost: item.cost, currency }))) return;

    // Remove last pending record (local only — balance refund must come from backend)
    const key = `pending_redemption_${itemId}_${currentUser}`;
    const rec  = JSON.parse(localStorage.getItem(key) || '{"count":0,"codes":[]}');
    if (rec.count > 0) {
        rec.count--;
        rec.codes.pop();
        if (rec.count <= 0) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(rec));
    }

    console.warn('[Shop] Refund stub: balance NOT modified locally. Awaiting backend RPC.');
    alert(t('shop.refund_done'));

    closeModal('modal-backpack');
    refreshBadges();
    updateBalanceDisplay();
}

// ── Modal Helpers ─────────────────────────────────────────────────────────────
function showModal(id) {
    const el = document.getElementById(id);
    el.classList.remove('is-hidden');
    el.classList.add('is-visible');
}

function closeModal(id) {
    const el = document.getElementById(id);
    el.classList.remove('is-visible');
    el.classList.add('is-hidden');
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    AppI18n.applyTranslations();
    updateBalanceDisplay();   // render localStorage values immediately
    fetchUserBalance();       // then fetch real values from Supabase async
    renderGrid('crystal');
    renderGrid('gold');

    document.getElementById('wallet-crystal').addEventListener('click', () => switchTab('crystal'));
    document.getElementById('wallet-gold').addEventListener('click', () => switchTab('gold'));

    document.getElementById('confirm-btn').addEventListener('click', handleConfirmRedeem);
    document.getElementById('backpack-btn').addEventListener('click', openBackpack);
    document.getElementById('home-btn').addEventListener('click', () => { window.location.href = 'index.html'; });

    document.getElementById('modal-redeem-close').addEventListener('click', () => {
        closeModal('modal-redeem');
        selectedItem = null;
        document.querySelectorAll('.shop-item').forEach(i => i.classList.remove('is-selected'));
        const confirmBtn = document.getElementById('confirm-btn');
        confirmBtn.disabled = true;
        confirmBtn.classList.remove('is-ready');
    });

    document.getElementById('modal-backpack-close').addEventListener('click', () => closeModal('modal-backpack'));
});
