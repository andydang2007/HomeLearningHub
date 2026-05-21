/**
 * common/js/profile-catalog.js
 * Shared kid profile options: avatars, Chinese stream, labels.
 * Avatar id is stable; emoji is display-only (custom upload later uses avatar_url).
 */

window.ProfileCatalog = {
    AVATARS: [
        { id: 'star',        emoji: '🌟' },
        { id: 'girl_blonde', emoji: '👱‍♀️' },
        { id: 'girl',        emoji: '👧' },
        { id: 'boy',         emoji: '👦' },
        { id: 'child',       emoji: '🧒' },
        { id: 'panda',       emoji: '🐼' },
        { id: 'koala',       emoji: '🐨' },
        { id: 'fox',         emoji: '🦊' },
        { id: 'frog',        emoji: '🐸' },
        { id: 'rocket',      emoji: '🚀' },
        { id: 'soccer',      emoji: '⚽' },
        { id: 'unicorn',     emoji: '🦄' },
    ],

    /** CL = 华文, HCL = 高级华文 (Foundation = FCL, Phase B) */
    CHINESE_LEVELS: [
        { id: 'CL',  labelEn: 'Chinese',        labelZh: '华文' },
        { id: 'HCL', labelEn: 'Higher Chinese', labelZh: '高级华文' },
    ],

    emojiForId(id) {
        const a = this.AVATARS.find((x) => x.id === id);
        return a ? a.emoji : '🌟';
    },

    resolveAvatarId(emojiOrId) {
        if (!emojiOrId) return 'star';
        if (this.AVATARS.some((x) => x.id === emojiOrId)) return emojiOrId;
        const byEmoji = this.AVATARS.find((x) => x.emoji === emojiOrId);
        return byEmoji ? byEmoji.id : 'star';
    },

    chineseLabel(id, lang) {
        const row = this.CHINESE_LEVELS.find((x) => x.id === id);
        if (!row) return id || '';
        return lang === 'zh' ? row.labelZh : row.labelEn;
    },

    genderLabel(code, lang) {
        if (code === 'M') return lang === 'zh' ? '男孩' : 'Boy';
        if (code === 'F') return lang === 'zh' ? '女孩' : 'Girl';
        return '';
    },
};
