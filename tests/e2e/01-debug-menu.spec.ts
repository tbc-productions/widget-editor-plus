import { test, expect } from '@playwright/test';

test.describe('Widget Editor+ Right-Click Debug Menu', () => {
  const pageId = 'e2e_widget_editor_test';
  const portalSuffix = (process.env.SN_PORTAL_SUFFIX || 'sp').replace(/^\/+|\/+$/g, '');

  test.beforeEach(async ({ page, baseURL }) => {
    // Navigate to the seeded E2E Service Portal page using configured portal URL suffix
    await page.goto(`${baseURL}/${portalSuffix}?id=${pageId}`);
    await page.waitForLoadState('domcontentloaded');
  });

  test('should render expanded test widget on the Service Portal', async ({ page }) => {
    // Assert expanded test widget container and title render on the page
    const widgetHeading = page.locator('.e2e-widget-title, .e2e-test-widget h1, .e2e-test-widget h2').first();
    await expect(widgetHeading).toBeVisible({ timeout: 20000 });
  });

  test('should open debug menu on Ctrl + Right-Click inside test widget', async ({ page }) => {
    const targetContent = page.locator('.e2e-content-area, .e2e-interactive-box, .e2e-test-widget').first();
    await expect(targetContent).toBeVisible({ timeout: 20000 });
    
    // Simulate Ctrl + Right-Click inside the widget
    await targetContent.click({ button: 'right', modifiers: ['Control'] });

    // Assert the popped-up context menu (or injected menu items) is visible on screen
    const contextMenuItem = page.locator('a.sp-context-menu-padding:visible, ul.dropdown-menu:visible, button[data-we-cog]:visible').first();
    await expect(contextMenuItem).toBeVisible({ timeout: 15000 });
  });

  test('should open Preferences modal when preference cog icon is clicked', async ({ page }) => {
    const targetContent = page.locator('.e2e-content-area, .e2e-interactive-box, .e2e-test-widget').first();
    await expect(targetContent).toBeVisible({ timeout: 20000 });

    // 1. Trigger Debug Menu on Ctrl + Right-Click
    await targetContent.click({ button: 'right', modifiers: ['Control'] });

    // 2. Locate and click the Preferences Cog Button (button[data-we-cog="1"] or title "Debug menu preferences")
    const cogButton = page.locator('button[data-we-cog="1"]:visible, button[title="Debug menu preferences"]:visible, .icon-cog:visible').first();
    await expect(cogButton).toBeVisible({ timeout: 15000 });
    await cogButton.click();

    // 3. Assert preferences modal dialog opens and is visible on screen
    const dialog = page.locator('dialog.we-prefs-dialog:visible, .we-prefs-modal:visible, .modal-title:has-text("Debug menu preferences"):visible').first();
    await expect(dialog).toBeVisible({ timeout: 15000 });
  });

  test('should show a generation-time indicator on the menu header reflecting widget load time', async ({ page }) => {
    const targetContent = page.locator('.e2e-content-area, .e2e-interactive-box, .e2e-test-widget').first();
    await expect(targetContent).toBeVisible({ timeout: 20000 });

    await targetContent.click({ button: 'right', modifiers: ['Control'] });

    const header = page.locator('.we-menu-header.bg-primary').first();
    await expect(header).toBeVisible({ timeout: 15000 });

    const timingIndicator = header.locator('.we-timing-bars');
    await expect(timingIndicator).toBeVisible({ timeout: 15000 });
    await expect(timingIndicator).toHaveAttribute('data-we-tooltip', /Server round-trip:.*Script execution:.*Client render:/s);
    await timingIndicator.hover();
    await expect(page.locator('.we-tooltip--visible')).toContainText('Server round-trip:');
  });

  test('should hide the generation-time indicator when disabled in Preferences', async ({ page }) => {
    const targetContent = page.locator('.e2e-content-area, .e2e-interactive-box, .e2e-test-widget').first();
    await expect(targetContent).toBeVisible({ timeout: 20000 });

    // 1. Open the debug menu and preferences dialog
    await targetContent.click({ button: 'right', modifiers: ['Control'] });
    const cogButton = page.locator('button[data-we-cog="1"]:visible').first();
    await expect(cogButton).toBeVisible({ timeout: 15000 });
    await cogButton.click();

    const dialog = page.locator('dialog.we-prefs-dialog:visible').first();
    await expect(dialog).toBeVisible({ timeout: 15000 });

    // 2. Turn off "Show generation-time indicator" and save.
    // The checkbox itself is visually hidden (opacity:0, 0x0) behind a styled
    // track, so toggle via the associated <label for="..."> instead of the input.
    const toggleInput = dialog.locator('#pref_showTimingIndicators');
    const toggleLabel = dialog.locator('label.we-toggle[for="pref_showTimingIndicators"]');
    await expect(toggleInput).toBeChecked();
    await toggleLabel.click();
    await expect(toggleInput).not.toBeChecked();
    await dialog.locator('.modal-footer button.btn-primary').click();
    await expect(dialog).toBeHidden({ timeout: 15000 });

    // 3. Re-open the debug menu and confirm the indicator is gone
    await targetContent.click({ button: 'right', modifiers: ['Control'] });
    const header = page.locator('.we-menu-header.bg-primary').first();
    await expect(header).toBeVisible({ timeout: 15000 });
    await expect(header.locator('.we-timing-bars')).toHaveCount(0);

    // 4. Restore the default preference so later tests aren't affected
    const cogButton2 = page.locator('button[data-we-cog="1"]:visible').first();
    await cogButton2.click();
    const dialog2 = page.locator('dialog.we-prefs-dialog:visible').first();
    await expect(dialog2).toBeVisible({ timeout: 15000 });
    await dialog2.locator('label.we-toggle[for="pref_showTimingIndicators"]').click();
    await expect(dialog2.locator('#pref_showTimingIndicators')).toBeChecked();
    await dialog2.locator('.modal-footer button.btn-primary').click();
    await expect(dialog2).toBeHidden({ timeout: 15000 });
  });
});
