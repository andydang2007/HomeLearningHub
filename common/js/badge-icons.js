/**
 * Badge image paths under /assets/images/badges/
 * Filenames match badge_definitions.badge_code (snake_case).
 * All streak_* tiers share streakcrystal.png.
 */
(function (global) {
    const BASE = '/assets/images/badges/';
    const STREAK_FILE = 'streakcrystal.png';

    function getBadgeIconSrc(badgeCode) {
        if (!badgeCode || typeof badgeCode !== 'string') return null;
        if (badgeCode === 'max_streak' || badgeCode.startsWith('streak_')) {
            return BASE + STREAK_FILE;
        }
        return BASE + badgeCode + '.png';
    }

  /** Inner HTML for a badge icon cell (image with emoji fallback). */
    function renderBadgeIconContent(badgeCode, fallbackIcon) {
        const fb = fallbackIcon || '🏅';
        const src = getBadgeIconSrc(badgeCode);
        if (!src) return fb;
        const safeFb = String(fb)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        return (
            `<img class="badge-icon-img" src="${src}" alt="" loading="lazy" ` +
            `onerror="this.style.display='none';var n=this.nextElementSibling;if(n)n.style.display='flex'">` +
            `<span class="badge-icon-fallback" style="display:none">${safeFb}</span>`
        );
    }

    /** English badge labels: fixed two-line breaks (line 1 / line 2). */
    const EN_BADGE_LINES = {
        english_star: ['English', 'Star'],
        math_genius: ['Math', 'Genius'],
        science_pro: ['Science', 'Pro'],
        chinese_ace: ['Chinese', 'Ace'],
        pinyin_pro: ['Pinyin', 'Hero'],
        dictation_king: ['Dictation', 'King'],
        character_spirit: ['Character', 'Spirit'],
        sharpshooter: ['Sharp', 'shooter'],
        speed_record: ['Speed', 'Record'],
        unlock_game: ['Unlock', 'Game'],
        early_bird: ['Early', 'Bird'],
        night_owl: ['Night', 'Owl'],
        hat_trick: ['Hat', 'trick'],
        weekend_maniac: ['Weekend', 'Maniac'],
        holiday_charge: ['Holiday', 'Charge'],
        streak_3: ['3-Day', 'Streak'],
        streak_5: ['5-Day', 'Streak'],
        streak_10: ['10-Day', 'Streak'],
        streak_15: ['15-Day', 'Streak'],
        streak_30: ['30-Day', 'Streak'],
        max_streak: ['Best', 'Streak'],
    };

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function splitEnglishBadgeName(name, badgeCode) {
        if (badgeCode && EN_BADGE_LINES[badgeCode]) {
            return EN_BADGE_LINES[badgeCode];
        }
        const n = String(name || '').trim();
        if (!n) return ['', ''];

        const dayStreak = n.match(/^(\d+-Day)\s+(.+)$/i);
        if (dayStreak) return [dayStreak[1], dayStreak[2]];

        if (/^best\s+streak$/i.test(n)) return ['Best', 'Streak'];

        const streakNd = n.match(/^streak\s+(\d+d?)$/i);
        if (streakNd) return ['Streak', streakNd[1]];

        const hatTrick = n.match(/^hat-?trick!?$/i);
        if (hatTrick) return ['Hat', 'trick'];

        const space = n.indexOf(' ');
        if (space > 0) {
            return [n.slice(0, space), n.slice(space + 1).trim()];
        }

        const mid = Math.ceil(n.length / 2);
        return [n.slice(0, mid), n.slice(mid)];
    }

    /** Badge title HTML: English → two lines; Chinese → single line. */
    function formatBadgeNameHtml(name, lang, badgeCode) {
        if (lang === 'zh') return escapeHtml(name);
        const lines = splitEnglishBadgeName(name, badgeCode);
        return lines.map(escapeHtml).join('<br>');
    }

    global.BadgeIcons = {
        BASE,
        STREAK_FILE,
        EN_BADGE_LINES,
        getBadgeIconSrc,
        renderBadgeIconContent,
        formatBadgeNameHtml,
        splitEnglishBadgeName,
    };
})(typeof window !== 'undefined' ? window : globalThis);
