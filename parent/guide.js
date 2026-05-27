// parent/guide.js — parent guide page (EN / ZH toggle via AppI18n)

function guideDict() {
    const lang = AppI18n.getLang();
    return window.GUIDE_I18N[lang] || window.GUIDE_I18N.en;
}

function applyGuideTranslations() {
    const dict = guideDict();
    const lang = AppI18n.getLang();
    document.documentElement.lang = lang === 'zh' ? 'zh' : 'en';
    document.title = dict['guide.doc_title'] || document.title;

    document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.dataset.i18n;
        const text = dict[key] ?? window.GUIDE_I18N.en[key];
        if (text) el.textContent = text;
    });

    const langBtn = document.getElementById('lang-toggle');
    if (langBtn) langBtn.textContent = AppI18n.t('lang.toggle');
}

function scrollToHash() {
    const id = (window.location.hash || '').replace(/^#/, '');
    if (!id) return;
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('from') === 'hub') {
        const back = document.getElementById('guide-back-link');
        if (back) {
            back.href = '../student/index.html';
            back.dataset.i18n = 'guide.back_hub';
        }
    }

    applyGuideTranslations();
    scrollToHash();

    document.getElementById('lang-toggle')?.addEventListener('click', () => {
        const next = AppI18n.getLang() === 'zh' ? 'en' : 'zh';
        AppI18n.setLang(next);
        applyGuideTranslations();
    });
});
