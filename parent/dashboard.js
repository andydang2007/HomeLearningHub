// parent/dashboard.js — parent dashboard: kid profile management

const db = window.SupabaseClient;

let modalGrade        = '';
let modalAvatarId     = 'star';
let modalGender       = '';
let modalChineseLevel = 'CL';
let modalMode         = 'add'; // 'add' | 'edit'
let editingOriginalName = '';
let editingCloudId    = '';
let editingKidPinEnabled = false;
let pendingDeleteName = '';
let pendingDeleteCloudId = '';
let availableSchools  = [];
let cachedFamilyInfo  = null;

function t(key, vars) {
    return (typeof AppI18n !== 'undefined') ? AppI18n.t(key, vars) : key;
}

function setDynamicI18nText(el, key, vars) {
    if (!el) return;
    el.textContent = t(key, vars);
    if (vars && Object.keys(vars).length) {
        el.dataset.i18nVars = JSON.stringify(vars);
    } else {
        delete el.dataset.i18nVars;
    }
}

function applyDashboardI18n() {
    if (typeof AppI18n === 'undefined') return;
    document.documentElement.lang = AppI18n.getLang() === 'zh' ? 'zh' : 'en';
    AppI18n.applyTranslations();
    const langBtn = document.getElementById('lang-toggle');
    if (langBtn) langBtn.textContent = AppI18n.t('lang.toggle');
    applyParentModalI18n();
    const title = document.getElementById('modal-title');
    if (title) {
        title.textContent = t(modalMode === 'edit' ? 'parent.modal_edit' : 'parent.modal_add');
    }
    renderAccountCard().then(() => renderKidList());
}

function applyParentModalI18n() {
    if (typeof AppI18n === 'undefined') return;
    document.getElementById('modal-school-label').textContent  = t('profile.school');
    document.getElementById('modal-gender-label').textContent  = t('profile.gender');
    document.getElementById('modal-chinese-label').textContent = t('profile.chinese_level');
    document.getElementById('modal-avatar-label').textContent  = t('index.select_avatar');
    const kidPinLabel = document.getElementById('modal-kid-pin-label');
    if (kidPinLabel) kidPinLabel.textContent = t('parent.child_pin_label');
    const kidPinInput = document.getElementById('modal-child-pin');
    if (kidPinInput) kidPinInput.placeholder = t('parent.child_pin_placeholder');
    const schoolInput = document.getElementById('modal-school');
    if (schoolInput) schoolInput.placeholder = t('profile.school_placeholder');
    const schoolHint = document.getElementById('school-hint');
    if (schoolHint) schoolHint.textContent = t('parent.school_hint');
}

/**
 * Display account type.
 * - Basic: derived from kid count (≥2 = Family, else Individual)
 * - Premium: from subscribed account_type
 */
function effectiveAccountType(info) {
    if (info?.plan_tier === 'premium') {
        return info.account_type || 'single_child';
    }
    const kidCount = AUTH.getKidProfiles().length;
    return kidCount >= 2 ? 'multi_child' : 'single_child';
}

function isFamilyAccount(info) {
    return effectiveAccountType(info) === 'multi_child';
}

/**
 * Max kids allowed: Basic always 3. Premium: 1 for individual, 3 for family.
 */
function maxKidsAllowed(info) {
    if (info?.plan_tier === 'premium') {
        return info.account_type === 'multi_child' ? 3 : 1;
    }
    return 3; // Basic: no restriction up to 3
}

function profileSubtitle(p) {
    const lang = (typeof AppI18n !== 'undefined') ? AppI18n.getLang() : 'en';
    const parts = [p.grade];
    if (p.chineseLevel) parts.push(ProfileCatalog.chineseLabel(p.chineseLevel, lang));
    if (p.schoolName) parts.push(p.schoolName);
    return parts.join(' · ');
}

function showError(msg) {
    const el = document.getElementById('msg-error');
    el.style.color = '';
    el.style.background = '';
    el.style.borderColor = '';
    el.textContent = msg;
    el.classList.add('visible');
}

function showModalError(msg) {
    const el = document.getElementById('modal-error');
    el.textContent = msg;
    el.style.display = 'block';
}

