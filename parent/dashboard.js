// parent/dashboard.js — parent dashboard: kid profile management

const db = window.SupabaseClient;

let modalGrade        = '';
let modalAvatarId     = 'star';
let modalGender       = '';
let modalChineseLevel = 'CL';

function t(key) {
    return (typeof AppI18n !== 'undefined') ? AppI18n.t(key) : key;
}

function applyParentModalI18n() {
    if (typeof AppI18n === 'undefined') return;
    document.getElementById('modal-school-label').textContent  = t('profile.school');
    document.getElementById('modal-gender-label').textContent  = t('profile.gender');
    document.getElementById('modal-chinese-label').textContent = t('profile.chinese_level');
    document.getElementById('modal-avatar-label').textContent  = t('index.select_avatar');
    const schoolInput = document.getElementById('modal-school');
    if (schoolInput) schoolInput.placeholder = t('profile.school_placeholder');
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

    if (profiles.length === 0) {
        list.innerHTML = '<div class="no-kids-msg">No profiles yet. Add your first child below!</div>';
        return;
    }

    list.innerHTML = profiles.map((p, i) => `
        <div class="kid-card">
            <div class="kid-avatar">${ProfileCatalog.emojiForId(p.avatarId)}</div>
            <div class="kid-info">
                <div class="kid-name">${p.name}</div>
                <div class="kid-grade">${profileSubtitle(p)}</div>
            </div>
            <button class="btn-remove" data-name="${p.name}" title="Remove">✕</button>
        </div>`).join('');

    list.querySelectorAll('.btn-remove').forEach(btn => {
        btn.addEventListener('click', () => removeKid(btn.dataset.name));
    });

    document.getElementById('add-kid-btn').disabled = profiles.length >= 3;
}

function removeKid(name) {
    if (!confirm(`Remove ${name}'s profile from this device?`)) return;
    AUTH.removeKidProfile(name);
    renderKidList();
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

function wireModalPickers() {
    document.querySelectorAll('.grade-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.grade-opt').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            modalGrade = btn.dataset.grade;
        });
    });

    document.querySelectorAll('.gender-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.gender-opt').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            modalGender = btn.dataset.gender;
        });
    });

    document.querySelectorAll('.chinese-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.chinese-opt').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            modalChineseLevel = btn.dataset.chinese;
        });
    });

    document.querySelectorAll('.avatar-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.avatar-opt').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            modalAvatarId = btn.dataset.avatarId;
        });
    });
}

function openModal() {
    modalGrade        = '';
    modalAvatarId     = 'star';
    modalGender       = '';
    modalChineseLevel = 'CL';

    document.getElementById('modal-name').value = '';
    document.getElementById('modal-school').value = '';
    document.getElementById('modal-error').style.display = 'none';

    buildModalPickers();
    applyParentModalI18n();

    document.querySelectorAll('.grade-opt').forEach(b => b.classList.remove('selected'));
    document.querySelectorAll('.gender-opt').forEach(b => b.classList.remove('selected'));
    document.querySelectorAll('.chinese-opt').forEach(b => b.classList.remove('selected'));
    document.querySelectorAll('.avatar-opt').forEach((b, i) => {
        b.classList.toggle('selected', ProfileCatalog.AVATARS[i].id === 'star');
    });

    wireModalPickers();
    document.getElementById('add-modal').classList.add('open');
    setTimeout(() => document.getElementById('modal-name').focus(), 100);
}

function closeModal() {
    document.getElementById('add-modal').classList.remove('open');
}

function saveProfile() {
    const name = document.getElementById('modal-name').value.trim();
    const school = document.getElementById('modal-school').value.trim();

    if (name.length < 2) { showModalError('Name must be at least 2 characters.'); return; }
    if (!modalGrade)     { showModalError('Please select a grade.'); return; }
    if (!modalGender)    { showModalError('Please select gender.'); return; }
    if (!modalChineseLevel) { showModalError('Please select Chinese subject.'); return; }
    if (!modalAvatarId)  { showModalError('Please pick an avatar.'); return; }

    const ok = AUTH.addKidProfile({
        name,
        grade: modalGrade,
        avatarId: modalAvatarId,
        gender: modalGender,
        schoolName: school,
        chineseLevel: modalChineseLevel,
    });

    if (!ok) {
        const profiles = AUTH.getKidProfiles();
        showModalError(profiles.length >= 3
            ? 'Maximum 3 profiles per device.'
            : `A profile named "${name}" already exists.`);
        return;
    }

    closeModal();
    renderKidList();
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
    const session = await AUTH.getParentSession();
    if (!session) { window.location.href = 'index.html'; return; }
    if (!AUTH.isPinVerified()) { window.location.href = 'pin.html'; return; }

    const displayName = session.user.user_metadata?.display_name
        || session.user.email?.split('@')[0]
        || 'Parent';
    document.getElementById('parent-name').textContent = `👋 Hi, ${displayName}!`;

    renderKidList();

    document.getElementById('add-kid-btn').addEventListener('click', openModal);
    document.getElementById('modal-save-btn').addEventListener('click', saveProfile);
    document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);

    document.getElementById('add-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('add-modal')) closeModal();
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
