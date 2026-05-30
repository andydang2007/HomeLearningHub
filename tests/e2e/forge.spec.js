// @ts-check
const { test, expect } = require('@playwright/test');
const { installSupabaseMock } = require('./helpers/supabase-mock');

const TEST_KID_ID = '11111111-1111-1111-1111-111111111111';

test.describe('Forge (synthesis) — authenticated', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(installSupabaseMock);
    });

    test('loads level-up UI with mocked RPC', async ({ page }) => {
        await page.goto(`/student/synthesis.html?kid=${TEST_KID_ID}&name=Tester`);

        await expect(page.locator('#synth-main')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('#synth-title')).not.toBeEmpty();
        await expect(page.locator('#current-orb')).toBeVisible();
        await expect(page.locator('#back-btn')).toBeVisible();
        await expect(page.locator('#forge-btn')).toBeVisible();
    });
});

test.describe('Forge (synthesis) — auth gate', () => {
    test('redirects to parent login when no session', async ({ page }) => {
        await page.addInitScript(() => {
            function wrapNoSession() {
                const lib = window.supabase;
                if (!lib || typeof lib.createClient !== 'function') return false;
                if (lib.createClient.__e2eNoSession) return true;
                const origCreate = lib.createClient;
                lib.createClient = function noSessionClient(...args) {
                    const client = origCreate(...args);
                    return {
                        ...client,
                        auth: {
                            ...client.auth,
                            getSession: async () => ({ data: { session: null }, error: null }),
                        },
                    };
                };
                lib.createClient.__e2eNoSession = true;
                return true;
            }
            if (!wrapNoSession()) {
                const timer = setInterval(() => {
                    if (wrapNoSession()) clearInterval(timer);
                }, 5);
                setTimeout(() => clearInterval(timer), 5000);
            }
        });

        await page.goto(`/student/synthesis.html?kid=${TEST_KID_ID}&name=Tester`);

        await expect(page).toHaveURL(/\/parent\/index\.html/, { timeout: 15_000 });
    });
});
