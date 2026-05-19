/**
 * common/js/auth.js
 * =================
 * ONLY handles session state, authentication, and core access control.
 * NO UI rendering or DOM mutation is permitted in this file.
 *
 * Current status: MOCK (Phase 4 temporary)
 * Replacement plan: swap getCurrentUser() for a real Supabase Auth
 * session lookup once the login/registration page is built.
 */

/**
 * Returns the currently active user profile.
 *
 * ─── TEMPORARY MOCK ──────────────────────────────────────────────────────────
 * Hard-coded to return Valerie's profile until the auth flow is implemented.
 * To add a new test user, duplicate this object and change the values.
 *
 * TODO: Replace the `id` value below with the real UUID from your
 *       Supabase `auth.users` table (Dashboard → Authentication → Users).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * @returns {{ id: string, username: string, grade: string, role: string }}
 */
function getCurrentUser() {
    return {
        id:       '8e1a2d54-ace4-4710-86d5-1c64373e6ee2',
        username: localStorage.getItem('currentPlayer') || 'Valerie',
        grade:    localStorage.getItem('currentGrade')  || 'P3',
        role:     'kid',
    };
}

/**
 * Returns true if the current session belongs to a parent-role user.
 * Reserved for parent-PIN gate checks — always false until real auth lands.
 */
function isParent() {
    return getCurrentUser().role === 'parent';
}
