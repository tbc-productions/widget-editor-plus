import { test as setup, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { seedServiceNowTestData } from './fixtures/servicenow-data';

const authFile = path.join(__dirname, '../playwright/.auth/user.json');

setup('Authenticate & seed ServiceNow PDI test data', async ({ page, baseURL }) => {
  const username = process.env.SN_USERNAME;
  const password = process.env.SN_PASSWORD;
  const sessionCookie = process.env.SN_SDK_SESSION_COOKIE;

  if (!sessionCookie && (!username || !password)) throw new Error('ServiceNow test credentials are missing.');

  // 1. Seed ServiceNow test records via Table API
  console.log('[Auth Setup] Seeding test records on target instance...');
  const records = await seedServiceNowTestData();
  expect(records?.widgetSysId).toBeTruthy();

  // 2. Perform UI login to capture cookies/session
  console.log(`[Auth Setup] Logging into ServiceNow PDI: ${baseURL}`);
  if (sessionCookie) {
    await page.context().addCookies(
      sessionCookie.split(';').map((cookie) => {
        const separator = cookie.indexOf('=');
        return { name: cookie.slice(0, separator).trim(), value: cookie.slice(separator + 1).trim(), url: baseURL! };
      })
    );
  } else {
    await page.goto(`${baseURL}/login.do`);

    // Handle standard ServiceNow login form
    const usernameInput = page.locator('#user_name, input[name="user_name"]');
    const passwordInput = page.locator('#user_password, input[name="user_password"]');
    const loginButton = page.locator('#sysverb_login, button[type="submit"]');

    if (await usernameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await usernameInput.fill(username!);
      await passwordInput.fill(password!);
      await loginButton.click();

      // Wait for main page / navigation frame to load
      await page.waitForURL((url) => !url.href.includes('login.do'), { timeout: 15000 });
    }
  }

  // Save authenticated state to file
  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
  console.log(`[Auth Setup] Successfully saved auth state to ${authFile}`);
});