function renderKidList() {
    const profiles = AUTH.getKidProfiles();
    const list     = document.getElementById('kid-list');

    const hint = document.getElementById('kids-hint');
    if (hint) hint.style.display = profiles.length ? 'block' : 'none';

    if (profiles.length === 0) {
        list.innerHTML = `<div class="no-kids-msg">${t('parent.no_kids')}</div>`;
        return;
    }

    list.innerHTML = profiles.map((p) => `
        <div class="kid-card" role="button" tabindex="0" data-name="${escapeHtml(p.name)}">
            <div class="kid-avatar">${ProfileCatalog.emojiForId(p.avatarId)}</div>
            <div class="kid-info">
                <div class="kid-name">${escapeHtml(p.name)}</div>
                <div class="kid-grade">${escapeHtml(profileSubtitle(p))}</div>
            </div>
        </div>`).join('');

    list.querySelectorAll('.kid-card').forEach((card) => {
        const name = card.dataset.name;
        card.addEventListener('click', () => {
            openModalForEdit(name);
        });
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openModalForEdit(name);
            }
        });
    });

    document.getElementById('add-kid-btn').disabled = profiles.length >= maxKidsAllowed(cachedFamilyInfo);
}

async function ensureFamilyInfoCached() {
    if (cachedFamilyInfo) return cachedFamilyInfo;
    const { info, error } = await AUTH.fetchFamilyInfo();
    if (!error && info) cachedFamilyInfo = info;
    return cachedFamilyInfo;
}

function showKidLimitModal(info) {
    // Premium Individual hit 1-kid limit; all others (Basic or Family Premium) hit 3-kid limit
    const isPremiumIndividual = info?.plan_tier === 'premium' && info?.account_type === 'single_child';
    const title = document.getElementById('kid-limit-title');
    const body = document.getElementById('kid-limit-body');
    const upgradeBtn = document.getElementById('kid-limit-upgrade-btn');
    if (title) title.textContent = t(isPremiumIndividual ? 'parent.individual_limit_title' : 'parent.family_limit_title');
    if (body) body.textContent = t(isPremiumIndividual ? 'parent.individual_limit_body' : 'parent.family_limit_body');
    if (upgradeBtn) {
        // Only show one-click family-upgrade for Premium Individual
        upgradeBtn.style.display = isPremiumIndividual ? 'block' : 'none';
        upgradeBtn.disabled = false;
        upgradeBtn.textContent = t('parent.upgrade_to_family_btn');
    }
    document.getElementById('kid-limit-modal')?.classList.add('visible');
}

async function scheduleUpgradeToFamilyAccount() {
    const info = await ensureFamilyInfoCached();
    const upgradeBtn = document.getElementById('kid-limit-upgrade-btn');
    if (upgradeBtn) upgradeBtn.disabled = true;

    const { result, error } = await AUTH.scheduleSubscriptionChange({
        targetAccountType: 'multi_child',
        targetPlanTier: info?.plan_tier || 'basic',
        changeKind: 'account_change',
    });

    if (upgradeBtn) upgradeBtn.disabled = false;
    if (error) {
        showError(error.includes('Individual Account') ? error : t('parent.sub_error'));
        return;
    }

    const effectiveAt = result?.effective_at || info?.billing_ends_at || info?.pending_effective_at;
    closeKidLimitModal();
    showInfo(t('parent.upgrade_to_family_scheduled', {
        date: effectiveAt ? formatBillingDate(effectiveAt) : '—',
    }));
    await renderAccountCard();
}

function closeKidLimitModal() {
    document.getElementById('kid-limit-modal')?.classList.remove('visible');
}

function wireKidLimitModal() {
    document.getElementById('kid-limit-ok-btn')?.addEventListener('click', closeKidLimitModal);
    document.getElementById('kid-limit-upgrade-btn')?.addEventListener('click', scheduleUpgradeToFamilyAccount);
    document.getElementById('kid-limit-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'kid-limit-modal') closeKidLimitModal();
    });
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

async function loadSchoolSuggestions() {
    try {
        const { data, error } = await db
            .from('schools')
            .select('name')
            .eq('is_active', true)
            .order('name', { ascending: true });
        if (error) return;
        availableSchools = (data || []).map((x) => x.name).filter(Boolean);
        renderSchoolSuggestions('');
    } catch {
        // keep free text input usable even if suggestions fail
    }
}

function renderSchoolSuggestions(query) {
    const list = document.getElementById('school-suggestions');
    if (!list) return;
    const q = String(query || '').trim().toLowerCase();
    const candidates = availableSchools.filter((name) => !q || name.toLowerCase().includes(q)).slice(0, 12);
    list.innerHTML = candidates
        .map((name) => `<option value="${escapeHtml(name)}"></option>`)
        .join('');
}

