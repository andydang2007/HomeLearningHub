// parent/index.js — login / register / forgot password / reset password

const db = window.SupabaseClient;

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
    authToggle().innerHTML = "Don't have an account? <a href=\"#\" id=\"toggle-link\">Register</a>";
    subtitle().textContent = "Sign in to manage your kids' profiles.";
    bindToggleLink(false);
    bindForgotLink();
}

function showRegisterView() {
    hideAllForms();
    registerForm().style.display = 'block';
    authToggle().style.display = 'block';
    authToggle().innerHTML = 'Already have an account? <a href="#" id="toggle-link">Sign In</a>';
    subtitle().textContent = 'Create a free parent account.';
    bindToggleLink(true);
}

function showForgotView() {
    hideAllForms();
    forgotForm().style.display = 'block';
    authToggle().style.display = 'none';
    subtitle().textContent = 'Reset your password';
}

function showResetView() {
    hideAllForms();
    resetForm().style.display = 'block';
    authToggle().style.display = 'none';
    subtitle().textContent = 'Choose a new password';
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

        setLoading(btn, true);
        try {
            const { error } = await db.auth.signUp({
                email,
                password: pass,
                options: {
                    data: { display_name: name },
                    emailRedirectTo: getAuthRedirectUrl(),
                },
            });
            if (error) {
                showError(error.message);
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
