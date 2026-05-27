// parent/index.js — login / register / forgot password / reset password

const db = window.SupabaseClient;

function t(key) {
    return (typeof AppI18n !== 'undefined') ? AppI18n.t(key) : key;
}

function applyParentAuthI18n() {
    if (typeof AppI18n === 'undefined') return;
    document.documentElement.lang = AppI18n.getLang() === 'zh' ? 'zh' : 'en';
    AppI18n.applyTranslations();
    const langBtn = document.getElementById('lang-toggle');
    if (langBtn) langBtn.textContent = AppI18n.t('lang.toggle');
}

function setAuthToggleHtml(showRegisterPrompt) {
    const el = authToggle();
    if (!el) return;
    if (showRegisterPrompt) {
        el.innerHTML = `${t('auth.prompt_no_account')} <a href="#" id="toggle-link">${t('auth.link_register')}</a>`;
        bindToggleLink(false);
    } else {
        el.innerHTML = `${t('auth.prompt_have_account')} <a href="#" id="toggle-link">${t('auth.link_sign_in')}</a>`;
        bindToggleLink(true);
    }
}

const signinForm    = () => document.getElementById('signin-form');
const registerForm  = () => document.getElementById('register-form');
const forgotForm    = () => document.getElementById('forgot-form');
const resetForm     = () => document.getElementById('reset-form');
const authToggle    = () => document.getElementById('auth-toggle');
const subtitle      = () => document.getElementById('form-subtitle');

function showError(msg) {
    const el = document.getElementById('msg-error');
    el.textContent = msg;
    el.classList.add('visible');
    document.getElementById('msg-info').classList.remove('visible');
}

function showInfo(msg) {
    const el = document.getElementById('msg-info');
    el.textContent = msg;
    el.classList.add('visible');
    document.getElementById('msg-error').classList.remove('visible');
}

function clearMessages() {
    document.getElementById('msg-error').classList.remove('visible');
    document.getElementById('msg-info').classList.remove('visible');
}

function setLoading(btn, loading, label) {
    if (loading) {
        btn.disabled = true;
        btn.dataset.label = btn.textContent;
        btn.innerHTML = '<span class="spinner"></span> Please wait...';
    } else {
        btn.disabled = false;
        btn.textContent = label || btn.dataset.label || btn.textContent;
    }
}

/** Redirect target for email confirm / password reset (must match Supabase Redirect URLs). */
function getAuthRedirectUrl() {
    return new URL('index.html', window.location.href).href.split('#')[0];
}

function hideAllForms() {
    signinForm().style.display   = 'none';
    registerForm().style.display = 'none';
    forgotForm().style.display   = 'none';
    resetForm().style.display    = 'none';
}

function showSignInView() {
    hideAllForms();
    signinForm().style.display = 'block';
    authToggle().style.display = 'block';
    setAuthToggleHtml(true);
    subtitle().dataset.i18n = 'auth.subtitle_signin';
    subtitle().textContent = t('auth.subtitle_signin');
    bindForgotLink();
}

function showRegisterView() {
    hideAllForms();
    registerForm().style.display = 'block';
    authToggle().style.display = 'block';
    setAuthToggleHtml(false);
    subtitle().dataset.i18n = 'auth.subtitle_register';
    subtitle().textContent = t('auth.subtitle_register');
}

function showForgotView() {
    hideAllForms();
    forgotForm().style.display = 'block';
    authToggle().style.display = 'none';
    subtitle().dataset.i18n = 'auth.subtitle_forgot';
    subtitle().textContent = t('auth.subtitle_forgot');
}

function showResetView() {
    hideAllForms();
    resetForm().style.display = 'block';
    authToggle().style.display = 'none';
    subtitle().dataset.i18n = 'auth.subtitle_reset';
    subtitle().textContent = t('auth.subtitle_reset');
}

function bindToggleLink(fromRegister) {
    const link = document.getElementById('toggle-link');
    if (!link) return;
    link.addEventListener('click', (e) => {
        e.preventDefault();
        clearMessages();
        if (fromRegister) showSignInView();
        else showRegisterView();
    });
}

function bindForgotLink() {
    const link = document.getElementById('forgot-link');
    if (!link) return;
    link.addEventListener('click', (e) => {
        e.preventDefault();
        clearMessages();
        const email = document.getElementById('signin-email').value.trim();
        if (email) document.getElementById('forgot-email').value = email;
        showForgotView();
    });
}

function passwordsMatch(pass, confirm) {
    return pass.length >= 8 && pass === confirm;
}

async function handlePostSignIn() {
    const session = await AUTH.getParentSession();
    if (!session) {
        showError('Session expired. Please sign in again.');
        return;
    }

    const { error } = await AUTH.ensureFamilyRegisteredFromSession(session);
    if (error) {
        showError(error);
        return;
    }

    if (AUTH.isPinVerified()) {
        window.location.href = 'dashboard.html';
    } else {
        window.location.href = 'pin.html';
    }
}

function isRecoveryCallback() {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return false;
    const params = new URLSearchParams(hash);
    return params.get('type') === 'recovery';
}