function buildModalPickers() {
    const genderEl = document.getElementById('modal-gender-picker');
    genderEl.innerHTML = `
        <button type="button" class="gender-opt" data-gender="M">${t('profile.gender_boy')}</button>
        <button type="button" class="gender-opt" data-gender="F">${t('profile.gender_girl')}</button>`;

    const chineseEl = document.getElementById('modal-chinese-picker');
    chineseEl.innerHTML = ProfileCatalog.CHINESE_LEVELS.map((lv) => `
        <button type="button" class="chinese-opt" data-chinese="${lv.id}">
            ${(typeof AppI18n !== 'undefined' && AppI18n.getLang() === 'zh') ? lv.labelZh : lv.labelEn}
        </button>`).join('');

    const avatarEl = document.getElementById('modal-avatar-picker');
    avatarEl.innerHTML = ProfileCatalog.AVATARS.map((a) => `
        <button type="button" class="avatar-opt" data-avatar-id="${a.id}">${a.emoji}</button>`).join('');
}

let modalPickersWired = false;

function wireModalPickers() {
    if (modalPickersWired) return;
    modalPickersWired = true;

    document.querySelectorAll('.grade-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.grade-opt').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            modalGrade = btn.dataset.grade;
        });
    });

    document.getElementById('modal-gender-picker')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.gender-opt');
        if (!btn) return;
        const wasSelected = btn.classList.contains('selected');
        document.querySelectorAll('.gender-opt').forEach((b) => b.classList.remove('selected'));
        if (wasSelected) {
            modalGender = '';
        } else {
            btn.classList.add('selected');
            modalGender = btn.dataset.gender || '';
        }
    });

    document.getElementById('modal-chinese-picker')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.chinese-opt');
        if (!btn) return;
        document.querySelectorAll('.chinese-opt').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        modalChineseLevel = btn.dataset.chinese;
    });

    document.getElementById('modal-avatar-picker')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.avatar-opt');
        if (!btn) return;
        document.querySelectorAll('.avatar-opt').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        modalAvatarId = btn.dataset.avatarId;
    });
}

function resetModalPickers(profile) {
    modalGrade        = profile?.grade || '';
    modalAvatarId     = profile?.avatarId || 'star';
    modalGender       = profile?.gender || '';
    modalChineseLevel = profile?.chineseLevel || 'CL';

    document.querySelectorAll('.grade-opt').forEach((b) => {
        b.classList.toggle('selected', profile ? b.dataset.grade === profile.grade : false);
    });
    document.querySelectorAll('.gender-opt').forEach((b) => {
        const g = profile?.gender || '';
        const isMatch = g && b.dataset.gender === g;
        b.classList.toggle('selected', !!profile && isMatch);
    });
    if (!profile) modalGender = '';
    document.querySelectorAll('.chinese-opt').forEach((b) => {
        b.classList.toggle('selected', profile ? b.dataset.chinese === profile.chineseLevel : b.dataset.chinese === 'CL');
    });
    document.querySelectorAll('.avatar-opt').forEach((b) => {
        b.classList.toggle('selected', b.dataset.avatarId === modalAvatarId);
    });
}

function resetKidPinFields(profile) {
    const pinInput = document.getElementById('modal-child-pin');
    const clearWrap = document.getElementById('modal-kid-pin-clear-wrap');
    const clearBox = document.getElementById('modal-kid-pin-clear');
    const hint = document.getElementById('modal-kid-pin-hint');
    editingKidPinEnabled = !!profile?.kidPinEnabled;
    if (pinInput) pinInput.value = '';
    if (clearBox) clearBox.checked = false;
    if (clearWrap) clearWrap.style.display = editingKidPinEnabled ? 'flex' : 'none';
    if (hint) {
        hint.textContent = editingKidPinEnabled
            ? t('parent.child_pin_hint_set')
            : t('parent.child_pin_hint');
    }
}

function openModalBase(mode, profile) {
    modalMode = mode;
    editingOriginalName = profile?.name || '';
    editingCloudId = profile?.cloudId || '';

    document.getElementById('modal-title').textContent = t(
        mode === 'edit' ? 'parent.modal_edit' : 'parent.modal_add'
    );
    document.getElementById('modal-name').value = profile?.name || '';
    document.getElementById('modal-school').value = profile?.schoolName || '';
    document.getElementById('modal-error').style.display = 'none';
    document.getElementById('modal-remove-btn').style.display = mode === 'edit' ? 'block' : 'none';
    resetKidPinFields(profile);

    buildModalPickers();
    applyParentModalI18n();
    resetModalPickers(profile);
    wireModalPickers();
    document.getElementById('add-modal').classList.add('open');
    setTimeout(() => document.getElementById('modal-name').focus(), 100);
}

