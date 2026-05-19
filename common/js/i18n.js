// ─────────────────────────────────────────────────────────────────────────────
// i18n Module
// Supports: 'en' (default) | 'zh'
// Usage:
//   AppI18n.t('key')                  — translate a key
//   AppI18n.t('key', { n: 5 })        — translate with variable substitution
//   AppI18n.setLang('zh')             — persist language choice
//   AppI18n.getLang()                 — read current language
//   AppI18n.applyTranslations()       — update all [data-i18n] nodes in DOM
// ─────────────────────────────────────────────────────────────────────────────

const DICT = {
    en: {
        // ── Index ──────────────────────────────────────────────────────────
        'index.title':          'What to practice today?',
        'index.streak':         '🔥 {n}-day streak',
        'index.total':          '📅 {n} days total',
        'lang.toggle':          '中文',

        // ── Practice — static DOM ──────────────────────────────────────────
        'practice.loading':     '🌟 Building your quiz...',
        'practice.open_pad':    '✍️ Open Scratchpad',
        'practice.clear_pad':   '🗑️ Clear',
        'practice.close_pad':   '❌ Close',
        'practice.badge_cloud': '☁️ Achievement saved to the Honor Wall...',
        'practice.exit':        'Exit 🏠',
        'practice.submit':      'Submit',
        'practice.next':        'Next ➡️',
        'practice.finish':      'Finish ✨',
        'practice.awesome':     'Awesome! 🚀',

        // ── Practice — dynamic strings ─────────────────────────────────────
        'practice.placeholder_open':  'Type full answer...',
        'practice.placeholder_text':  'Type here...',
        'practice.select_option':     'Please select an option!',
        'practice.correct':           '✅ Correct!',
        'practice.wrong':             '❌ Wrong!',
        'practice.answer_label':      'Answer:',
        'practice.ref_answer':        'Reference Answer:',
        'practice.hint_label':        'Hint:',
        'practice.daily_done_title':  "Today's [{subject}] is done!",
        'practice.daily_done_desc':   'One session per day keeps quality high.\nCome back tomorrow!',
        'practice.back_home':         'Return Home',
        'practice.net_slow':          '⚠️ Network slow, please retry.',
        'practice.no_questions':      '⚠️ No questions available.',
        'practice.data_error':        '⚠️ Data load failed.',
        'practice.finish_perfect':    '🎉 You got 6~7!',
        'practice.finish_retry':      '💪 Keep trying!',
        'practice.mistakes_notice':   '🐞 {count} mistake(s) added to your review journal.',

        // ── Badges ─────────────────────────────────────────────────────────
        'badge.subject_cn':          'Chinese Ace',
        'badge.subject_cn_desc':     'High quality practice! +2 gold coins!',
        'badge.subject_other_desc':  'Good job! Badge +1!',
        'badge.sharpshooter':        'Sharpshooter!',
        'badge.sharpshooter_desc':   'Great accuracy! Sharpshooter badge +1!',
        'badge.speed':               'Speed Record!',
        'badge.speed_desc':          'Finished in <span class="epic-highlight">{sec}s</span>! Lightning fast!',
        'badge.balloon':             'Balloon Hunter!',
        'badge.balloon_desc_perfect':'🎉 Perfect score! Balloon Battle unlocked! 🎈',
        'badge.balloon_desc_streak': '🎉 2 quality sessions! Balloon Battle unlocked! 🎈',
        'badge.balloon_desc_almost': '🔥 Great work! One more session to unlock Balloon Battle!',
        'badge.hattrick':            'Hat-trick!',
        'badge.hattrick_desc':       '3 perfect scores in a row! On fire!',
        'badge.crystal':             'Crystal',
        'badge.crystal_desc':        'Streak {n} days! Crystal +1!',
        'badge.earlybird':           'Early Bird!',
        'badge.earlybird_desc':      'The early bird catches the worm!',
        'badge.nightowl':            'Night Owl!',
        'badge.nightowl_desc':       'Studying late! Time to rest soon!',
        'badge.holiday':             'Holiday Charge!',
        'badge.holiday_desc':        'Learning during holidays! Awesome!',
        'badge.weekend':             'Weekend Maniac!',
        'badge.weekend_desc':        '10 badges this weekend! Amazing!',

        // ── Shop ───────────────────────────────────────────────────────────
        'shop.title':               '🎁 Reward Center',
        'shop.gold_label':          'Team Gold',
        'shop.crystal_label':       'Personal Crystals',
        'shop.tab_crystal':         '💎 Crystal Exchange',
        'shop.tab_gold':            '🪙 Gold Exchange',
        'shop.panel_crystal_desc':  'Redeem sweet treats with your daily check-in crystals!',
        'shop.panel_gold_desc':     'Unlock big meal rewards with your hard-earned gold!',
        'shop.backpack_btn':        '📦 My Backpack',
        'shop.confirm_btn':         '✅ Confirm Redeem',
        'shop.home_btn':            '← Back Home',
        'shop.success_title':       'Request Submitted!',
        'shop.success_sub':         'Awaiting parent approval to take effect.',
        'shop.got_it':              'Got it! 🎉',
        'shop.backpack_title':      'My Backpack',
        'shop.backpack_close':      'Close',
        'shop.backpack_empty':      "Your backpack is empty!\nEarn coins and crystals to redeem rewards~",
        'shop.balance_low':         'Not enough {currency}! You need {diff} more. Keep going!',
        'shop.confirm_dialog':      'Use {cost} {currency} to redeem [{name}]?\n\nRequest will take effect after parent approval.',
        'shop.submitting':          '⏳ Submitting...',
        'shop.exchange_fail':       '❌ Exchange failed: {error}',
        'shop.net_error':           '❌ Network error, please try again.',
        'shop.refund_confirm':      'Cancel redemption of [{name}]?\nBalance will be refunded after backend goes live.',
        'shop.refund_done':         '✅ Cancellation recorded. Balance will be refunded once backend RPC is live.',
        'shop.item_value':          'Value: {cost} {currency}',
        'shop.cancel_btn':          '❌ Cancel & Refund {currency}',
        'shop.redeemed_badge':      '×{count}',
        'shop.gold_currency':       'Gold',
        'shop.crystal_currency':    'Crystals',
    },

    zh: {
        // ── Index ──────────────────────────────────────────────────────────
        'index.title':          '今天练什么？',
        'index.streak':         '🔥 连续打卡 {n} 天',
        'index.total':          '📅 累计 {n} 天',
        'lang.toggle':          'English',

        // ── Practice — static DOM ──────────────────────────────────────────
        'practice.loading':     '🌟 魔法书正在组卷...',
        'practice.open_pad':    '✍️ 打开草稿板',
        'practice.clear_pad':   '🗑️ 清除',
        'practice.close_pad':   '❌ 关闭',
        'practice.badge_cloud': '☁️ 荣誉已存入云端荣誉墙...',
        'practice.exit':        '退出 🏠',
        'practice.submit':      '提交',
        'practice.next':        '下一题 ➡️',
        'practice.finish':      '完成 ✨',
        'practice.awesome':     'Awesome! 🚀',

        // ── Practice — dynamic strings ─────────────────────────────────────
        'practice.placeholder_open':  '输入你的完整答案...',
        'practice.placeholder_text':  '在此输入...',
        'practice.select_option':     '请选择一个选项！',
        'practice.correct':           '✅ 答对啦！',
        'practice.wrong':             '❌ 不对哦！',
        'practice.answer_label':      '答案：',
        'practice.ref_answer':        '参考答案：',
        'practice.hint_label':        'Hint:',
        'practice.daily_done_title':  '今日【{subject}】已达标！',
        'practice.daily_done_desc':   '每天只做一次，保证最高质量。\n明天再来挑战吧！',
        'practice.back_home':         '返回主页',
        'practice.net_slow':          '⚠️ 网络慢，请重试。',
        'practice.no_questions':      '⚠️ 没有可用练习题。',
        'practice.data_error':        '⚠️ 题库加载失败。',
        'practice.finish_perfect':    '🎉 获得了 6~7！',
        'practice.finish_retry':      '💪 挑战完成！',
        'practice.mistakes_notice':   '🐞 已将 {count} 道错题关进捉虫日记。',

        // ── Badges ─────────────────────────────────────────────────────────
        'badge.subject_cn':          '华文小将',
        'badge.subject_cn_desc':     '完成高质量练习，金币 +2！',
        'badge.subject_other_desc':  'Good job! Badge +1!',
        'badge.sharpshooter':        '神奇射手！',
        'badge.sharpshooter_desc':   '错题在1道以内，神奇射手徽章 +1！',
        'badge.speed':               '极速突破！',
        'badge.speed_desc':          '仅用 <span class="epic-highlight">{sec}秒</span>！闪电般的速度！',
        'badge.balloon':             '气球猎人！',
        'badge.balloon_desc_perfect':'🎉 满分达成！直接奖励气球大作战！🎈',
        'badge.balloon_desc_streak': '🎉 累计两次高质量完成！解锁气球大作战！🎈',
        'badge.balloon_desc_almost': '🔥 表现不错！再获得一次 6~7 就能玩气球啦！',
        'badge.hattrick':            '全对三连！',
        'badge.hattrick_desc':       '连续 3 次完美通关！手感火热！',
        'badge.crystal':             '毅力水晶',
        'badge.crystal_desc':        '连续打卡 {n} 天，水晶 +1！',
        'badge.earlybird':           '早起鸟儿！',
        'badge.earlybird_desc':      '一日之计在于晨！真棒！',
        'badge.nightowl':            '小猫头鹰！',
        'badge.nightowl_desc':       '夜深了，做完赶紧休息哦！',
        'badge.holiday':             '假期充电！',
        'badge.holiday_desc':        '假期也不忘学习，给你点赞！',
        'badge.weekend':             '周末狂人！',
        'badge.weekend_desc':        '本周末狂揽 10 个徽章！太肝了！',

        // ── Shop ───────────────────────────────────────────────────────────
        'shop.title':               '🎁 神秘兑换中心',
        'shop.gold_label':          '团队金币',
        'shop.crystal_label':       '个人水晶',
        'shop.tab_crystal':         '💎 水晶兑换区',
        'shop.tab_gold':            '🪙 金币兑换区',
        'shop.panel_crystal_desc':  '用每日打卡积累的水晶，兑换小甜品奖励！',
        'shop.panel_gold_desc':     '凭借高质量练习赚取的金币，解锁大餐级奖励！',
        'shop.backpack_btn':        '📦 我的背包',
        'shop.confirm_btn':         '✅ 确认兑换',
        'shop.home_btn':            '← 返回主页',
        'shop.success_title':       '申请已提交！',
        'shop.success_sub':         '兑换请求已发送，等待家长确认后生效。',
        'shop.got_it':              '我知道了！',
        'shop.backpack_title':      '我的背包',
        'shop.backpack_close':      '关闭',
        'shop.backpack_empty':      '哎呀，背包空空如也！\n快去赚金币和水晶兑换奖励吧~',
        'shop.balance_low':         '余额不足！你的{currency}还差 {diff} 个，继续努力哦！',
        'shop.confirm_dialog':      '确定要用 {cost} {currency} 兑换【{name}】吗？\n\n兑换申请将等待家长确认后正式生效。',
        'shop.submitting':          '⏳ 提交中...',
        'shop.exchange_fail':       '❌ 兑换失败：{error}',
        'shop.net_error':           '❌ 网络错误，请稍后重试。',
        'shop.refund_confirm':      '确定要撤销【{name}】的兑换申请吗？\n该功能在后端上线后将自动退还 {cost} {currency}。',
        'shop.refund_done':         '✅ 撤销申请已记录。实际余额退还将在后端 RPC 上线后生效。',
        'shop.item_value':          '价值 {cost} {currency}',
        'shop.cancel_btn':          '❌ 撤销并退回 {currency}',
        'shop.redeemed_badge':      '已存 {count}',
        'shop.gold_currency':       '金币',
        'shop.crystal_currency':    '水晶',
    },
};

// ── Public API (exposed as window.AppI18n) ───────────────────────────────────
window.AppI18n = {
    getLang() {
        return localStorage.getItem('app_lang') || 'en';
    },

    setLang(lang) {
        localStorage.setItem('app_lang', lang);
    },

    /**
     * Translate a key with optional variable substitution.
     * Variables in the dict string are wrapped in {curly braces}.
     * @param {string} key
     * @param {Object} vars  e.g. { n: 5, subject: 'Math' }
     * @returns {string}
     */
    t(key, vars = {}) {
        const lang = this.getLang();
        let str = (DICT[lang] && DICT[lang][key]) ?? (DICT['en'][key] ?? key);
        Object.entries(vars).forEach(([k, v]) => {
            str = str.replaceAll(`{${k}}`, v);
        });
        return str;
    },

    /**
     * Walk the DOM and update every element that has a [data-i18n] attribute.
     * Supports optional [data-i18n-vars] as a JSON string for substitutions.
     */
    applyTranslations() {
        const self = this;
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key  = el.dataset.i18n;
            const vars = el.dataset.i18nVars ? JSON.parse(el.dataset.i18nVars) : {};
            el.textContent = self.t(key, vars);
        });
    },
};
