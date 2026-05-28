// ─────────────────────────────────────────────
// Practice Module — Front-end State Machine
// Algorithm: Dynamic A-B-C question selection
//   A (mistakes): count>30 → 5q, else → 3q  (weighted random)
//   B (lower grade review): fixed 2q
//   C (new questions): 15 - A - B
// ─────────────────────────────────────────────



// ── Supabase question table schema map ────────────────────────────────────────
// Adjust these keys to match your actual Supabase column names.
const Q_SCHEMA = {
    questionText:  'question_text',   // the question prompt shown to the student
    correctAnswer: 'correct_answer',  // expected answer string
    questionType:  'question_type',   // 'TEXT' | 'MCQ' | 'OPEN' | 'SPELLING'
    options:       'options',         // '|'-separated MCQ option string
    grade:         'grade',           // e.g. 'P3'
    subject:       'subject',         // e.g. 'English'
    term:          'term',            // numeric term (1-4), nullable
};

// Maximum questions fetched per query — safety cap; full pool needed for A-B-C.
const QUESTION_FETCH_LIMIT = 500;

const TOTAL_QUESTIONS   = 15;
const MISTAKE_QUOTA_HI  = 5;
const MISTAKE_QUOTA_LO  = 3;
const MISTAKE_THRESHOLD = 30;
const REVIEW_QUOTA      = 2;
const INITIAL_WEIGHT    = 3;
const MAX_WEIGHT        = 8;

// ── Shorthand for i18n ────────────────────────
const t = (key, vars) => AppI18n.t(key, vars);

// ── Session State ─────────────────────────────
let sessionQs      = [];
let curIdx         = 0;
let sessionErrors  = 0;
let startTime      = 0;
let currentTermNum = 1;
let badgeQueue     = [];
let pendingGameResult = null;

let canvas, ctx, isDrawing = false;

const curUser  = localStorage.getItem('currentPlayer')  || 'Student';
const curGrade = localStorage.getItem('currentGrade')   || 'P3';
const curSub   = localStorage.getItem('currentSubject') || 'English';

// ── Helpers ───────────────────────────────────
function getSGTDateString() {
    const d   = new Date();
    const sgt = new Date(d.getTime() + (d.getTimezoneOffset() + 480) * 60000);
    return `${sgt.getFullYear()}-${String(sgt.getMonth() + 1).padStart(2, '0')}-${String(sgt.getDate()).padStart(2, '0')}`;
}

function getMistakes() {
    try { return JSON.parse(localStorage.getItem('hub_mistakes') || '{}'); } catch { return {}; }
}

function saveMistakes(m) {
    localStorage.setItem('hub_mistakes', JSON.stringify(m));
}

function getMistakeKey(sub, user, question) {
    return `${user}_${sub}_${question.trim()}`;
}

function normaliseMistakeEntry(raw) {
    if (!raw) return { weight: 0, wrongs: [] };
    if (typeof raw === 'number') return { weight: raw, wrongs: [] };
    return { weight: raw.weight ?? 0, wrongs: raw.wrongs ?? [] };
}

// TODO (Phase 5): Replace syncToCloud stubs with Supabase audit_logs inserts.

// ── Screen Management ─────────────────────────
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('is-active');
        s.style.display = '';
    });
    const target = document.getElementById(id);
    target.classList.add('is-active');
    target.style.display = 'flex';
    AppI18n.applyTranslations();
}