// ── Bootstrap ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    applyParentAuthI18n();
    document.getElementById('lang-toggle')?.addEventListener('click', () => {
        const next = AppI18n.getLang() === 'zh' ? 'en' : 'zh';
        AppI18n.setLang(next);
        applyParentAuthI18n();
        if (signinForm().style.display !== 'none') showSignInView();
        else if (registerForm().style.display !== 'none') showRegisterView();
        else if (forgotForm().style.display !== 'none') showForgotView();
        else if (resetForm().style.display !== 'none') showResetView();
    });

    // Pick up tokens from email confirm / password-reset links in the URL hash
    try {
        await db.auth.getSession();
    } catch { /* ignore */ }

    if (isRecoveryCallback()) {
        showResetView();
        bindResetForm();
        return;
    }

    const session = await AUTH.getParentSession();
    if (session) {
        await handlePostSignIn();
        return;
    }

    showSignInView();
    const setupErr = sessionStorage.getItem('parent_setup_error');
    if (setupErr) {
        sessionStorage.removeItem('parent_setup_error');
        showError(setupErr);
    }
    bindSignInForm();
    bindRegisterForm();
    bindForgotForm();

    db.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') {
            showResetView();
            bindResetForm();
        }
    });
});

function bindSignInForm() {
    signinForm().addEventListener('submit', async (e) => {
        e.preventDefault();
        clearMessages();
        const btn   = document.getElementById('signin-btn');
        const email = document.getElementById('signin-email').value.trim();
        const pass  = document.getElementById('signin-password').value;

        setLoading(btn, true);
        try {
            const { error } = await db.auth.signInWithPassword({ email, password: pass });
            if (error) {
                showError(error.message);
            } else {
                await handlePostSignIn();
            }
        } catch {
            showError('Network error. Please try again.');
        } finally {
            setLoading(btn, false, 'Sign In');
        }
    });
}

function bindRegisterForm() {
    registerForm().addEventListener('submit', async (e) => {
        e.preventDefault();
        clearMessages();
        const btn     = document.getElementById('register-btn');
        const name    = document.getElementById('reg-name').value.trim();
        const email   = document.getElementById('reg-email').value.trim();
        const pass    = document.getElementById('reg-password').value;
        const confirm = document.getElementById('reg-password-confirm').value;

        if (!passwordsMatch(pass, confirm)) {
            showError('Passwords do not match, or are shorter than 8 characters.');
            return;
        }

        const consentEl = document.getElementById('reg-adult-consent');
        if (!consentEl?.checked) {
            showError(AppI18n.getLang() === 'zh'
                ? '请确认您是父母或法定监护人。'
                : 'Please confirm you are the parent or legal guardian.');
            return;
        }

        AUTH.setFamilySetupPending({
            displayName: name,
            accountType: 'single_child',
            adultAttestation: true,
        });

        setLoading(btn, true);
        try {
            const { data, error } = await db.auth.signUp({
                email,
                password: pass,
                options: {
                    data: { display_name: name },
                    emailRedirectTo: getAuthRedirectUrl(),
                },
            });
            if (error) {
                showError(error.message);
            } else if (data?.session) {
                const { error: familyError } = await AUTH.ensureFamilyRegistered({
                    displayName: name,
                    accountType: 'single_child',
                    adultAttestation: true,
                });
                if (familyError) {
                    showError(familyError);
                } else {
                    await handlePostSignIn();
                }
            } else {
                showInfo('Account created! If email confirmation is on, check your inbox — then sign in.');
                registerForm().reset();
                showSignInView();
            }
        } catch {
            showError('Network error. Please try again.');
        } finally {
            setLoading(btn, false, 'Create Account');
        }
    });
}

function bindForgotForm() {
    document.getElementById('forgot-cancel-btn').addEventListener('click', () => {
        clearMessages();
        showSignInView();
    });

    forgotForm().addEventListener('submit', async (e) => {
        e.preventDefault();
        clearMessages();
        const btn   = document.getElementById('forgot-btn');
        const email = document.getElementById('forgot-email').value.trim();

        setLoading(btn, true);
        try {
            const { error } = await db.auth.resetPasswordForEmail(email, {
                redirectTo: getAuthRedirectUrl(),
            });
            if (error) {
                showError(error.message);
            } else {
                showInfo('Reset link sent! Check your email, then return here to set a new password.');
                showSignInView();
            }
        } catch {
            showError('Network error. Please try again.');
        } finally {
            setLoading(btn, false, 'Send Reset Link');
        }
    });
}

function bindResetForm() {
    const form = resetForm();
    const clone = form.cloneNode(true);
    form.parentNode.replaceChild(clone, form);

    clone.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearMessages();
        const btn     = document.getElementById('reset-btn');
        const pass    = document.getElementById('reset-password').value;
        const confirm = document.getElementById('reset-password-confirm').value;

        if (!passwordsMatch(pass, confirm)) {
            showError('Passwords do not match, or are shorter than 8 characters.');
            return;
        }

        setLoading(btn, true);
        try {
            const { error } = await db.auth.updateUser({ password: pass });
            if (error) {
                showError(error.message);
            } else {
                showInfo('Password updated! Redirecting…');
                history.replaceState(null, '', getAuthRedirectUrl());
                setTimeout(() => handlePostSignIn(), 800);
            }
        } catch {
            showError('Network error. Please try again.');
        } finally {
            setLoading(btn, false, 'Update Password');
        }
    });
}