async function openModal() {
    const info = await ensureFamilyInfoCached();
    const profiles = AUTH.getKidProfiles();
    if (profiles.length >= maxKidsAllowed(info)) {
        showKidLimitModal(info);
        return;
    }
    openModalBase('add', null);
}

function openModalForEdit(name) {
    const profile = AUTH.getKidProfiles().find((p) => p.name === name);
    if (!profile) return;
    openModalBase('edit', profile);
}

function closeModal() {
    document.getElementById('add-modal').classList.remove('open');
}

async function applyKidPinFromModal(cloudId) {
    if (!cloudId) return { error: null };
    const pinInput = document.getElementById('modal-child-pin');
    const clearBox = document.getElementById('modal-kid-pin-clear');
    const raw = (pinInput?.value || '').replace(/\D/g, '');

    if (raw.length > 0 && raw.length !== 3) {
        return { error: t('parent.child_pin_invalid') };
    }
    if (raw.length === 3) {
        return AUTH.setKidPinOnCloud(cloudId, raw);
    }
    if (clearBox?.checked && editingKidPinEnabled) {
        return AUTH.disableKidPinOnCloud(cloudId);
    }
    return { error: null };
}

async function saveProfile() {
    const name = document.getElementById('modal-name').value.trim();
    const school = document.getElementById('modal-school').value.trim();
    const btn = document.getElementById('modal-save-btn');

    if (name.length < 2) { showModalError(t('parent.name_min')); return; }
    if (!modalGrade)     { showModalError(t('parent.pick_grade')); return; }
    if (!modalChineseLevel) { showModalError(t('parent.pick_chinese')); return; }
    if (!modalAvatarId)  { showModalError(t('parent.pick_avatar')); return; }

    const profilePayload = {
        name,
        grade: modalGrade,
        avatarId: modalAvatarId,
        gender: modalGender || null,
        schoolName: school,
        chineseLevel: modalChineseLevel,
    };

    const profiles = AUTH.getKidProfiles();
    const nameTaken = profiles.find(
        (p) => p.name.toLowerCase() === name.toLowerCase()
            && p.name.toLowerCase() !== editingOriginalName.toLowerCase()
    );
    if (nameTaken) {
        showModalError(t('parent.name_taken'));
        return;
    }

    if (modalMode === 'add') {
        const info = cachedFamilyInfo || await ensureFamilyInfoCached();
        if (profiles.length >= maxKidsAllowed(info)) {
            closeModal();
            showKidLimitModal(info);
            return;
        }
    }

    btn.disabled = true;

    if (modalMode === 'edit') {
        let cloudId = editingCloudId;
        if (cloudId) {
            const { error } = await AUTH.updateKidProfileOnCloud(cloudId, profilePayload);
            if (error) {
                btn.disabled = false;
                showModalError(error);
                return;
            }
        } else {
            const { cloudId: newId, error } = await AUTH.createKidProfileOnCloud(profilePayload);
            if (error) {
                btn.disabled = false;
                showModalError(error);
                return;
            }
            cloudId = newId;
        }

        const pinResult = await applyKidPinFromModal(cloudId);
        if (pinResult.error) {
            btn.disabled = false;
            showModalError(pinResult.error);
            return;
        }

        const kidPinEnabled = (document.getElementById('modal-child-pin')?.value || '').replace(/\D/g, '').length === 3
            || (editingKidPinEnabled && !document.getElementById('modal-kid-pin-clear')?.checked);

        if (editingOriginalName && editingOriginalName !== name) {
            AUTH.removeKidProfile(editingOriginalName);
            AUTH.addKidProfile({ ...profilePayload, cloudId, kidPinEnabled });
        } else {
            AUTH.updateKidProfile(editingOriginalName || name, { ...profilePayload, cloudId, kidPinEnabled });
        }
        btn.disabled = false;
        closeModal();
        renderKidList();
        await renderAccountCard();
        showInfo(t('parent.update_success'));
        return;
    }

    const { cloudId, error } = await AUTH.createKidProfileOnCloud(profilePayload);

    if (error) {
        btn.disabled = false;
        showModalError(error);
        return;
    }

    const pinResult = await applyKidPinFromModal(cloudId);
    if (pinResult.error) {
        btn.disabled = false;
        showModalError(pinResult.error);
        return;
    }

    btn.disabled = false;

    const kidPinEnabled = (document.getElementById('modal-child-pin')?.value || '').replace(/\D/g, '').length === 3;

    const existing = profiles.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (existing) {
        AUTH.updateKidProfile(name, { ...profilePayload, cloudId: cloudId || existing.cloudId, kidPinEnabled });
    } else {
        const ok = AUTH.addKidProfile({ ...profilePayload, cloudId, kidPinEnabled });
        if (!ok) {
            showModalError(t('parent.name_taken'));
            return;
        }
    }

    closeModal();
    renderKidList();
    await renderAccountCard();
}