// ── A-B-C Sampling Algorithm ──────────────────
function weightedSample(pool, count) {
    const result    = [];
    const remaining = [...pool];

    while (result.length < count && remaining.length > 0) {
        const totalWeight = remaining.reduce((sum, item) => sum + Math.max(1, item.weight), 0);
        let rand   = Math.random() * totalWeight;
        let chosen = remaining[remaining.length - 1];
        for (const item of remaining) {
            rand -= Math.max(1, item.weight);
            if (rand <= 0) { chosen = item; break; }
        }
        result.push(chosen.q);
        remaining.splice(remaining.indexOf(chosen), 1);
    }
    return result;
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function buildSession(mainPool, lowerPool) {
    const mistakes         = getMistakes();
    const eligibleMistakes = [];
    const freshPool        = [];

    mainPool.forEach(q => {
        const key  = getMistakeKey(curSub, curUser, q.Question);
        const data = normaliseMistakeEntry(mistakes[key]);
        if (data.weight > 0) eligibleMistakes.push({ q, weight: data.weight });
        else freshPool.push(q);
    });

    const mistakeQuota = eligibleMistakes.length > MISTAKE_THRESHOLD ? MISTAKE_QUOTA_HI : MISTAKE_QUOTA_LO;
    const mistakePick  = weightedSample(eligibleMistakes, Math.min(mistakeQuota, eligibleMistakes.length));
    const reviewPick   = shuffle(lowerPool).slice(0, REVIEW_QUOTA);
    const newQuota     = TOTAL_QUESTIONS - mistakePick.length - reviewPick.length;
    const newPick      = shuffle(freshPool).slice(0, newQuota);

    return shuffle([...mistakePick, ...reviewPick, ...newPick]);
}

// ── Term Detection ────────────────────────────
function detectCurrentTerm() {
    const now = new Date();
    if (now >= new Date(2026, 8, 14)) return 4;
    if (now >= new Date(2026, 5, 29)) return 3;
    if (now >= new Date(2026, 2, 23)) return 2;
    return 1;
}

// ── Supabase Data Layer ───────────────────────────────────────────────────────

/**
 * Normalise a raw Supabase question row into the shape the rendering
 * logic expects. Adjust Q_SCHEMA keys at the top of this file to match
 * your actual Supabase column names.
 */
function normaliseQuestion(row) {
    return {
        Question:         row[Q_SCHEMA.questionText]  ?? '',
        'Correct Answer': row[Q_SCHEMA.correctAnswer] ?? '',
        Type:             (row[Q_SCHEMA.questionType] ?? 'TEXT').toUpperCase(),
        Options:          row[Q_SCHEMA.options]        ?? '',
        Grade:            row[Q_SCHEMA.grade]          ?? '',
        Term:             row[Q_SCHEMA.term]           ?? null,
        _id:              row.id,
    };
}

/**
 * Fetch the full question pool for a given subject + grade.
 * Results are cached in sessionStorage to avoid redundant round-trips
 * within the same browser session.
 *
 * @param {string} subject  e.g. 'English'
 * @param {string} grade    e.g. 'P3'
 * @returns {Promise<Array>} normalised question objects
 */
async function fetchQuestions(subject, grade) {
    const cacheKey = `q_cache_${subject}_${grade}`;
    const cached   = sessionStorage.getItem(cacheKey);
    if (cached) {
        try { return JSON.parse(cached); } catch { sessionStorage.removeItem(cacheKey); }
    }

    const { data, error } = await SupabaseClient
        .from('questions')
        .select('*')
        .eq(Q_SCHEMA.subject, subject)
        .eq(Q_SCHEMA.grade,   grade)
        .limit(QUESTION_FETCH_LIMIT);


    if (error) throw new Error(`Question fetch failed (${subject} ${grade}): ${error.message}`);

    const questions = (data || []).map(normaliseQuestion);
    // Only cache non-empty results — prevents a stale [] from blocking future fetches
    if (questions.length > 0) sessionStorage.setItem(cacheKey, JSON.stringify(questions));
    return questions;
}

// ── Initialisation ────────────────────────────
async function init() {
    const subjectIcon = { '华文': '🐼', 'Science': '🌱', 'Math': '🔢' };
    const icon = subjectIcon[curSub] || '🚀';
    document.getElementById('header-info').textContent = `${icon} ${curUser} - ${curSub}`;

    // Daily practice limit check — must run before anything async
    const today    = getSGTDateString();
    const limitKey = `limit_${today}_${curUser}_${curSub}`;
    if (parseInt(localStorage.getItem(limitKey) || '0') >= 1) {
        document.getElementById('screen-loading').innerHTML = `
            <div style="padding:20px; text-align:center;">
                <div style="font-size:60px; margin-bottom:15px;">🏆</div>
                <h2 style="color:#1e293b; margin:0 0 10px; font-size:24px;">${t('practice.daily_done_title', { subject: curSub })}</h2>
                <p style="color:#64748b; font-weight:800; font-size:14px; margin-bottom:25px; white-space:pre-line;">${t('practice.daily_done_desc')}</p>
                <button class="btn-action btn-action--submit" style="max-width:200px; margin:0 auto;" onclick="window.location.href='index.html'">${t('practice.back_home')}</button>
            </div>`;
        return;
    }

    currentTermNum = detectCurrentTerm();

    // TODO (Phase 5): Fetch user stats (streak, crystals, coins) from Supabase profiles.

    // ── Fetch question pools from Supabase ────────────────────────────────
    const lowerGradeMap = { P3: 'P2', P2: 'P1' };
    const lowerGrade    = lowerGradeMap[curGrade];

    let mainPool, lowerPool;
    try {
        [mainPool, lowerPool] = await Promise.all([
            fetchQuestions(curSub, curGrade),
            lowerGrade ? fetchQuestions(curSub, lowerGrade) : Promise.resolve([]),
        ]);
    } catch (err) {
        console.error('[Practice] Question fetch failed:', err);
        document.getElementById('screen-loading').innerHTML =
            `<p style="color:#ef4444; font-weight:900;">${t('practice.data_error')}</p>`;
        return;
    }

    if (mainPool.length === 0) {
        document.getElementById('screen-loading').innerHTML =
            `<p style="color:#ef4444; font-weight:900;">${t('practice.no_questions')}</p>`;
        setTimeout(() => { window.location.href = 'index.html'; }, 2000);
        return;
    }

    startQuiz(mainPool, lowerPool);
}

// ── Start Quiz ────────────────────────────────
/**
 * @param {Array} mainPool   — full question list for current grade/subject
 * @param {Array} lowerPool  — full question list for one grade below
 */
function startQuiz(mainPool, lowerPool = []) {
    const isSpelling    = q => (q.Type || '').toString().trim() === 'SPELLING';
    const inCurrentTerm = q => {
        const tNum = parseInt(String(q.Term ?? '').replace(/\D/g, ''));
        return isNaN(tNum) || tNum <= currentTermNum;
    };

    const filteredMain  = mainPool.filter(q => !isSpelling(q) && inCurrentTerm(q));
    const filteredLower = lowerPool.filter(q => !isSpelling(q));

    if (filteredMain.length === 0) {
        document.getElementById('screen-loading').innerHTML =
            `<p style="color:#ef4444; font-weight:900;">${t('practice.no_questions')}</p>`;
        setTimeout(() => { window.location.href = 'index.html'; }, 2000);
        return;
    }

    localStorage.setItem(`limit_${getSGTDateString()}_${curUser}_${curSub}`, '1');

    sessionQs     = buildSession(filteredMain, filteredLower);
    curIdx        = 0;
    sessionErrors = 0;
    startTime     = Date.now();

    const drawBtn = document.getElementById('draw-pad-btn');
    if (curGrade === 'P3' && curSub === 'Math') drawBtn.classList.remove('is-hidden');
    else drawBtn.classList.add('is-hidden');

    showScreen('screen-quiz');
    renderQuestion();
}

// ── Render Question ───────────────────────────
function renderQuestion() {
    updateProgress();
    if (ctx) clearPad();

    const q     = sessionQs[curIdx];
    const qType = (q.Type || '').toString().trim().toUpperCase();
    q.isEvaluated = false;

    document.getElementById('q-text').textContent = q.Question;

    const hintEl = document.getElementById('hint-text');
    if (curUser === 'Venessa' && qType !== 'MCQ') {
        const correct = (q['Correct Answer'] || q['ANSWER'] || '').toString().trim();
        const hintStr = correct.split('').map(c => /[a-zA-Z0-9\u4e00-\u9fa5]/.test(c) ? '_' : c).join(' ');
        hintEl.textContent = `${t('practice.hint_label')} ${hintStr}`;
    } else {
        hintEl.textContent = '';
    }

    const container = document.getElementById('input-container');
    if (qType === 'OPEN') {
        container.innerHTML = `<textarea id="ans-in" class="ans-input" rows="4" placeholder="${t('practice.placeholder_open')}"></textarea>`;
    } else if (qType === 'MCQ') {
        const opts = (q.Options || q.options || '').toString().split('|').map(o => o.trim()).filter(Boolean);
        container.innerHTML = `
            <div class="mcq-list" id="mcq-list">
                ${opts.map(opt => `<button class="mcq-btn" data-value="${opt.replace(/"/g, '&quot;')}">${opt}</button>`).join('')}
            </div>
            <input type="hidden" id="ans-in" value="">`;
        document.getElementById('mcq-list').addEventListener('click', handleMCQSelect);
    } else {
        container.innerHTML = `<input type="text" id="ans-in" class="ans-input" placeholder="${t('practice.placeholder_text')}" autocomplete="off">`;
    }

    document.getElementById('fb-text').innerHTML = '';
    setButtonState('question');

    const nextBtn = document.getElementById('next-btn');
    nextBtn.textContent = curIdx === sessionQs.length - 1 ? t('practice.finish') : t('practice.next');

    // Auto-focus the input so the student can type immediately without clicking
    requestAnimationFrame(() => {
        const input = document.getElementById('ans-in');
        if (input && input.type !== 'hidden') input.focus();
    });
}

function handleMCQSelect(e) {
    const btn = e.target.closest('.mcq-btn');
    if (!btn || document.getElementById('sub-btn').classList.contains('is-hidden')) return;
    document.querySelectorAll('.mcq-btn').forEach(b => b.classList.remove('is-active', 'is-error'));
    btn.classList.add('is-active');
    document.getElementById('ans-in').value = btn.dataset.value;
}

function updateProgress() {
    const icon = { '华文': '🐼', 'Science': '🌱', 'Math': '🔢' }[curSub] || '🚀';
    document.getElementById('progress-bar').innerHTML = sessionQs.map((_, i) => {
        const cls   = i < curIdx ? 'milestone is-done' : (i === curIdx ? 'milestone is-active' : 'milestone');
        const label = i < curIdx ? '⭐' : (i === curIdx ? icon : '☁️');
        return `<div class="${cls}">${label}</div>`;
    }).join('');
    document.getElementById('progress-text').textContent = `${curIdx + 1} / ${sessionQs.length}`;
}

function setButtonState(state) {
    const subBtn  = document.getElementById('sub-btn');
    const nextBtn = document.getElementById('next-btn');
    if (state === 'question') {
        subBtn.classList.remove('is-hidden');
        nextBtn.classList.add('is-hidden');
    } else {
        subBtn.classList.add('is-hidden');
        nextBtn.classList.remove('is-hidden');
    }
}

// ── Check Answer ──────────────────────────────
function checkAnswer() {
    const input   = document.getElementById('ans-in');
    const userAns = input.value.trim();
    const q       = sessionQs[curIdx];
    const qType   = (q.Type || '').toString().trim().toUpperCase();
    const correct = (q['Correct Answer'] || q['ANSWER'] || '').toString().trim();
    const fb      = document.getElementById('fb-text');

    if (!userAns) {
        if (qType === 'MCQ') alert(t('practice.select_option'));
        return;
    }

    if (qType === 'OPEN') {
        input.disabled = true;
        fb.innerHTML = `<span style="color:#0f172a;"><b>${t('practice.ref_answer')}</b></span><br>
                        <span style="font-size:20px;font-weight:900;color:#10b981;">${correct}</span>`;
        setButtonState('answered');
        return;
    }

    const isCorrect = userAns.toLowerCase() === correct.toLowerCase();
    const key       = getMistakeKey(curSub, curUser, q.Question);
    const mistakes  = getMistakes();
    let   mData     = normaliseMistakeEntry(mistakes[key]);

    if (isCorrect) {
        input.disabled = true;
        fb.innerHTML = `<span style="color:#10b981;">${t('practice.correct')}</span>`;
        setButtonState('answered');

        if (mistakes[key] && !q.isEvaluated) {
            mData.weight = Math.max(0, mData.weight - 1);
            if (mData.weight <= 0) delete mistakes[key];
            else mistakes[key] = mData;
            saveMistakes(mistakes);
        }
    } else {
        if (!q.isEvaluated) sessionErrors++;
        fb.innerHTML = `<span style="color:#ef4444;">${t('practice.wrong')}</span><br>
                        <span style="font-size:16px;color:#64748b;">${t('practice.answer_label')} <b style="color:#0f172a;">${correct}</b></span>`;

        if (qType === 'MCQ') {
            document.querySelectorAll('.mcq-btn').forEach(b => {
                if (b.classList.contains('is-active')) b.classList.add('is-error');
            });
        } else {
            input.classList.add('is-error');
            setTimeout(() => input.classList.remove('is-error'), 400);
        }

        if (!q.isEvaluated) {
            mData.weight = mistakes[key] ? Math.min(mData.weight + 1, MAX_WEIGHT) : INITIAL_WEIGHT;
            if (!mData.wrongs.includes(userAns)) mData.wrongs.push(userAns);
            mistakes[key] = mData;
            saveMistakes(mistakes);
        }
    }

    q.isEvaluated = true;
}

// ── Navigation ────────────────────────────────
function nextQuestion() {
    if (curIdx < sessionQs.length - 1) { curIdx++; renderQuestion(); }
    else finishQuiz();
}

// ── Balloon Game Logic ────────────────────────
function applyBalloonLogic(errors) {
    const today = getSGTDateString();
    const key   = `balloon_stats_${today}_${curUser}`;
    let stats   = JSON.parse(localStorage.getItem(key) || '{"goodCount":0,"date":""}');
    if (stats.date !== today) stats = { goodCount: 0, date: today };

    let trigger = false, descKey = '';
    if (errors <= 1) {
        stats.goodCount++;
        if (errors === 0)              { trigger = true;  descKey = 'badge.balloon_desc_perfect'; }
        else if (stats.goodCount % 2 === 0) { trigger = true;  descKey = 'badge.balloon_desc_streak'; }
        else                           { descKey = 'badge.balloon_desc_almost'; }
    }
    localStorage.setItem(key, JSON.stringify(stats));
    return { trigger, msg: t(descKey) };
}

// ── Finish Quiz ───────────────────────────────
function finishQuiz() {
    const timeTaken  = Math.floor((Date.now() - startTime) / 1000);
    const isPerfect  = sessionErrors <= 1;
    const today      = getSGTDateString();
    const config     = JSON.parse(localStorage.getItem('hub_config') || '{}');
    const speedLimit = (curGrade === 'P1' || curUser === 'Venessa')
        ? (config.speed_limit_p1 || 360)
        : (config.speed_limit_p3 || 180);

    badgeQueue = [];
    let earnedCoins = 0;

    const statsKey = `practice_stats_${today.replace(/-/g, '')}_${curUser}_${curSub}`;
    let localStats = JSON.parse(localStorage.getItem(statsKey) || '{"perfects":0,"gamesPlayed":0}');
    if (isPerfect) localStats.perfects++;
    localStorage.setItem(statsKey, JSON.stringify(localStats));

    // 1. Subject badge (≤3 errors)
    if (sessionErrors <= 3) {
        if (curSub === '华文') {
            earnedCoins += 2;
            badgeQueue.push({ badgeCode: 'chinese_ace', icon: '🐼', title: t('badge.subject_cn'), desc: t('badge.subject_cn_desc') });
        } else {
            earnedCoins++;
            const subBadge = {
                Science: { code: 'science_pro', icon: '🌱', name: 'Science Pro' },
                Math: { code: 'math_genius', icon: '🔢', name: 'Math Genius' },
                English: { code: 'english_star', icon: '🔤', name: 'English Star' },
            };
            const sub = subBadge[curSub] || { code: 'english_star', icon: '🔤', name: curSub };
            badgeQueue.push({ badgeCode: sub.code, icon: sub.icon, title: sub.name, desc: t('badge.subject_other_desc') });
        }
    }

    if (isPerfect) {
        // 2. Sharpshooter
        earnedCoins++;
        badgeQueue.push({ badgeCode: 'sharpshooter', icon: '🎯', title: t('badge.sharpshooter'), desc: t('badge.sharpshooter_desc') });

        // 3. Speed Record
        if (timeTaken <= speedLimit) {
            earnedCoins++;
            const breaks = parseInt(localStorage.getItem(`speed_breaks_${curUser}`) || '0') + 1;
            localStorage.setItem(`speed_breaks_${curUser}`, breaks);
            badgeQueue.push({ badgeCode: 'speed_record', icon: '⚡️', title: t('badge.speed'),
                desc: t('badge.speed_desc', { sec: timeTaken }) });
        }

        // 4. Balloon Game
        pendingGameResult = applyBalloonLogic(sessionErrors);
        if (pendingGameResult?.trigger) {
            badgeQueue.push({ icon: '🎈', title: t('badge.balloon'), desc: pendingGameResult.msg });
            localStats.gamesPlayed++;
            localStorage.setItem(statsKey, JSON.stringify(localStats));
        }

        // 5. Hat-trick
        const streak = parseInt(localStorage.getItem(`perfect_streak_${curUser}`) || '0') + 1;
        localStorage.setItem(`perfect_streak_${curUser}`, streak);
        if (streak === 3) {
            const htCount = parseInt(localStorage.getItem(`easter_hattrick_${curUser}`) || '0') + 1;
            localStorage.setItem(`easter_hattrick_${curUser}`, htCount);
            badgeQueue.push({ badgeCode: 'hat_trick', icon: '🔥', title: t('badge.hattrick'), desc: t('badge.hattrick_desc') });
            localStorage.setItem(`perfect_streak_${curUser}`, 0);
        }
    } else {
        pendingGameResult = null;
        localStorage.setItem(`perfect_streak_${curUser}`, 0);
    }

    // 6. Coin settlement
    if (earnedCoins > 0) {
        const vault = parseInt(localStorage.getItem('gold_coins_vault') || '0') + earnedCoins;
        localStorage.setItem('gold_coins_vault', vault);
    }

    // 7. Streak & Crystal
    const lastDate    = localStorage.getItem(`last_date_${curUser}`);
    let currentStreak = parseInt(localStorage.getItem(`current_streak_${curUser}`) || '0');
    let totalDays     = parseInt(localStorage.getItem(`total_days_${curUser}`) || '0');

    if (lastDate) {
        const diff = Math.floor((new Date(today) - new Date(lastDate)) / 864e5);
        if (diff === 1) currentStreak++;
        else if (diff > 1) currentStreak = 1;
    } else {
        currentStreak = 1;
    }

    if (lastDate !== today) {
        totalDays++;
        localStorage.setItem(`last_date_${curUser}`,           today);
        localStorage.setItem(`current_streak_${curUser}`,      currentStreak);
        localStorage.setItem(`total_days_${curUser}`,          totalDays);

        let crys = parseInt(localStorage.getItem(`crystals_${curUser}`) || '0');
        if (currentStreak >= 3) {
            crys++;
            localStorage.setItem(`crystals_${curUser}`, crys);
            badgeQueue.push({ badgeCode: 'streak_3', icon: '💎', title: t('badge.crystal'),
                desc: t('badge.crystal_desc', { n: currentStreak }) });
        }
    }

    // 8. Easter eggs (time / holiday)
    const hour = new Date().getHours();
    if (hour < 7) {
        localStorage.setItem(`easter_earlybird_${curUser}`,
            parseInt(localStorage.getItem(`easter_earlybird_${curUser}`) || '0') + 1);
        badgeQueue.push({ badgeCode: 'early_bird', icon: '🌅', title: t('badge.earlybird'), desc: t('badge.earlybird_desc') });
    } else if (hour >= 22) {
        localStorage.setItem(`easter_nightowl_${curUser}`,
            parseInt(localStorage.getItem(`easter_nightowl_${curUser}`) || '0') + 1);
        badgeQueue.push({ badgeCode: 'night_owl', icon: '🦉', title: t('badge.nightowl'), desc: t('badge.nightowl_desc') });
    }

    const d = new Date();
    const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
    const isHoliday = y === 2026 && (
        (m === 3 && day >= 14 && day <= 22) ||
        (m === 5 && day >= 30) || (m === 6 && day <= 28) ||
        (m === 9 && day >= 5  && day <= 13) ||
        (m === 11 && day >= 21) || m === 12
    );
    if (isHoliday && lastDate !== today) {
        localStorage.setItem(`easter_holiday_${curUser}`,
            parseInt(localStorage.getItem(`easter_holiday_${curUser}`) || '0') + 1);
        badgeQueue.push({ badgeCode: 'holiday_charge', icon: '🔋', title: t('badge.holiday'), desc: t('badge.holiday_desc') });
    }

    // 9. Weekend Maniac
    const dow = new Date().getDay();
    if ((dow === 0 || dow === 6) && earnedCoins > 0) {
        const wkSat    = new Date(); wkSat.setDate(wkSat.getDate() - (dow === 0 ? 1 : 0));
        const wkId     = wkSat.toISOString().split('T')[0];
        const wkKey    = `wk_count_${curUser}_${wkId}`;
        const awardKey = `wk_awarded_${curUser}_${wkId}`;
        const wkCount  = parseInt(localStorage.getItem(wkKey) || '0') + earnedCoins;
        localStorage.setItem(wkKey, wkCount);
        if (wkCount >= 10 && !localStorage.getItem(awardKey)) {
            localStorage.setItem(awardKey, '1');
            badgeQueue.push({ badgeCode: 'weekend_maniac', icon: '🎉', title: t('badge.weekend'), desc: t('badge.weekend_desc') });
        }
    }

    localStorage.setItem(`last_checkin_date_${curUser}`, today);

    if (badgeQueue.length > 0) {
        document.getElementById('badge-modal').classList.remove('is-hidden');
        document.getElementById('badge-modal').classList.add('is-visible');
        showNextBadge();
    } else {
        renderFinalScreen();
    }
}

// ── Badge Modal ───────────────────────────────
function showNextBadge() {
    if (badgeQueue.length === 0) { closeBadgeModal(); return; }

    const b     = badgeQueue.shift();
    const modal = document.querySelector('.epic-modal');
    modal.style.animation = 'none';
    void modal.offsetWidth;
    modal.style.animation = 'epicPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';

    const iconEl = document.getElementById('badge-icon');
    if (b.badgeCode && typeof BadgeIcons !== 'undefined') {
        iconEl.innerHTML = BadgeIcons.renderBadgeIconContent(b.badgeCode, b.icon);
    } else {
        iconEl.textContent = b.icon;
    }
    document.getElementById('badge-title').textContent = b.title;
    document.getElementById('badge-desc').innerHTML    = b.desc;

    if (typeof confetti === 'function') {
        confetti({ particleCount: 300, spread: 150, origin: { y: 0.3 }, zIndex: 1001 });
    }
}

function closeBadgeModal() {
    if (badgeQueue.length > 0) {
        const modal = document.querySelector('.epic-modal');
        modal.style.transform = 'scale(0.8)';
        modal.style.opacity   = '0';
        setTimeout(showNextBadge, 150);
    } else {
        document.getElementById('badge-modal').classList.remove('is-visible');
        document.getElementById('badge-modal').classList.add('is-hidden');
        renderFinalScreen();
    }
}

// ── Final Screen ──────────────────────────────
function renderFinalScreen() {
    const isPerfect = sessionErrors <= 1;
    const title     = isPerfect ? t('practice.finish_perfect') : t('practice.finish_retry');

    let html = `<div class="finish-inner">
        <h1 class="finish-title">${title}</h1>`;
    if (pendingGameResult?.msg) html += `<div class="stat-badge">${pendingGameResult.msg}</div>`;
    if (sessionErrors > 0) {
        html += `<p class="mistake-notice">${t('practice.mistakes_notice', { count: sessionErrors })}</p>`;
    }
    html += `<button class="btn-action btn-action--exit btn-home" onclick="window.location.href='index.html'">
        🏠 ${t('practice.back_home')}
    </button></div>`;

    document.getElementById('screen-finish').innerHTML = html;
    showScreen('screen-finish');

    if (isPerfect && pendingGameResult?.trigger) {
        setTimeout(() => {
            window.location.href = `https://andydang2007.github.io/game/index.html?ticket=${Date.now()}&returnUrl=../index.html`;
        }, 2500);
    }
}

