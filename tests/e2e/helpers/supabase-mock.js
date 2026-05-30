/**
 * Wrap Supabase createClient once the UMD SDK has loaded (Playwright addInitScript).
 * @param {Record<string, unknown>|null} synthesisPayload
 */
function installSupabaseMock(synthesisPayload = null) {
    const defaultSynthesis = {
        current_level: 1,
        current_tier: 'Bronze',
        crystal_balance: 0,
        plan_tier: 'basic',
        next_level_config: { badge_cost: 10, crystal_cost: 0 },
        badges: [
            {
                badge_id: 'early-bird',
                badge_code: 'early_bird',
                category: 'habit',
                available: 2,
                is_hidden: false,
                display_name_en: 'Early Bird',
                display_name_zh: '早鸟',
            },
        ],
    };

    const synthesisData = synthesisPayload || defaultSynthesis;
    const fakeSession = { user: { id: 'e2e-test-user', email: 'e2e@test.local' } };

    function wrapCreateClient() {
        const lib = window.supabase;
        if (!lib || typeof lib.createClient !== 'function') return false;
        if (lib.createClient.__e2eWrapped) return true;

        const origCreate = lib.createClient;
        lib.createClient = function e2eCreateClient(...args) {
            const client = origCreate.apply(this, args);
            return {
                ...client,
                auth: {
                    ...client.auth,
                    getSession: async () => ({ data: { session: fakeSession }, error: null }),
                },
                rpc: async (name) => {
                    if (name === 'get_synthesis_data') {
                        return { data: synthesisData, error: null };
                    }
                    if (name === 'get_streak_status') {
                        return {
                            data: {
                                current_streak: 0,
                                effective_streak: 0,
                                break_pending: false,
                                plan_tier: 'basic',
                                shields_remaining: 0,
                                shields_quota: 3,
                            },
                            error: null,
                        };
                    }
                    return { data: null, error: { message: `Unhandled RPC in test mock: ${name}` } };
                },
            };
        };
        lib.createClient.__e2eWrapped = true;
        return true;
    }

    if (!wrapCreateClient()) {
        const timer = setInterval(() => {
            if (wrapCreateClient()) clearInterval(timer);
        }, 5);
        setTimeout(() => clearInterval(timer), 5000);
    }
}

module.exports = { installSupabaseMock };
