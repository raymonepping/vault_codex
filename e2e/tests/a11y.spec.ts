// WCAG 2.1 AA on every page, desktop and phone, after real data loaded.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGES = ['codex', 'prologue', 'act-1', 'act-2', 'act-3', 'act-4', 'ledger', 'layers'];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const summary = (r: { violations: { id: string; impact?: string | null; nodes: { target: unknown[] }[] }[] }) =>
  r.violations.map((v) => `${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);

for (const vp of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
  for (const id of PAGES) {
    test(`axe: ${id} (${vp.name})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`/#/${id}`);
      await expect(page.locator('.vg-hero')).toBeVisible();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
      const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(summary(r), summary(r).join('\n')).toEqual([]);
    });
  }
}

test('axe: codex (signed out)', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await page.goto('/#/codex');
  await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(summary(r), summary(r).join('\n')).toEqual([]);
  await ctx.close();
});
