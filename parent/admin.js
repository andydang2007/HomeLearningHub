/**
 * parent/admin.js — Internal ops console (P0)
 * Requires: SupabaseClient (supabase-client.js), is_admin RPC
 */

const db = window.SupabaseClient;

/** Dev account pre-loaded on login (Accounts tab). */
const DEFAULT_ACCOUNT_EMAIL = 'andydang2007@gmail.com';

let currentFamilyId = null;
let toastTimer = null;

function $(id) { return document.getElementById(id); }

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function toast(msg, type = 'ok') {
  const el = $('toast');
  el.textContent = msg;
  el.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 2800);
}

async function rpc(fn, args = {}) {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw error;
  return data;
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function toDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(val) {
  if (!val) return null;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('is-active', b.dataset.tab === tab));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('is-active', p.id === `tab-${tab}`));
      if (tab === 'overview') loadDashboard();
      if (tab === 'recycle') loadRecycleBin();
    });
  });
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function signIn() {
  const email = $('login-email').value.trim();
  const pass = $('login-pass').value;
  const errEl = $('login-err');
  const btn = $('login-btn');
  errEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Signing in…';

  try {
    const { error } = await db.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;

    const ok = await rpc('is_admin');
    if (!ok) {
      await db.auth.signOut();
      throw new Error('This account is not in the admin allow-list.');
    }

    showMain(email);
  } catch (e) {
    errEl.textContent = e.message || 'Sign-in failed.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

function showMain(email) {
  $('admin-email-label').textContent = email;
  $('login-screen').classList.add('hidden');
  $('main-screen').classList.remove('hidden');
  loadDashboard();
  loadDefaultAccount();
}

function loadDefaultAccount() {
  const input = $('search-email');
  if (!input) return;
  input.value = DEFAULT_ACCOUNT_EMAIL;
  doSearch();
}

async function tryRestoreSession() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return;

  try {
    const ok = await rpc('is_admin');
    if (!ok) { await db.auth.signOut(); return; }
    $('login-email').value = session.user.email || '';
    showMain(session.user.email);
  } catch { /* stay on login */ }
}

// ── Overview ──────────────────────────────────────────────────────────────────

async function loadDashboard() {
  const grid = $('stats-grid');
  const summary = $('stats-summary');
  grid.innerHTML = '<p class="empty-msg">Loading…</p>';
  summary.textContent = '';

  try {
    const stats = await rpc('admin_get_dashboard_stats');
    const quadrants = [
      { key: 'single_child_basic',   label: 'Single · Basic' },
      { key: 'single_child_premium', label: 'Single · Premium' },
      { key: 'multi_child_basic',    label: 'Multi · Basic' },
      { key: 'multi_child_premium',  label: 'Multi · Premium' },
    ];

    grid.innerHTML = quadrants.map(q => `
      <div class="quadrant-card">
        <div class="label">${esc(q.label)}</div>
        <div class="count">${stats[q.key] ?? 0}</div>
      </div>
    `).join('');

    summary.innerHTML = `
      <span>Families: <strong>${stats.total_families ?? 0}</strong></span>
      <span>Active kids: <strong>${stats.active_kid_profiles ?? 0}</strong></span>
      <span>In recycle bin: <strong>${stats.deleted_kid_profiles ?? 0}</strong></span>
    `;
  } catch (e) {
    grid.innerHTML = `<p class="empty-msg" style="color:var(--red)">${esc(e.message)}</p>`;
  }
}

// ── Accounts ──────────────────────────────────────────────────────────────────

async function doSearch() {
  const email = $('search-email').value.trim();
  if (!email) return;
  const btn = $('search-btn');
  btn.disabled = true;
  btn.textContent = '…';

  try {
    const result = await rpc('admin_find_user_by_email', { p_email: email });
    if (!result.found) {
      toast(result.error || 'User not found', 'err');
      $('user-section').classList.add('hidden');
      return;
    }
    renderUserSection(result);
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Search';
  }
}

function renderUserSection(data) {
  currentFamilyId = data.family_id;

  $('ui-email').textContent = data.email || '—';
  $('ui-family-id').textContent = data.family_id || '—';
  $('ui-account-type').textContent = data.account_type || '—';
  $('ui-plan').textContent = data.plan_tier || '—';
  $('ui-entitlement').textContent = data.entitlement_status || '—';
  $('ui-premium-ends').textContent = fmtDate(data.premium_ends_at);

  $('set-account-type').value = data.account_type || 'single_child';
  $('set-plan-tier').value = data.plan_tier || 'basic';
  $('set-premium-ends').value = toDatetimeLocal(data.premium_ends_at);

  togglePremiumField();

  const list = $('profile-list');
  list.innerHTML = '';
  const profiles = data.profiles || [];
  if (!profiles.length) {
    list.innerHTML = '<p class="empty-msg">No active kid profiles.</p>';
  } else {
    profiles.forEach(p => renderProfileCard(p, list));
  }

  $('save-plan-btn').disabled = !data.family_id;
  $('user-section').classList.remove('hidden');
}

function renderProfileCard(p, container) {
  const card = document.createElement('div');
  card.className = 'profile-card';
  card.dataset.profileId = p.id;

  card.innerHTML = `
    <div class="profile-header">
      <div class="profile-meta">
        <div class="profile-name">${esc(p.display_name)}${p.grade ? ` <span style="font-size:12px;color:var(--muted)">(${esc(p.grade)})</span>` : ''}</div>
        <div class="profile-sub">
          <span class="level-label">Level <span class="level-val">${p.level_no ?? 1}</span> · <span class="tier-val">${esc(p.tier_name ?? 'Bronze')}</span></span>
          · 💎 ${p.crystal_balance ?? 0} · 🪙 ${p.coin_balance ?? 0} · 🏅 ${p.badge_total ?? 0}
        </div>
      </div>
    </div>
    <div class="profile-body">
      <div class="profile-level-row">
        <label>Level</label>
        <input type="number" class="inp-level" min="1" max="100" value="${p.level_no ?? 1}" style="width:72px">
        <button class="btn-success btn-sm save-level-btn">Set Level</button>
      </div>
    </div>`;

  card.querySelector('.save-level-btn').addEventListener('click', () => saveProfileLevel(p.id, card));
  container.appendChild(card);
}

async function saveProfileLevel(profileId, card) {
  const btn = card.querySelector('.save-level-btn');
  const level = parseInt(card.querySelector('.inp-level').value, 10);
  if (Number.isNaN(level) || level < 1 || level > 100) {
    toast('Level must be 1–100', 'err');
    return;
  }

  btn.disabled = true;
  btn.textContent = '…';
  try {
    const result = await rpc('admin_set_profile_level', {
      p_profile_id: profileId,
      p_level_no: level,
    });
    card.querySelector('.level-val').textContent = result.level_no;
    card.querySelector('.tier-val').textContent = result.tier_name;
    toast(`Level → ${result.level_no} (${result.tier_name})`);
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Set Level';
  }
}

function togglePremiumField() {
  const isPremium = $('set-plan-tier').value === 'premium';
  $('premium-ends-field').classList.toggle('hidden', !isPremium);
}

async function saveSubscription() {
  if (!currentFamilyId) return;
  const btn = $('save-plan-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  const planTier = $('set-plan-tier').value;
  const accountType = $('set-account-type').value;
  const premiumEnds = planTier === 'premium'
    ? fromDatetimeLocal($('set-premium-ends').value)
    : null;

  try {
    const result = await rpc('admin_update_family_subscription', {
      p_family_id: currentFamilyId,
      p_plan_tier: planTier,
      p_account_type: accountType,
      p_premium_ends_at: premiumEnds,
    });

    $('ui-account-type').textContent = accountType;
    $('ui-plan').textContent = planTier;
    $('ui-entitlement').textContent = 'active';
    $('ui-premium-ends').textContent = fmtDate(result.premium_ends_at);
    toast('Subscription updated');
    loadDashboard();
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Changes';
  }
}

// ── Recycle bin ───────────────────────────────────────────────────────────────

async function loadRecycleBin() {
  const tbody = $('recycle-body');
  tbody.innerHTML = '<tr><td colspan="5" class="empty-msg">Loading…</td></tr>';

  const filterEmail = $('recycle-filter').value.trim() || null;

  try {
    const rows = await rpc('admin_list_deleted_profiles', {
      p_email: filterEmail,
      p_limit: 50,
    });

    if (!rows || !rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-msg">No deleted profiles.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(r => `
      <tr data-profile-id="${esc(r.profile_id)}">
        <td>${esc(r.display_name)}${r.grade ? ` <span style="color:var(--muted)">(${esc(r.grade)})</span>` : ''}</td>
        <td>${esc(r.owner_email || '—')}</td>
        <td style="font-size:11px;font-family:monospace">${esc(String(r.family_id || '').slice(0, 8))}…</td>
        <td>${fmtDate(r.deleted_at)}</td>
        <td>
          <button class="btn-success btn-sm restore-btn" data-id="${esc(r.profile_id)}">Restore</button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.restore-btn').forEach(btn => {
      btn.addEventListener('click', () => restoreProfile(btn.dataset.id, btn));
    });
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" style="color:var(--red)">${esc(e.message)}</td></tr>`;
  }
}

async function restoreProfile(profileId, btn) {
  if (!confirm('Restore this kid profile?')) return;
  btn.disabled = true;
  btn.textContent = '…';

  try {
    const result = await rpc('admin_restore_kid_profile', { p_profile_id: profileId });
    toast(`Restored: ${result.display_name}`);
    loadRecycleBin();
    loadDashboard();
  } catch (e) {
    toast(e.message, 'err');
    btn.disabled = false;
    btn.textContent = 'Restore';
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initTabs();

  $('login-btn').addEventListener('click', signIn);
  $('login-pass').addEventListener('keydown', e => {
    if (e.key === 'Enter') signIn();
  });

  $('signout-btn').addEventListener('click', async () => {
    await db.auth.signOut();
    location.reload();
  });

  $('search-btn').addEventListener('click', doSearch);
  $('search-email').addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch();
  });

  $('set-plan-tier').addEventListener('change', togglePremiumField);
  $('save-plan-btn').addEventListener('click', saveSubscription);

  $('recycle-refresh-btn').addEventListener('click', loadRecycleBin);
  $('recycle-filter').addEventListener('keydown', e => {
    if (e.key === 'Enter') loadRecycleBin();
  });

  tryRestoreSession();
});
