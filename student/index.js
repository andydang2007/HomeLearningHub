document.addEventListener('DOMContentLoaded', () => {
    // Use AppI18n methods directly — avoid destructuring, which loses `this` context.
    const curUser  = localStorage.getItem('currentPlayer') || 'Student';
    const curGrade = localStorage.getItem('currentGrade')  || 'P3';

    // ── Render static translations ────────────────────────────────────────
    AppI18n.applyTranslations();

    // ── Populate dynamic values ───────────────────────────────────────────
    document.getElementById('player-badge').textContent =
        `🌟 ${curUser} · ${curGrade}`;
    document.getElementById('crystal-count').textContent =
        localStorage.getItem(`crystals_${curUser}`) || '0';
    document.getElementById('coin-count').textContent =
        localStorage.getItem('gold_coins_vault') || '0';

    const streak    = localStorage.getItem(`current_streak_${curUser}`) || 0;
    const totalDays = localStorage.getItem(`total_days_${curUser}`) || 0;
    document.getElementById('streak-info').textContent     = AppI18n.t('index.streak', { n: streak });
    document.getElementById('total-days-info').textContent = AppI18n.t('index.total',  { n: totalDays });

    // ── Language toggle ───────────────────────────────────────────────────
    const langBtn = document.getElementById('lang-toggle');
    langBtn.textContent = AppI18n.t('lang.toggle');

    langBtn.addEventListener('click', () => {
        const next = AppI18n.getLang() === 'en' ? 'zh' : 'en';
        AppI18n.setLang(next);
        AppI18n.applyTranslations();

        langBtn.textContent = AppI18n.t('lang.toggle');
        document.getElementById('streak-info').textContent     = AppI18n.t('index.streak', { n: streak });
        document.getElementById('total-days-info').textContent = AppI18n.t('index.total',  { n: totalDays });
    });

    // ── Subject navigation ────────────────────────────────────────────────
    document.getElementById('subject-grid').addEventListener('click', (e) => {
        const card = e.target.closest('.subject-card');
        if (!card) return;
        localStorage.setItem('currentSubject', card.dataset.subject);
        window.location.href = 'practice.html';
    });
});