// ── Draw Pad ──────────────────────────────────
function initDrawPad() {
    canvas = document.getElementById('pad');
    ctx    = canvas.getContext('2d');
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.lineWidth   = 5;
    ctx.strokeStyle = '#1e293b';

    const getPoint = e => {
        const rect = canvas.getBoundingClientRect();
        const src  = e.touches ? e.touches[0] : e;
        return { x: src.clientX - rect.left, y: src.clientY - rect.top };
    };

    canvas.addEventListener('mousedown', e => { isDrawing = true; ctx.beginPath(); const p = getPoint(e); ctx.moveTo(p.x, p.y); });
    canvas.addEventListener('mousemove', e => { if (!isDrawing) return; e.preventDefault(); const p = getPoint(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
    window.addEventListener('mouseup', () => { isDrawing = false; });
    canvas.addEventListener('touchstart', e => { isDrawing = true; ctx.beginPath(); const p = getPoint(e); ctx.moveTo(p.x, p.y); }, { passive: false });
    canvas.addEventListener('touchmove',  e => { if (!isDrawing) return; e.preventDefault(); const p = getPoint(e); ctx.lineTo(p.x, p.y); ctx.stroke(); }, { passive: false });
    canvas.addEventListener('touchend',   () => { isDrawing = false; });
}

function clearPad() { if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); }

function toggleDrawPad() {
    const panel    = document.getElementById('draw-panel');
    const isHidden = panel.classList.contains('is-hidden');
    panel.classList.toggle('is-hidden', !isHidden);
    panel.classList.toggle('is-visible', isHidden);
    if (isHidden && !ctx) initDrawPad();
}

// ── Event Binding ─────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    AppI18n.applyTranslations();

    document.getElementById('sub-btn').addEventListener('click', checkAnswer);
    document.getElementById('next-btn').addEventListener('click', nextQuestion);
    document.getElementById('exit-btn').addEventListener('click', () => { window.location.href = 'index.html'; });
    document.getElementById('draw-pad-btn').addEventListener('click', toggleDrawPad);
    document.getElementById('clear-pad-btn').addEventListener('click', clearPad);
    document.getElementById('close-pad-btn').addEventListener('click', toggleDrawPad);
    document.getElementById('badge-close-btn').addEventListener('click', closeBadgeModal);

    document.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const quizVisible  = document.getElementById('screen-quiz').classList.contains('is-active');
        const modalVisible = document.getElementById('badge-modal').classList.contains('is-visible');
        if (quizVisible) {
            const subBtn  = document.getElementById('sub-btn');
            const nextBtn = document.getElementById('next-btn');
            if (!subBtn.classList.contains('is-hidden'))       { e.preventDefault(); checkAnswer(); }
            else if (!nextBtn.classList.contains('is-hidden')) { e.preventDefault(); nextQuestion(); }
        } else if (modalVisible) {
            e.preventDefault(); closeBadgeModal();
        }
    });

    init();
});
