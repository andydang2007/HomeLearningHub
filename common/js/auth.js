/**
 * common/js/auth.js
 * =================
 * Owns all session state for the app.
 * NO UI rendering or DOM mutation is permitted in this file.
 *
 * Responsibilities:
 *  - Kid profiles (stored in localStorage, max 3 per device)
 *  - Active kid session (currentPlayer / currentGrade)
 *  - Parent PIN verification state (sessionStorage — cleared on tab close)
 *  - Parent Supabase Auth session (parent pages only)
 */

window.AUTH = {

    // ── Kid profiles (localStorage) ─────────────────────────────────────────

    /** @returns {Array<{name:string,grade:string,avatarId:string,gender:string,schoolName:string,chineseLevel:string}>} */
    getKidProfiles() {
        try {
            const raw = localStorage.getItem('kid_profiles');
            if (raw) {
                return JSON.parse(raw).map((p) => this._normalizeKidProfile(p));
            }

            const legacy = localStorage.getItem('currentPlayer');
            if (legacy) {
                const grade    = localStorage.getItem('currentGrade') || 'P3';
                const profiles = [this._normalizeKidProfile({ name: legacy, grade, avatar: '' })];
                this._saveKidProfiles(profiles);
                return profiles;
            }
            return [];
        } catch { return []; }
    },

    _normalizeKidProfile(p) {
        const catalog = window.ProfileCatalog;
        const avatarId = catalog
            ? catalog.resolveAvatarId(p.avatarId || p.avatar)
            : (p.avatarId || 'star');
        return {
            name:         (p.name || '').trim(),
            grade:        p.grade || 'P3',
            avatarId,
            gender:       p.gender || '',
            schoolName:   (p.schoolName || p.school_name || '').trim(),
            chineseLevel: p.chineseLevel || p.chinese_level || 'CL',
        };
    },

    _saveKidProfiles(profiles) {
        localStorage.setItem('kid_profiles', JSON.stringify(profiles));
    },

    /**
     * Adds a kid profile (max 3). Accepts object or legacy (name, grade, avatarId).
     * @returns {boolean}
     */
    addKidProfile(nameOrProfile, grade, avatarId) {
        let data;
        if (typeof nameOrProfile === 'object' && nameOrProfile !== null) {
            data = nameOrProfile;
        } else {
            data = { name: nameOrProfile, grade, avatarId: avatarId || 'star' };
        }

        const profile = this._normalizeKidProfile(data);
        if (profile.name.length < 2) return false;

        const profiles = this.getKidProfiles();
        if (profiles.length >= 3) return false;
        if (profiles.find((p) => p.name.toLowerCase() === profile.name.toLowerCase())) return false;

        profiles.push(profile);
        this._saveKidProfiles(profiles);
        return true;
    },

    removeKidProfile(name) {
        const profiles = this.getKidProfiles().filter(p => p.name !== name);
        this._saveKidProfiles(profiles);
        if (localStorage.getItem('currentPlayer') === name) {
            localStorage.removeItem('currentPlayer');
            localStorage.removeItem('currentGrade');
        }
    },

    /** @returns {{ name: string, grade: string } | null} */
    getActiveKid() {
        const name  = localStorage.getItem('currentPlayer');
        const grade = localStorage.getItem('currentGrade');
        if (!name) return null;
        return { name, grade: grade || 'P3' };
    },

    setActiveKid(name, grade) {
        localStorage.setItem('currentPlayer', name);
        localStorage.setItem('currentGrade', grade);
    },

    // ── Parent PIN gate (sessionStorage) ────────────────────────────────────
    // Valid only while the parent remains on dashboard.html.
    // Leaving the dashboard revokes the gate so a child cannot re-enter.

    isPinVerified() {
        return sessionStorage.getItem('parent_pin_ok') === '1';
    },

    setPinVerified(ok) {
        if (ok) sessionStorage.setItem('parent_pin_ok', '1');
        else    sessionStorage.removeItem('parent_pin_ok');
    },

    /** Call when exiting parent/dashboard — forces PIN on next parent-area visit. */
    revokeParentPinGate() {
        this.setPinVerified(false);
    },

    // ── PIN attempt throttle ─────────────────────────────────────────────────

    getPinFailCount() {
        return parseInt(sessionStorage.getItem('pin_fail_count') || '0', 10);
    },

    incrementPinFail() {
        const n = this.getPinFailCount() + 1;
        sessionStorage.setItem('pin_fail_count', String(n));
        if (n >= 5) {
            const lockUntil = Date.now() + 30000 * Math.pow(2, n - 5);
            sessionStorage.setItem('pin_lock_until', String(lockUntil));
        }
        return n;
    },

    resetPinFail() {
        sessionStorage.removeItem('pin_fail_count');
        sessionStorage.removeItem('pin_lock_until');
    },

    /** Returns ms remaining in lockout, or 0 if not locked. */
    getPinLockRemaining() {
        const until = parseInt(sessionStorage.getItem('pin_lock_until') || '0', 10);
        return Math.max(0, until - Date.now());
    },

    // ── Supabase parent session (parent pages only) ──────────────────────────
    // SupabaseClient is only available on pages that load supabase-client.js.

    async getParentSession() {
        if (typeof window.SupabaseClient === 'undefined') return null;
        try {
            const { data: { session } } = await window.SupabaseClient.auth.getSession();
            return session;
        } catch { return null; }
    },

    async signOut() {
        this.setPinVerified(false);
        if (typeof window.SupabaseClient !== 'undefined') {
            try { await window.SupabaseClient.auth.signOut(); } catch { /* ignore */ }
        }
    },
};

// ── Legacy compatibility (consumed by practice.js, shop.js) ─────────────────
function getCurrentUser() {
    const kid = AUTH.getActiveKid();
    return {
        id:       localStorage.getItem('active_kid_profile_id') || '',
        username: kid ? kid.name  : '',
        grade:    kid ? kid.grade : 'P3',
        role:     'kid',
    };
}

function isParent() { return false; }
