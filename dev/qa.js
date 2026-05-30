'use strict';

const grid = document.getElementById('qa-scenario-grid');
const activePanel = document.getElementById('qa-active-panel');
const activeName = document.getElementById('qa-active-name');
const launchPanel = document.getElementById('qa-launch-panel');
const launchHint = document.getElementById('qa-launch-hint');
const hostNote = document.getElementById('qa-host-note');
const forgeLink = document.getElementById('qa-open-forge');

let currentFilter = 'all';

function renderHostNote() {
    if (!hostNote) return;
    if (QA_HARNESS.isAllowedHost()) {
        hostNote.textContent = '当前环境允许使用 QA 演练台（localhost / 127.0.0.1）。';
        hostNote.className = 'qa-note qa-note--ok';
    } else {
        hostNote.textContent = '非本地环境：请在 URL 加 ?force=1 使用，且勿部署到生产用户可见入口。';
        hostNote.className = 'qa-note qa-note--warn';
    }
}

function updateForgeLink() {
    const active = QA_HARNESS.getActive();
    const profiles = JSON.parse(localStorage.getItem('kid_profiles') || '[]');
    const kid = profiles[0];
    if (kid?.cloudId) {
        forgeLink.href = `../student/synthesis.html?kid=${encodeURIComponent(kid.cloudId)}&name=${encodeURIComponent(kid.name)}`;
    } else {
        forgeLink.href = '../student/synthesis.html?kid=' + encodeURIComponent(QA_HARNESS.TEST_CLOUD_ID) + '&name=Tester';
    }
}

function updateActivePanel() {
    const active = QA_HARNESS.getActive();
    if (active) {
        activePanel.hidden = false;
        launchPanel.hidden = false;
        activeName.textContent = active.titleZh;
        launchHint.textContent = active.requiresLogin
            ? '此场景建议已登录家长后再打开 Dashboard / Forge。账户标签为模拟，不会写入数据库。'
            : '可直接打开学生 Hub 查看界面。';
    } else {
        activePanel.hidden = true;
        launchPanel.hidden = true;
    }
    updateForgeLink();
    renderCards();
}

function renderCards() {
    const activeId = QA_HARNESS.getActiveId();
    const list = QA_HARNESS.listScenarios().filter((s) => {
        if (currentFilter === 'all') return true;
        return s.group === currentFilter;
    });

    grid.innerHTML = list.map((s) => `
        <article class="qa-card${s.id === activeId ? ' is-active' : ''}" data-id="${s.id}">
            ${s.requiresLogin ? '<span class="qa-tag qa-tag--login">需家长登录</span>' : '<span class="qa-tag">游客可用</span>'}
            <h3>${s.titleZh}</h3>
            <p>${s.descZh}</p>
            <button type="button" class="qa-btn qa-btn--primary qa-apply-btn" data-id="${s.id}">应用此场景</button>
        </article>
    `).join('');

    grid.querySelectorAll('.qa-apply-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            const scenario = QA_HARNESS.SCENARIOS[id];
            if (scenario?.requiresLogin && typeof AUTH !== 'undefined') {
                const session = await AUTH.getParentSession();
                if (!session) {
                    const go = confirm('此场景建议先登录家长账户。现在去登录吗？');
                    if (go) {
                        window.open('../parent/index.html', '_blank');
                        return;
                    }
                }
            }
            QA_HARNESS.applyScenario(id);
            updateActivePanel();
        });
    });
}

document.querySelectorAll('.qa-filter').forEach((btn) => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.qa-filter').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter || 'all';
        renderCards();
    });
});

document.getElementById('qa-clear-btn')?.addEventListener('click', () => {
    QA_HARNESS.clearScenario();
    updateActivePanel();
});

renderHostNote();
updateActivePanel();
