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
            name:         (p.name || p.display_name || '').trim(),
            grade:        p.grade || 'P3',
            avatarId,
            gender:       p.gender || '',
            schoolName:   (p.schoolName || p.school_name || '').trim(),
            chineseLevel: p.chineseLevel || p.chinese_level || 'CL',
            cloudId:      p.cloudId || p.cloud_id || p.id || '',
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
            localStorage.removeItem('active_kid_profile_id');
        }
    },

    /** @returns {boolean} */
    updateKidProfile(name, updates) {
        const profiles = this.getKidProfiles();
        const idx = profiles.findIndex((p) => p.name.toLowerCase() === name.toLowerCase());
        if (idx === -1) return false;
        profiles[idx] = this._normalizeKidProfile({ ...profiles[idx], ...updates, name: updates.name || profiles[idx].name });
        this._saveKidProfiles(profiles);
        return true;
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
        const profile = this.getKidProfiles().find((p) => p.name === name);
        if (profile && profile.cloudId) {
            localStorage.setItem('active_kid_profile_id', profile.cloudId);
        } else {
            localStorage.removeItem('active_kid_profile_id');
        }
    },

    setKidCloudId(name, cloudId) {
        const profiles = this.getKidProfiles();
        const idx = profiles.findIndex((p) => p.name === name);
        if (idx === -1) return false;
        profiles[idx].cloudId = cloudId;
        this._saveKidProfiles(profiles);
        if (localStorage.getItem('currentPlayer') === name) {
            localStorage.setItem('active_kid_profile_id', cloudId);
        }
        return true;
    },

    getKidsNeedingCloudSync() {
        return this.getKidProfiles().filter((p) => !p.cloudId);
    },

    _importDismissKey(parentUserId) {
        return `kid_import_dismissed_${parentUserId || 'unknown'}`;
    },

    isKidImportDismissed(parentUserId) {
        return localStorage.getItem(this._importDismissKey(parentUserId)) === '1';
    },

    setKidImportDismissed(parentUserId) {
        localStorage.setItem(this._importDismissKey(parentUserId), '1');
    },

    /**
     * Merge cloud kid rows into local kid_profiles (match by cloud id, then name).
     * @param {Array<object>} cloudKids
     */
    mergeCloudKidsIntoLocal(cloudKids) {
        if (!Array.isArray(cloudKids) || cloudKids.length === 0) return;

        const profiles = this.getKidProfiles();
        const byCloudId = new Map(profiles.filter((p) => p.cloudId).map((p) => [p.cloudId, p]));
        const byName = new Map(profiles.map((p) => [p.name.toLowerCase(), p]));

        cloudKids.forEach((row) => {
            const cloudId = row.id || row.cloudId || '';
            if (!cloudId) return;

            const normalized = this._normalizeKidProfile({
                name: row.display_name || row.name,
                grade: row.grade,
                avatarId: row.avatar_id || row.avatarId,
                gender: row.gender,
                schoolName: row.school_name,
                chineseLevel: row.chinese_level,
                cloudId,
            });

            if (byCloudId.has(cloudId)) {
                const existing = byCloudId.get(cloudId);
                Object.assign(existing, normalized);
                return;
            }

            const nameKey = normalized.name.toLowerCase();
            if (byName.has(nameKey)) {
                const existing = byName.get(nameKey);
                existing.cloudId = cloudId;
                Object.assign(existing, normalized);
                byCloudId.set(cloudId, existing);
                return;
            }

            if (profiles.length < 3) {
                profiles.push(normalized);
                byCloudId.set(cloudId, normalized);
                byName.set(nameKey, normalized);
            }
        });

        this._saveKidProfiles(profiles);
    },

    async fetchCloudKidProfiles() {
        if (typeof window.SupabaseClient === 'undefined') {
            return { kids: [], error: 'no_client' };
        }
        try {
            const { data, error } = await window.SupabaseClient.rpc('list_kid_profiles');
            if (error) return { kids: [], error: error.message };
            const kids = Array.isArray(data) ? data : (typeof data === 'string' ? JSON.parse(data) : []);
            return { kids, error: null };
        } catch (e) {
            return { kids: [], error: e.message || 'fetch_failed' };
        }
    },

    /**
     * Create or link one kid profile on cloud via RPC.
     * @returns {Promise<{ cloudId: string, error: string|null }>}
     */
    async createKidProfileOnCloud(profile) {
        if (typeof window.SupabaseClient === 'undefined') {
            return { cloudId: '', error: 'no_client' };
        }
        const p = this._normalizeKidProfile(profile);
        try {
            const { data, error } = await window.SupabaseClient.rpc('create_kid_profile', {
                p_display_name:  p.name,
                p_grade:         p.grade,
                p_avatar_id:     p.avatarId,
                p_school_name:   p.schoolName || null,
                p_gender:        p.gender || null,
                p_chinese_level: p.chineseLevel || 'CL',
            });
            if (error) return { cloudId: '', error: error.message };
            const cloudId = data ? String(data) : '';
            if (cloudId) this.setKidCloudId(p.name, cloudId);
            return { cloudId, error: null };
        } catch (e) {
            return { cloudId: '', error: e.message || 'rpc_failed' };
        }
    },

    /**
     * Import all local profiles missing cloudId (idempotent per display name on server).
     * @returns {Promise<{ imported: number, failed: number, errors: string[] }>}
     */
    async importLocalKidsToCloud() {
        const pending = this.getKidsNeedingCloudSync();
        let imported = 0;
        let failed = 0;
        const errors = [];

        for (const profile of pending) {
            const { cloudId, error } = await this.createKidProfileOnCloud(profile);
            if (error) {
                failed += 1;
                errors.push(`${profile.name}: ${error}`);
            } else if (cloudId) {
                imported += 1;
            }
        }

        return { imported, failed, errors };
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
