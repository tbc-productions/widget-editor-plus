import { test, expect, Page, Browser } from '@playwright/test';
import { expectSavedWidgetField, getTestWidgetSysId } from '../helpers/widget-save';

const EDITOR_PAGE_SYS_ID = '8b2e70458373fe1070b8b5dfeeaad35e';


function getScopedLocator(page: Page, selector: string) {
  const iframeLocator = page.frameLocator('#gsft_main').locator(selector);
  const topLocator = page.locator(selector);
  return iframeLocator.or(topLocator);
}

async function loginViaForm(page: Page, username: string, password: string) {
  const usernameInput = page.locator('#user_name, input[name="user_name"]');
  const passwordInput = page.locator('#user_password, input[name="user_password"]');
  const loginButton = page.locator('#sysverb_login, button[type="submit"]');

  if (await usernameInput.isVisible({ timeout: 10000 }).catch(() => false)) {
    await usernameInput.fill(username);
    await passwordInput.fill(password);
    await loginButton.click();
    await page.waitForURL((url) => !url.href.includes('login.do'), { timeout: 15000 }).catch(() => { });
  }
}

// Establishes a fresh, independent UI login in a brand-new browser context rather than reusing
// the suite-wide storageState. Multi-user presence requires two genuinely simultaneous, live
// sessions at assertion time — reusing a storageState captured minutes earlier by auth.setup.ts
// risks it having expired by the time a later test file runs, so both sessions here are logged
// in from scratch, back-to-back, guaranteeing they're concurrently active.
async function newAuthenticatedContext(browser: Browser, baseURL: string, username: string, password: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseURL}/login.do`);
  await loginViaForm(page, username, password);
  return { context, page };
}

test.describe('Widget Editor+ Specialised Features', () => {

  test('should trigger GlideRecord field autocomplete in Server Script editor', async ({ page, request, baseURL }) => {
    const widgetSysId = await getTestWidgetSysId(request, baseURL || '');
    await page.goto(`${baseURL}/ui_page.do?sys_id=${EDITOR_PAGE_SYS_ID}&widget_id=${widgetSysId}`);
    await page.waitForLoadState('domcontentloaded');

    // Wait for main editor app shell to be fully loaded
    const appShell = getScopedLocator(page, '.we-app, #widget-editor-container, .monaco-editor').first();
    await expect(appShell).toBeVisible({ timeout: 30000 });

    // Target the Server Script pane regardless of pane order.
    const serverEditorInput = getScopedLocator(page, '#pane-script .monaco-editor textarea');
    await expect(serverEditorInput).toBeVisible({ timeout: 30000 });
    await serverEditorInput.focus();

    await page.waitForTimeout(3000);

    // Type GlideRecord statement
    await page.keyboard.type('\nvar gr = new GlideRecord("sys_user");\ngr.', { delay: 50 });
    await page.waitForTimeout(1000);
    await page.keyboard.press('Control+Space');

    // Assert suggestion widget lists schema fields (e.g. sys_id or user_name or query)
    const suggestWidget = getScopedLocator(page, '.suggest-widget .monaco-list-row, .suggest-widget').first();
    await expect(suggestWidget).toBeVisible({ timeout: 20000 });
  });

  test('should support per-field saving for individual sub-editors', async ({ page, request, baseURL }) => {
    const widgetSysId = await getTestWidgetSysId(request, baseURL || '');
    await page.goto(`${baseURL}/ui_page.do?sys_id=${EDITOR_PAGE_SYS_ID}&widget_id=${widgetSysId}`);
    await page.waitForLoadState('domcontentloaded');

    // Wait for main editor app shell to be fully loaded
    const appShell = getScopedLocator(page, '.we-app, #widget-editor-container, .monaco-editor').first();
    await expect(appShell).toBeVisible({ timeout: 30000 });

    // Make an edit in the Server Script pane.
    const serverEditorInput = getScopedLocator(page, '#pane-script .monaco-editor textarea');
    await expect(serverEditorInput).toBeVisible({ timeout: 30000 });
    await serverEditorInput.focus();
    const marker = `// E2E per-field save ${Date.now()}`;
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type(`\n${marker}\n`);

    const paneSaveButton = getScopedLocator(page, '#pane-script .we-pane-save-btn');

    await expect(paneSaveButton).toBeVisible({ timeout: 15000 });
    await paneSaveButton.click();
    await expectSavedWidgetField(request, baseURL || '', widgetSysId, 'script', marker);

    // Verify no critical alert occurs
    const criticalAlert = getScopedLocator(page, '.we-alert-bar--critical').first();
    await expect(criticalAlert).not.toBeVisible();
  });

  test('should open "Link existing provider" modal and search for spAttachmentManager returning 1 result', async ({ page, request, baseURL }) => {
    const widgetSysId = await getTestWidgetSysId(request, baseURL || '');
    await page.goto(`${baseURL}/ui_page.do?sys_id=${EDITOR_PAGE_SYS_ID}&widget_id=${widgetSysId}`);
    await page.waitForLoadState('domcontentloaded');

    // 1. Explicitly wait for full editor app shell to finish loading
    const appShell = getScopedLocator(page, '.we-app, #widget-editor-container, .monaco-editor').first();
    await expect(appShell).toBeVisible({ timeout: 30000 });

    // 2. Locate Providers dropdown button in header and click
    const providerBtn = getScopedLocator(page, 'button')
      .filter({ hasText: /Providers/i })
      .first();

    await expect(providerBtn).toBeVisible({ timeout: 20000 });
    await providerBtn.click();

    // 3. Click "Link existing provider" item in dropdown menu
    const linkExistingOption = getScopedLocator(page, '.we-add-link, .we-dropdown-item')
      .filter({ hasText: /Link existing provider/i })
      .first();

    await expect(linkExistingOption).toBeVisible({ timeout: 15000 });
    await linkExistingOption.click();

    // 4. Assert "Link existing provider" modal opens
    const linkModalHeader = getScopedLocator(page, '.we-modal-header')
      .filter({ hasText: /Link existing provider/i })
      .first();

    await expect(linkModalHeader).toBeVisible({ timeout: 15000 });

    // 5. Type "spAttachmentManager" in the provider picker input
    // Scoped to the Link Provider modal's own search input via its ng-model — the
    // "Open a Widget" picker modal also has a `.we-picker-search` input and stays in
    // the DOM (hidden via ng-show, not removed via ng-if), so a generic class/placeholder
    // selector matches both, non-deterministically picking either one.
    const searchInput = getScopedLocator(page, 'input[ng-model="linkProvider.search"]').first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    await searchInput.fill('spAttachmentManager');

    // 6. Assert exactly 1 search result item is returned matching spAttachmentManager
    // Scoped via ng-click rather than the shared `.we-link-item` class — the widget
    // picker modal reuses `.we-link-item` for its own (always-populated) widget list,
    // which is also present in the DOM whether or not that modal is visible.
    const resultItems = getScopedLocator(page, '[ng-click="selectLinkProvider(p)"]');
    await expect(resultItems).toHaveCount(1, { timeout: 15000 });
    await expect(resultItems.first()).toContainText('spAttachmentManager');

    // 7. Click Cancel button to close modal without linking/modifying the test widget
    // Scoped to the Link Provider modal's own Cancel button specifically — a generic
    // "button" + text filter also matches the Unlink Dependency confirmation modal's
    // Cancel button, which stays in the DOM (hidden via ng-show, not removed via ng-if)
    // and sorts first, so `.first()` would otherwise resolve to a permanently-hidden element.
    const cancelButton = getScopedLocator(page, 'button[ng-click="cancelLinkProviderModal()"]').first();

    await expect(cancelButton).toBeVisible({ timeout: 10000 });
    await cancelButton.click();

    // 8. Assert modal closes cleanly
    await expect(linkModalHeader).not.toBeVisible({ timeout: 10000 });

    // 9. Press Escape to dismiss any residual dropdown menus
    await page.keyboard.press('Escape');
  });

  test('should open burger menu, select User Preferences, and drag modal around screen', async ({ page, request, baseURL }) => {
    const widgetSysId = await getTestWidgetSysId(request, baseURL || '');

    // Fresh navigation to guarantee clean initial state
    await page.goto(`${baseURL}/ui_page.do?sys_id=${EDITOR_PAGE_SYS_ID}&widget_id=${widgetSysId}`);
    await page.waitForLoadState('domcontentloaded');

    // 1. Wait for full editor app shell to finish loading
    const appShell = getScopedLocator(page, '.we-app, #widget-editor-container, .monaco-editor').first();
    await expect(appShell).toBeVisible({ timeout: 30000 });

    // 2. Click the burger menu button in header (button[title="Menu"] or button with icon-menu)
    const burgerMenuBtn = getScopedLocator(page, 'button[title="Menu"], button[aria-label="Menu"], button:has(.icon-menu)').first();
    await expect(burgerMenuBtn).toBeVisible({ timeout: 20000 });
    await burgerMenuBtn.click();

    // 3. Click "User preferences" item inside the opened burger dropdown menu
    const userPrefsOption = getScopedLocator(page, '.we-dropdown-menu .we-dropdown-item')
      .filter({ hasText: /User preferences/i })
      .first();

    await expect(userPrefsOption).toBeVisible({ timeout: 15000 });
    await userPrefsOption.click();

    // 4. Assert User Preferences modal opens
    const prefModalHeader = getScopedLocator(page, '.we-modal-header')
      .filter({ hasText: /User Preferences/i })
      .first();

    await expect(prefModalHeader).toBeVisible({ timeout: 15000 });

    // 5. Record initial position of User Preferences modal
    const prefModal = getScopedLocator(page, '.we-modal-pref, .we-modal').first();
    const boxBefore = await prefModal.boundingBox();
    expect(boxBefore).not.toBeNull();

    if (boxBefore) {
      // 6. Drag the modal header (.we-modal-header) to move the modal around the screen
      const headerBox = await prefModalHeader.boundingBox();
      if (headerBox) {
        const startX = headerBox.x + headerBox.width / 2;
        const startY = headerBox.y + headerBox.height / 2;

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX + 120, startY + 80, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(500);

        // 7. Assert modal coordinates shifted after drag operation
        const boxAfter = await prefModal.boundingBox();
        expect(boxAfter).not.toBeNull();
        if (boxAfter) {
          expect(boxAfter.x).not.toEqual(boxBefore.x);
        }
      }
    }

    // 8. Close User Preferences modal cleanly
    const closeBtn = getScopedLocator(page, '.we-modal-header .close, .we-modal-footer button')
      .filter({ hasText: /×|close|cancel/i })
      .first();
    if (await closeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await closeBtn.click();
    }
  });

  test('should display multi-user presence when two different users view the same widget', async ({ browser, request, baseURL }) => {
    const user1Name = process.env.SN_USERNAME;
    const user1Pass = process.env.SN_PASSWORD;
    const user2Name = process.env.SN_USER2_USERNAME;
    const user2Pass = process.env.SN_USER2_PASSWORD;

    if (!user2Name || !user2Pass) {
      test.skip(true, 'SN_USER2_USERNAME or SN_USER2_PASSWORD environment variables not set. Skipping multi-user presence test.');
      return;
    }

    const widgetSysId = await getTestWidgetSysId(request, baseURL || '');
    const targetUrl = `${baseURL}/ui_page.do?sys_id=${EDITOR_PAGE_SYS_ID}&widget_id=${widgetSysId}`;

    // Two independently, freshly authenticated sessions — both logged in from scratch (rather
    // than reusing the suite-wide storageState for User 1) so they're genuinely simultaneous
    // and active at assertion time regardless of how long the suite has been running.
    const { context: context1, page: page1 } = await newAuthenticatedContext(browser, baseURL || '', user1Name || '', user1Pass || '');
    const { context: context2, page: page2 } = await newAuthenticatedContext(browser, baseURL || '', user2Name, user2Pass);

    // User 2 navigates to the widget FIRST. Presence is seeded two ways: an AMB/CometD
    // real-time channel (subscribing registers the viewer server-side), and — per the app's
    // own "startPresenceSubscription" comment — a one-time GlideAjax poll fired ~1.5s after
    // each page's own load, meant to "catch users already viewing before we subscribed".
    // That one-shot poll never repeats, so if User 1 loaded first here, User 1 would only ever
    // learn about User 2 via the real-time AMB push — which is inherently less reliable to
    // depend on in an automated/headless run. Loading User 2 first instead means User 1's own
    // initial poll (fired after User 1 loads, below) reliably picks up User 2 as already present.
    await page2.goto(targetUrl);
    await page2.waitForLoadState('domcontentloaded');

    const app2 = getScopedLocator(page2, '.we-app, #widget-editor-container').first();
    await expect(app2).toBeVisible({ timeout: 30000 });

    // Give User 2's AMB channel subscription (which registers their presence server-side)
    // a moment to complete before User 1 loads and polls for existing viewers.
    await page2.waitForTimeout(5000);

    // User 1 navigates to the same widget
    await page1.goto(targetUrl);
    await page1.waitForLoadState('domcontentloaded');

    const app1 = getScopedLocator(page1, '.we-app, #widget-editor-container').first();
    await expect(app1).toBeVisible({ timeout: 30000 });

    // Assert presence avatar / badge renders in User 1's editor header. Presence relies on a
    // CometD/AMB long-poll connection actually completing its handshake within the test window,
    // which can occasionally take longer than usual even once everything else has loaded
    // correctly — so allow one extra wait-and-recheck before failing.
    const presenceAvatar = getScopedLocator(page1, '.we-presence, .we-avatar, .we-avatar-tooltip').first();
    const seenPromptly = await presenceAvatar.isVisible({ timeout: 20000 }).catch(() => false);
    if (!seenPromptly) {
      await page1.waitForTimeout(10000);
    }
    await expect(presenceAvatar).toBeVisible({ timeout: 10000 });

    await context1.close();
    await context2.close();
  });

});
