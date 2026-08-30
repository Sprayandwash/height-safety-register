const { test, expect } = require('@playwright/test');

test.describe('local application shell', () => {
  test('REG-UI-001: visitor can load the app and sees the sign-in form', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/Spray and Wash Operations App/i);
    await expect(page.locator('#signedOut')).toBeVisible();
    await expect(page.locator('#loginEmail')).toBeVisible();
    await expect(page.locator('#loginPassword')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  });

  test('REG-UI-004: Enter in either sign-in field submits the existing sign-in action', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      window.signIn = () => {
        document.documentElement.dataset.signInSubmitted = 'true';
      };
    });

    for (const selector of ['#loginEmail', '#loginPassword']) {
      await page.evaluate(() => { delete document.documentElement.dataset.signInSubmitted; });
      await page.locator(selector).press('Enter');
      await expect(page.locator('html')).toHaveAttribute('data-sign-in-submitted', 'true');
    }
  });

  test('REG-UI-002: the packaged PWA manifest and app icons are available', async ({ page, request }) => {
    await page.goto('/');

    const manifest = await request.get('/manifest.webmanifest?v=4.0.90');
    expect(manifest.ok()).toBe(true);
    expect(await manifest.json()).toMatchObject({
      name: 'Spray and Wash Operations App',
      short_name: 'Spray and Wash'
    });

    for (const icon of ['assets/spray-wash-app-icon-192-v4.0.90.png', 'assets/spray-wash-app-icon-512-v4.0.90.png']) {
      const response = await request.get(`/${icon}`);
      expect(response.ok(), `${icon} should load`).toBe(true);
      expect(response.headers()['content-type']).toContain('image/png');
    }
  });
});