function openDeleteConfirmStep2(name, cloudId) {
    pendingDeleteName = name;
    pendingDeleteCloudId = cloudId || '';
    const body = document.getElementById('delete-confirm-body');
    if (body) body.textContent = t('parent.remove_confirm_final_body', { name });
    document.getElementById('delete-confirm-modal')?.classList.add('visible');
}

function closeDeleteConfirmModal() {
    document.getElementById('delete-confirm-modal')?.classList.remove('visible');
    pendingDeleteName = '';
    pendingDeleteCloudId = '';
}

async function executeProfileDelete() {
    const name = pendingDeleteName;
    const cloudId = pendingDeleteCloudId;
    if (!name) return;

    closeDeleteConfirmModal();
    const removeBtn = document.getElementById('modal-remove-btn');
    if (removeBtn) removeBtn.disabled = true;

    if (cloudId) {
        const { error } = await AUTH.deleteKidProfileOnCloud(cloudId);
        if (error) {
            if (removeBtn) removeBtn.disabled = false;
            showModalError(t('parent.remove_error'));
            return;
        }
    }

    AUTH.removeKidProfile(name);
    closeModal();
    renderKidList();
    await renderAccountCard();
    if (removeBtn) removeBtn.disabled = false;
}

function showImportModal(count, parentUserId) {
    const modal = document.getElementById('import-modal');
    const desc  = document.getElementById('import-modal-desc');
    document.getElementById('import-modal-error').style.display = 'none';
    const n = Number(count) || 0;
    setDynamicI18nText(desc, 'parent.import_desc', { n });
    if (typeof AppI18n !== 'undefined') {
        document.getElementById('import-modal-title').textContent = t('parent.import_title');
        document.getElementById('import-confirm-btn').textContent = t('parent.import_confirm');
        document.getElementById('import-skip-btn').textContent = t('parent.import_skip');
    }
    modal.classList.add('open');

    const onSkip = () => {
        AUTH.setKidImportDismissed(parentUserId);
        modal.classList.remove('open');
        cleanup();
    };

    const onConfirm = async () => {
        const confirmBtn = document.getElementById('import-confirm-btn');
        confirmBtn.disabled = true;
        const result = await AUTH.importLocalKidsToCloud();
        confirmBtn.disabled = false;

        if (result.failed > 0) {
            const errEl = document.getElementById('import-modal-error');
            errEl.textContent = t('parent.import_partial', { ok: result.imported, fail: result.failed });
            errEl.style.display = 'block';
        }

        const { kids } = await AUTH.fetchCloudKidProfiles();
        AUTH.mergeCloudKidsIntoLocal(kids);
        renderKidList();

        if (result.imported > 0) {
            showInfo(t('parent.import_success', { n: result.imported }));
        }

        AUTH.setKidImportDismissed(parentUserId);
        modal.classList.remove('open');
        cleanup();
    };

    function cleanup() {
        document.getElementById('import-skip-btn').removeEventListener('click', onSkip);
        document.getElementById('import-confirm-btn').removeEventListener('click', onConfirm);
    }

    document.getElementById('import-skip-btn').addEventListener('click', onSkip);
    document.getElementById('import-confirm-btn').addEventListener('click', onConfirm);
}

// ── Pricing constants (SGD; update when real billing is wired) ───────────────
const PREMIUM_PRICES = {
    single_child: { monthly: 12.90, annual_total: 129.00 },
    multi_child:  { monthly: 19.90, annual_total: 199.00 },
};

let upgradeBillingCycle   = 'monthly'; // 'monthly' | 'annual'
let upgradeTargetAcctType = 'single_child'; // 'single_child' | 'multi_child'

function formatBillingDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const dd   = String(d.getDate()).padStart(2, '0');
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${dd}-${mm}-${yyyy}`;
}

// ── Account card state machine ────────────────────────────────────────────────
async function renderAccountCard() {
    const { info, error } = await AUTH.fetchFamilyInfo();
    if (error || !info) return;
    cachedFamilyInfo = info;

    const isFamily      = isFamilyAccount(info);
    const isPremium     = info.plan_tier === 'premium';
    const pendingCancel = info.pending_change_kind === 'cancel';
    const endDate       = info.pending_effective_at || info.billing_ends_at;

    const acctLabel = t(isFamily ? 'parent.account_type_multi' : 'parent.account_type_single');
    const planLabel = t(isPremium ? 'parent.plan_premium_short' : 'parent.plan_basic_short');

    // ── Status headline ──────────────────────────────────────────────────────
    const statusLine = document.getElementById('account-status-line');
    const statusSub  = document.getElementById('account-status-sub');
    if (statusLine) statusLine.textContent = `${acctLabel} (${planLabel})`;

    if (statusSub) {
        statusSub.style.display = 'none';
        statusSub.textContent = '';
        if (isPremium && endDate) {
            statusSub.style.display = 'block';
            if (pendingCancel) {
                statusSub.textContent = t('parent.premium_cancels_on', { date: formatBillingDate(endDate) });
            } else {
                statusSub.textContent = t('parent.next_billing_date', { date: formatBillingDate(endDate) });
            }
        }
    }

    // ── Buttons ──────────────────────────────────────────────────────────────
    const show = (id) => { const el = document.getElementById(id); if (el) el.style.display = 'block'; };
    const hide = (id) => { const el = document.getElementById(id); if (el) el.style.display = 'none'; };

    hide('account-upgrade-btn');
    hide('account-cancel-btn');
    hide('account-renew-btn');
    hide('account-contact-link');

    if (!isPremium) {
        // Basic: show upgrade button with correct label
        const upgradeBtn = document.getElementById('account-upgrade-btn');
        if (upgradeBtn) {
            upgradeBtn.style.display = 'block';
            upgradeBtn.textContent = t('parent.upgrade_to_premium');
        }
    } else if (pendingCancel) {
        // Premium, already scheduled to cancel
        show('account-renew-btn');
        if (isFamily) show('account-contact-link');
    } else {
        // Premium active
        show('account-cancel-btn');
        if (isFamily) show('account-contact-link');
    }

    renderKidList();
}

// ── Upgrade modal (Basic → Premium) ──────────────────────────────────────────
function upgradeQuoteFor(acctType, cycle) {
    const prices = PREMIUM_PRICES[acctType === 'multi_child' ? 'multi_child' : 'single_child'];
    const isAnnual = cycle === 'annual';
    const annualMonthly = prices.annual_total / 12;
    const savePct = Math.round((1 - annualMonthly / prices.monthly) * 100);
    if (isAnnual) {
        return {
            main: `S$${prices.annual_total.toFixed(2)}`,
            sub: t('parent.per_year_equiv', { monthly: annualMonthly.toFixed(2) }),
            payAmount: prices.annual_total.toFixed(2),
            payPeriodKey: 'parent.pay_per_year',
            savePct,
        };
    }
    return {
        main: `S$${prices.monthly.toFixed(2)}`,
        sub: t('parent.per_month'),
        payAmount: prices.monthly.toFixed(2),
        payPeriodKey: 'parent.pay_per_month',
        savePct,
    };
}

function setUpgradeAcctType(type) {
    upgradeTargetAcctType = type;
    document.getElementById('upgrade-acct-individual-btn')?.classList.toggle('active', type === 'single_child');
    document.getElementById('upgrade-acct-family-btn')?.classList.toggle('active', type === 'multi_child');
    renderUpgradePricing();
}

function setUpgradeBillingCycle(cycle) {
    upgradeBillingCycle = cycle;
    document.getElementById('billing-monthly-btn')?.classList.toggle('active', cycle === 'monthly');
    document.getElementById('billing-annual-btn')?.classList.toggle('active', cycle === 'annual');
    renderUpgradePricing();
}

function renderUpgradePricing() {
    const indMonthly = upgradeQuoteFor('single_child', 'monthly');
    const indAnnual  = upgradeQuoteFor('single_child', 'annual');
    const famMonthly = upgradeQuoteFor('multi_child', 'monthly');
    const famAnnual  = upgradeQuoteFor('multi_child', 'annual');

    const cycle = upgradeBillingCycle;
    const indQuote  = cycle === 'annual' ? indAnnual : indMonthly;
    const famQuote  = cycle === 'annual' ? famAnnual : famMonthly;
    const monthlyQuote = upgradeQuoteFor(upgradeTargetAcctType, 'monthly');
    const annualQuote  = upgradeQuoteFor(upgradeTargetAcctType, 'annual');

    const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

    setText('upgrade-acct-ind-price', indQuote.main);
    setText('upgrade-acct-ind-sub', indQuote.sub);
    setText('upgrade-acct-family-price', famQuote.main);
    setText('upgrade-acct-family-sub', famQuote.sub);

    setText('billing-monthly-price', monthlyQuote.main);
    setText('billing-monthly-sub', monthlyQuote.sub);
    setText('billing-annual-price', annualQuote.main);
    setText('billing-annual-sub', annualQuote.sub);

    const saveBadge = document.getElementById('billing-annual-save');
    if (saveBadge) {
        saveBadge.style.display = 'block';
        saveBadge.textContent = t('parent.save_pct', { pct: annualQuote.savePct });
    }

    document.getElementById('billing-monthly-btn')?.classList.toggle('active', cycle === 'monthly');
    document.getElementById('billing-annual-btn')?.classList.toggle('active', cycle === 'annual');
    document.getElementById('upgrade-acct-individual-btn')?.classList.toggle('active', upgradeTargetAcctType === 'single_child');
    document.getElementById('upgrade-acct-family-btn')?.classList.toggle('active', upgradeTargetAcctType === 'multi_child');

    const selected = upgradeQuoteFor(upgradeTargetAcctType, cycle);
    const payBtn = document.getElementById('upgrade-pay-btn');
    if (payBtn) {
        payBtn.textContent = t('parent.upgrade_pay_amount', {
            amount: selected.payAmount,
            period: t(selected.payPeriodKey),
        });
    }
}

function openUpgradeModal() {
    if (!cachedFamilyInfo) return;
    const info    = cachedFamilyInfo;
    const isBasic = info.plan_tier !== 'premium';
    // For Basic Individual, allow choosing Individual or Family Premium.
    // For Basic Family (≥2 kids), default to Family.
    const currentIsFamily = isFamilyAccount(info);
    upgradeBillingCycle   = 'monthly';
    upgradeTargetAcctType = currentIsFamily ? 'multi_child' : 'single_child';

    const titleEl = document.getElementById('upgrade-modal-title');
    if (titleEl) titleEl.textContent = t('parent.upgrade_modal_title');

    const errEl = document.getElementById('upgrade-modal-error');
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }

    // Show account-type selector only for Basic Individual (1 kid) so they can pick
    const acctGroup = document.getElementById('upgrade-acct-type-group');
    if (acctGroup) acctGroup.style.display = (isBasic && !currentIsFamily) ? 'block' : 'none';

    setUpgradeAcctType(upgradeTargetAcctType);
    setUpgradeBillingCycle('monthly');
    document.getElementById('upgrade-modal')?.classList.add('visible');
}

function closeUpgradeModal() {
    document.getElementById('upgrade-modal')?.classList.remove('visible');
}

async function confirmCancelSubscription() {
    if (!cachedFamilyInfo) return;
    const { result, error } = await AUTH.scheduleSubscriptionChange({ changeKind: 'cancel' });
    if (error) {
        showError(t('parent.sub_error'));
        return;
    }
    const endDate = result?.effective_at || cachedFamilyInfo.billing_ends_at;
    const body = document.getElementById('cancel-retention-body');
    if (body) body.textContent = t('parent.cancel_modal_body', { date: formatBillingDate(endDate) });
    document.getElementById('cancel-retention-modal')?.classList.add('visible');
    await renderAccountCard();
}

async function resumeSubscription() {
    const { error } = await AUTH.resumeSubscription();
    if (error) { showError(t('parent.sub_error')); return; }
    showInfo(t('parent.resume_success'));
    await renderAccountCard();
}

function wireSubscriptionUi() {
    // Account card buttons
    document.getElementById('account-upgrade-btn')?.addEventListener('click', openUpgradeModal);
    document.getElementById('account-cancel-btn')?.addEventListener('click', confirmCancelSubscription);
    document.getElementById('account-renew-btn')?.addEventListener('click', resumeSubscription);

    // Upgrade modal — account type selector
    document.getElementById('upgrade-acct-individual-btn')?.addEventListener('click', () => setUpgradeAcctType('single_child'));
    document.getElementById('upgrade-acct-family-btn')?.addEventListener('click', () => setUpgradeAcctType('multi_child'));

    // Upgrade modal — billing cycle
    document.getElementById('billing-monthly-btn')?.addEventListener('click', () => setUpgradeBillingCycle('monthly'));
    document.getElementById('billing-annual-btn')?.addEventListener('click', () => setUpgradeBillingCycle('annual'));
    document.getElementById('upgrade-pay-btn')?.addEventListener('click', () => {
        // Placeholder: wire to payment/checkout page when billing is ready
        const errEl = document.getElementById('upgrade-modal-error');
        if (errEl) { errEl.textContent = t('parent.upgrade_pay_placeholder'); errEl.style.display = 'block'; }
    });
    document.getElementById('upgrade-cancel-btn')?.addEventListener('click', closeUpgradeModal);
    document.getElementById('upgrade-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'upgrade-modal') closeUpgradeModal();
    });

    // Cancel retention modal
    document.getElementById('cancel-retention-ok-btn')?.addEventListener('click', () => {
        document.getElementById('cancel-retention-modal')?.classList.remove('visible');
    });
    document.getElementById('cancel-retention-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'cancel-retention-modal') e.currentTarget.classList.remove('visible');
    });
}

function showInfo(msg) {
    const el = document.getElementById('msg-error');
    el.style.color = '#15803d';
    el.style.background = '#f0fdf4';
    el.style.borderColor = '#86efac';
    el.textContent = msg;
    el.classList.add('visible');
}

async function syncCloudKidsOnLoad(parentUserId) {
    const session = await AUTH.getParentSession();
    if (session) {
        const { error: familyError } = await AUTH.ensureFamilyRegisteredFromSession(session);
        if (familyError) {
            showError(familyError);
            return;
        }
    }

    const { kids, error } = await AUTH.syncKidProfilesFromCloud();
    if (!error && kids.length) {
        renderKidList();
        return;
    }

    const pending = AUTH.getKidsNeedingCloudSync();
    if (pending.length > 0 && !AUTH.isKidImportDismissed(parentUserId)) {
        showImportModal(pending.length, parentUserId);
    }
}

function leaveParentArea() {
    AUTH.revokeParentPinGate();
}

window.addEventListener('pagehide', leaveParentArea);

window.addEventListener('pageshow', () => {
    if (!AUTH.isPinVerified()) {
        window.location.replace('pin.html');
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    applyDashboardI18n();
    document.getElementById('lang-toggle')?.addEventListener('click', () => {
        if (typeof AppI18n === 'undefined') return;
        AppI18n.setLang(AppI18n.getLang() === 'zh' ? 'en' : 'zh');
        applyDashboardI18n();
        renderKidList();
    });

    const session = await AUTH.getParentSession();
    if (!session) { window.location.href = 'index.html'; return; }
    if (!AUTH.isPinVerified()) { window.location.href = 'pin.html'; return; }

    const displayName = session.user.user_metadata?.display_name
        || session.user.email?.split('@')[0]
        || 'Parent';
    document.getElementById('parent-name').textContent = `👋 Hi, ${displayName}!`;

    renderKidList();
    await syncCloudKidsOnLoad(session.user.id);
    await renderAccountCard();
    wireSubscriptionUi();
    wireKidLimitModal();
    await loadSchoolSuggestions();
    document.getElementById('modal-school')?.addEventListener('input', (e) => {
        renderSchoolSuggestions(e.target.value);
    });

    document.getElementById('add-kid-btn').addEventListener('click', openModal);
    document.getElementById('modal-save-btn').addEventListener('click', saveProfile);
    document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);
    document.getElementById('modal-remove-btn').addEventListener('click', () => {
        if (!editingOriginalName) return;
        const profile = AUTH.getKidProfiles().find((p) => p.name === editingOriginalName);
        const cloudId = editingCloudId || profile?.cloudId || '';
        const confirmKey = cloudId ? 'parent.remove_confirm_cloud' : 'parent.remove_confirm_local';
        if (!confirm(t(confirmKey, { name: editingOriginalName }))) return;
        openDeleteConfirmStep2(editingOriginalName, cloudId);
    });
    document.getElementById('delete-confirm-yes-btn')?.addEventListener('click', executeProfileDelete);
    document.getElementById('delete-confirm-no-btn')?.addEventListener('click', closeDeleteConfirmModal);
    document.getElementById('delete-confirm-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'delete-confirm-modal') closeDeleteConfirmModal();
    });

    document.getElementById('back-hub-btn').addEventListener('click', () => {
        leaveParentArea();
        window.location.href = '../student/index.html';
    });

    document.getElementById('signout-btn').addEventListener('click', async () => {
        await AUTH.signOut();
        window.location.href = 'index.html';
    });
});
