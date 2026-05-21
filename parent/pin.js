// parent/pin.js — Disney+-style 4-digit parent PIN gate

const db = window.SupabaseClient;

let pinValue    = '';
let pinMode     = 'verify'; // 'verify' | 'set' | 'confirm'
let firstPin    = '';
let lockTimer   = null;

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

// ── PIN submission ────────────────────────────────────────────────────────────

async function submitPin() {
    const submitted = pinValue;
    pinValue = '';
    document.getElementById('pin-input').value = '';

    if (pinMode === 'set') {
        firstPin = submitted;
        pinMode  = 'confirm';
        document.getElementById('pin-subtitle').textContent = 'Confirm your PIN.';
        document.getElementById('pin-step-label').textContent = 'Confirm PIN';
        updateDots();
        return;
    }

    if (pinMode === 'confirm') {
        if (submitted !== firstPin) {
            flashError("PINs don't match. Try again.");
            pinMode  = 'set';
            firstPin = '';
            document.getElementById('pin-subtitle').textContent = 'Choose a 4-digit PIN.';
            return;
        }
        // Save PIN via RPC
        await savePin(submitted);
        return;
    }

    // verify mode
    await verifyPin(submitted);
}

async function verifyPin(raw) {
    try {
        const { data, error } = await db.rpc('verify_parent_pin', { raw_pin: raw });
        if (error || !data) {
            const fails    = AUTH.incrementPinFail();
            const lockLeft = AUTH.getPinLockRemaining();
            if (lockLeft > 0) {
                flashError(`Wrong PIN. Locked for ${Math.ceil(lockLeft / 1000)}s.`);
                setLocked(lockLeft);
            } else {
                const remaining = 5 - fails;
                flashError(remaining > 0
                    ? `Wrong PIN. ${remaining} attempt${remaining !== 1 ? 's' : ''} left.`
                    : 'Wrong PIN.');
            }
        } else {
            AUTH.resetPinFail();
            AUTH.setPinVerified(true);
            window.location.href = 'dashboard.html';
        }
    } catch {
        flashError('Network error. Please try again.');
    }
}

function resetPinSetupUI() {
    pinMode  = 'set';
    firstPin = '';
    const stepLabel = document.getElementById('pin-step-label');
    if (stepLabel) stepLabel.textContent = 'New PIN';
    document.getElementById('pin-subtitle').textContent = 'Choose a 4-digit PIN.';
    updateDots();
}

async function savePin(raw) {
    try {
        const { error } = await db.rpc('set_parent_pin', { raw_pin: raw });
        if (error) {
            flashError(error.message || 'Could not save PIN. Please try again.');
            resetPinSetupUI();
            return;
        }
        AUTH.setPinVerified(true);
        window.location.href = 'dashboard.html';
    } catch (err) {
        flashError(err.message || 'Network error. Please try again.');
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
    // Guard: must be authenticated
    const session = await AUTH.getParentSession();
    if (!session) {
        window.location.href = 'index.html';
        return;
    }

    // Guard: already verified this session
    if (AUTH.isPinVerified()) {
        window.location.href = 'dashboard.html';
        return;
    }

    // Check if lockout is in effect from a previous failed run this session
    const lockLeft = AUTH.getPinLockRemaining();
    if (lockLeft > 0) setLocked(lockLeft);

    // Check if PIN has been set yet
    try {
        const { data: hasPinSet } = await db.rpc('check_pin_exists');
        if (!hasPinSet) {
            pinMode = 'set';
            document.getElementById('pin-logo').textContent    = '🔑';
            document.getElementById('pin-title').textContent   = 'Set Your PIN';
            document.getElementById('pin-subtitle').textContent = 'Choose a 4-digit PIN.';
            // Insert step label above dots
            const stepLabel = document.createElement('p');
            stepLabel.className = 'pin-step-label';
            stepLabel.id        = 'pin-step-label';
            stepLabel.textContent = 'New PIN';
            document.getElementById('pin-dots').before(stepLabel);
        }
    } catch { /* fallback to verify mode */ }

    // Keypad
    document.querySelectorAll('.pin-key[data-digit]').forEach(btn => {
        btn.addEventListener('click', () => appendDigit(btn.dataset.digit));
    });
    document.getElementById('pin-del').addEventListener('click', deleteDigit);

    // Hidden input (physical keyboard / iOS keyboard)
    const hiddenInput = document.getElementById('pin-input');
    hiddenInput.addEventListener('input', () => {
        const clean = hiddenInput.value.replace(/\D/g, '').slice(0, 4);
        pinValue = clean;
        hiddenInput.value = clean;
        updateDots();
        if (pinValue.length === 4) submitPin();
    });

    // Tap anywhere on the dots area to focus hidden input
    document.getElementById('pin-dots').addEventListener('click', () => hiddenInput.focus());

    // Sign out
    document.getElementById('signout-btn').addEventListener('click', async () => {
        await AUTH.signOut();
        window.location.href = 'index.html';
    });
});
