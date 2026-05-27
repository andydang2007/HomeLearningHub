// parent/pin.js — Disney+-style 4-digit parent PIN gate

const db = window.SupabaseClient;

let pinValue          = '';
let pinMode           = 'verify'; // 'verify' | 'set' | 'confirm'
let firstPin          = '';
let lockTimer         = null;
let isChangePinFlow   = false;
let isForgotResetFlow = false;
let parentSessionEmail = '';

function t(key, vars) {
    return (typeof AppI18n !== 'undefined') ? AppI18n.t(key, vars) : key;
}

function applyPinI18n() {
    if (typeof AppI18n === 'undefined') return;
    document.documentElement.lang = AppI18n.getLang() === 'zh' ? 'zh' : 'en';
    AppI18n.applyTranslations();
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function updateDots(isError = false) {
    for (let i = 0; i < 4; i++) {
        const dot = document.getElementById(`dot-${i}`);
        dot.classList.toggle('filled', i < pinValue.length);
        dot.classList.toggle('error', isError);
    }
}

function flashError(msg) {
    updateDots(true);
    document.getElementById('pin-attempt-msg').textContent = msg;
    setTimeout(() => {
        for (let i = 0; i < 4; i++) document.getElementById(`dot-${i}`).classList.remove('error');
    }, 500);
    pinValue = '';
    document.getElementById('pin-input').value = '';
}

function flashPasswordError(msg) {
    const el = document.getElementById('password-attempt-msg');
    if (el) el.textContent = msg;
}

function setLocked(remainingMs) {
    const keypad  = document.getElementById('pin-keypad');
    const lockMsg = document.getElementById('pin-lock-msg');
    const input   = document.getElementById('pin-input');

    keypad.style.pointerEvents  = 'none';
    keypad.style.opacity        = '0.4';
    input.disabled              = true;
    lockMsg.classList.add('visible');

    const countdown = document.getElementById('lock-countdown');

    clearInterval(lockTimer);
    lockTimer = setInterval(() => {
        const remaining = AUTH.getPinLockRemaining();
        if (remaining <= 0) {
            clearInterval(lockTimer);
            keypad.style.pointerEvents = '';
            keypad.style.opacity       = '';
            input.disabled             = false;
            lockMsg.classList.remove('visible');
            document.getElementById('pin-attempt-msg').textContent = '';
        } else {
            countdown.textContent = Math.ceil(remaining / 1000);
        }
    }, 500);

    countdown.textContent = Math.ceil(remainingMs / 1000);
}

function showPinUi() {
    document.getElementById('pin-pin-ui')?.classList.remove('hidden');
    document.getElementById('password-gate')?.classList.remove('visible');
    document.getElementById('forgot-pin-btn').style.display = isChangePinFlow ? 'none' : 'inline-block';
}

function showPasswordGate() {
    document.getElementById('pin-pin-ui')?.classList.add('hidden');
    document.getElementById('password-gate')?.classList.add('visible');
    document.getElementById('forgot-pin-btn').style.display = 'none';
    document.getElementById('password-attempt-msg').textContent = '';
    const verifyBtn = document.getElementById('forgot-verify-btn');
    if (verifyBtn) verifyBtn.disabled = false;
    const emailEl = document.getElementById('forgot-email');
    if (emailEl) emailEl.value = parentSessionEmail;
    document.getElementById('forgot-password').value = '';
    setTimeout(() => document.getElementById('forgot-password')?.focus(), 100);
}

function enterNewPinSetup(titleKey, subtitleKey) {
    pinMode = 'set';
    firstPin = '';
    document.getElementById('pin-logo').textContent = '🔑';
    document.getElementById('pin-title').textContent = t(titleKey);
    document.getElementById('pin-subtitle').textContent = t(subtitleKey);
    let stepLabel = document.getElementById('pin-step-label');
    if (!stepLabel) {
        stepLabel = document.createElement('p');
        stepLabel.className = 'pin-step-label';
        stepLabel.id = 'pin-step-label';
        document.getElementById('pin-dots').before(stepLabel);
    }
    stepLabel.textContent = t('parent.pin_step_new');
    showPinUi();
    updateDots();
    document.getElementById('pin-attempt-msg').textContent = '';
    document.getElementById('pin-input').focus();
}

function enterChangePinSetup() {
    isForgotResetFlow = false;
    enterNewPinSetup('parent.pin_change_title', 'parent.pin_change_subtitle');
}

function enterForgotPinReset() {
    isForgotResetFlow = true;
    AUTH.resetPinFail();
    enterNewPinSetup('parent.pin_reset_title', 'parent.pin_reset_subtitle');
}

function resetPinSetupUI() {
    pinMode  = 'set';
    firstPin = '';
    const stepLabel = document.getElementById('pin-step-label');
    if (stepLabel) stepLabel.textContent = t('parent.pin_step_new');
    document.getElementById('pin-subtitle').textContent = t(
        isForgotResetFlow ? 'parent.pin_reset_subtitle' : 'parent.pin_set_subtitle'
    );
    updateDots();
}

// ── PIN submission ────────────────────────────────────────────────────────────

async function submitPin() {
    const submitted = pinValue;
    pinValue = '';
    document.getElementById('pin-input').value = '';

    if (pinMode === 'set') {
        firstPin = submitted;
        pinMode  = 'confirm';
        document.getElementById('pin-subtitle').textContent = t('parent.pin_confirm_subtitle');
        document.getElementById('pin-step-label').textContent = t('parent.pin_step_confirm');
        updateDots();
        return;
    }

    if (pinMode === 'confirm') {
        if (submitted !== firstPin) {
            flashError(t('parent.pin_mismatch'));
            pinMode  = 'set';
            firstPin = '';
            document.getElementById('pin-subtitle').textContent = t(
                isForgotResetFlow ? 'parent.pin_reset_subtitle' : 'parent.pin_set_subtitle'
            );
            return;
        }
        await savePin(submitted);
        return;
    }

    await verifyPin(submitted);
}

async function verifyPin(raw) {
    try {
        const { data, error } = await db.rpc('verify_parent_pin', { raw_pin: raw });
        if (error || !data) {
            const fails    = AUTH.incrementPinFail();
            const lockLeft = AUTH.getPinLockRemaining();
            if (lockLeft > 0) {
                flashError(t('parent.pin_locked', { s: Math.ceil(lockLeft / 1000) }));
                setLocked(lockLeft);
            } else {
                const remaining = 5 - fails;
                flashError(remaining > 0
                    ? t('parent.pin_wrong_attempts', { n: remaining })
                    : t('parent.pin_wrong'));
            }
        } else {
            AUTH.resetPinFail();
            if (isChangePinFlow) {
                enterChangePinSetup();
                return;
            }
            AUTH.setPinVerified(true);
            window.location.href = 'dashboard.html';
        }
    } catch {
        flashError(t('parent.pin_network_error'));
    }
}

async function verifyPasswordAndReset() {
    const password = document.getElementById('forgot-password').value;
    const btn = document.getElementById('forgot-verify-btn');
    if (!password) {
        flashPasswordError(t('parent.pin_forgot_password_required'));
        return;
    }

    btn.disabled = true;
    flashPasswordError('');

    try {
        const { error } = await db.auth.signInWithPassword({
            email: parentSessionEmail,
            password,
        });
        if (error) {
            flashPasswordError(t('parent.pin_forgot_password_wrong'));
            btn.disabled = false;
            return;
        }
        enterForgotPinReset();
    } catch {
        flashPasswordError(t('parent.pin_network_error'));
        btn.disabled = false;
    }
}

async function savePin(raw) {
    try {
        const { error } = await db.rpc('set_parent_pin', { raw_pin: raw });
        if (error) {
            flashError(error.message || t('parent.pin_save_error'));
            resetPinSetupUI();
            return;
        }
        AUTH.setPinVerified(true);
        window.location.href = 'dashboard.html';
    } catch (err) {
        flashError(err.message || t('parent.pin_network_error'));
        resetPinSetupUI();
    }
}

// ── Input handling ────────────────────────────────────────────────────────────

function appendDigit(d) {
    if (AUTH.getPinLockRemaining() > 0) return;
    if (pinValue.length >= 4) return;
    pinValue += d;
    document.getElementById('pin-input').value = pinValue;
    updateDots();
    if (pinValue.length === 4) submitPin();
}

function deleteDigit() {
    if (pinValue.length === 0) return;
    pinValue = pinValue.slice(0, -1);
    document.getElementById('pin-input').value = pinValue;
    updateDots();
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    applyPinI18n();
    isChangePinFlow = new URLSearchParams(window.location.search).get('change') === '1';

    const session = await AUTH.getParentSession();
    if (!session) {
        window.location.href = 'index.html';
        return;
    }
    parentSessionEmail = session.user.email || '';

    const { error: familyError } = await AUTH.ensureFamilyRegisteredFromSession(session);
    if (familyError) {
        sessionStorage.setItem('parent_setup_error', familyError);
        window.location.href = 'index.html';
        return;
    }

    if (AUTH.isPinVerified() && !isChangePinFlow) {
        window.location.href = 'dashboard.html';
        return;
    }

    if (isChangePinFlow) {
        document.getElementById('pin-title').textContent = t('parent.pin_verify_current_title');
        document.getElementById('pin-subtitle').textContent = t('parent.pin_verify_current_subtitle');
        document.getElementById('cancel-pin-btn').style.display = 'block';
    } else {
        document.getElementById('pin-title').textContent = t('parent.pin_gate_title');
        document.getElementById('pin-subtitle').textContent = t('parent.pin_gate_subtitle');
    }

    const lockLeft = AUTH.getPinLockRemaining();
    if (lockLeft > 0) setLocked(lockLeft);

    let hasPinSet = true;
    try {
        const { data } = await db.rpc('check_pin_exists');
        hasPinSet = !!data;
        if (!hasPinSet) {
            pinMode = 'set';
            document.getElementById('pin-logo').textContent = '🔑';
            document.getElementById('pin-title').textContent = t('parent.pin_set_title');
            document.getElementById('pin-subtitle').textContent = t('parent.pin_set_subtitle');
            const stepLabel = document.createElement('p');
            stepLabel.className = 'pin-step-label';
            stepLabel.id = 'pin-step-label';
            stepLabel.textContent = t('parent.pin_step_new');
            document.getElementById('pin-dots').before(stepLabel);
            document.getElementById('forgot-pin-btn').style.display = 'none';
        }
    } catch { /* fallback */ }

    if (!isChangePinFlow && hasPinSet) {
        document.getElementById('forgot-pin-btn').style.display = 'inline-block';
    }

    document.querySelectorAll('.pin-key[data-digit]').forEach(btn => {
        btn.addEventListener('click', () => {
            appendDigit(btn.dataset.digit);
            hiddenInput.focus();
        });
    });
    document.getElementById('pin-del').addEventListener('click', () => {
        deleteDigit();
        hiddenInput.focus();
    });

    const hiddenInput = document.getElementById('pin-input');
    hiddenInput.addEventListener('input', () => {
        const clean = hiddenInput.value.replace(/\D/g, '').slice(0, 4);
        pinValue = clean;
        hiddenInput.value = clean;
        updateDots();
        if (pinValue.length === 4) submitPin();
    });
    hiddenInput.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace') {
            e.preventDefault();
            deleteDigit();
            hiddenInput.value = pinValue;
        }
    });

    document.getElementById('pin-dots').addEventListener('click', () => hiddenInput.focus());
    document.querySelector('.container')?.addEventListener('click', (e) => {
        if (!e.target.closest('.pin-key')
            && !e.target.closest('#cancel-pin-btn')
            && !e.target.closest('#forgot-pin-btn')
            && !e.target.closest('#password-gate')
            && !e.target.closest('#forgot-back-btn')) {
            hiddenInput.focus();
        }
    });

    hiddenInput.focus();

    document.getElementById('forgot-pin-btn')?.addEventListener('click', () => showPasswordGate());
    document.getElementById('forgot-back-btn')?.addEventListener('click', () => showPinUi());
    document.getElementById('forgot-verify-btn')?.addEventListener('click', verifyPasswordAndReset);
    document.getElementById('forgot-password')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            verifyPasswordAndReset();
        }
    });
    document.getElementById('cancel-pin-btn')?.addEventListener('click', () => {
        window.location.href = 'dashboard.html';
    });
});
