// @ts-check
const { test, expect } = require('@playwright/test');
const { installSupabaseMock } = require('./helpers/supabase-mock');

test.describe('Student hub', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(installSupabaseMock);
    });

    test('guest profile opens dashboard with subject grid', async ({ page }) => {
        await page.addInitScript(() => {
            localStorage.setItem('currentPlayer', 'E2ETester');
            localStorage.setItem('currentGrade', 'P3');
            localStorage.setItem('kid_profiles', JSON.stringify([{
                name: 'E2ETester',
                grade: 'P3',
                avatarId: 'star',
                chineseLevel: 'CL',
            }]));
        });

        await page.goto('/student/index.html');

        await expect(page.locator('#dashboard-screen')).toHaveClass(/is-visible/, { timeout: 15_000 });
        await expect(page.locator('#section-subject-title')).toBeVisible();
        await expect(page.locator('.grid-cards .card-btn').first()).toBeVisible();
    });

    test('shows user picker when no active profile', async ({ page }) => {
        await page.addInitScript(() => {
            localStorage.removeItem('currentPlayer');
            localStorage.removeItem('currentGrade');
        });

        await page.goto('/student/index.html');

        await expect(page.locator('#user-screen')).toHaveClass(/is-visible/, { timeout: 15_000 });
    });
});
