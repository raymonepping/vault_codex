// @shots: refresh docs/screenshots (make screenshots). Not part of make test-ui.
// Plays enough of the show that each page has something to show.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { ROOT, answer } from '../helpers/env';

const OUT = path.join(ROOT, 'docs/screenshots');
test.describe.configure({ mode: 'serial' });
// Full-page captures paint sticky elements mid-page; unstick them (docs only).
test.use({ bypassCSP: true });

const shoot = async (page: import('@playwright/test').Page, id: string) => {
  for (const vp of [{ n: 'desktop', width: 1440, height: 900 }, { n: 'phone', width: 390, height: 844 }]) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(700);
    await page.addStyleTag({ content: '.topbar-wrap{position:static!important}.vg-sidebar{position:static!important;height:auto!important;min-height:100%!important}.skip-link{display:none!important}' });
    await page.screenshot({ path: path.join(OUT, `${id}${vp.n === 'phone' ? '-phone' : ''}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
};

test('@shots the show', async ({ page }) => {
  await page.goto('/#/codex');
  await page.waitForLoadState('networkidle');
  await shoot(page, 'codex');
  await page.goto('/#/prologue');
  await page.getByRole('button', { name: 'Decode' }).click();
  await expect(page.locator('.digits--settle')).toBeVisible();
  await shoot(page, 'prologue');
  await page.goto('/#/act-1');
  await page.locator('#act1-answer').fill('france');
  await page.locator('#act1-answer').press('Enter');
  await expect(page.locator('.refusal')).toBeVisible();
  await shoot(page, 'act-1');
  await page.goto('/#/act-2');
  await page.getByRole('button', { name: 'The Archivist seals a letter' }).click();
  await page.getByRole('button', { name: 'Interceptor opens it' }).click();
  await page.getByRole('button', { name: 'Courier receives it' }).click();
  await expect(page.locator('.seal--broken')).toBeVisible();
  await shoot(page, 'act-2');
  await page.goto('/#/act-3');
  await page.locator('#act3-answer').fill(answer('act-2'));
  await page.locator('#act3-answer').press('Enter');
  await page.getByRole('button', { name: 'Approve as Amber' }).click();
  await page.getByRole('button', { name: 'Open the cryptex' }).click();
  await expect(page.locator('.refusal')).toBeVisible();
  await shoot(page, 'act-3');
  await page.goto('/#/act-4');
  await page.getByRole('button', { name: 'Burn the map' }).click();
  await page.locator('#act4-replay').fill(answer('prologue'));
  await page.locator('#act4-replay').press('Enter');
  await expect(page.locator('.refusal')).toBeVisible();
  await shoot(page, 'act-4');
  await page.goto('/#/ledger');
  await expect(page.locator('.ledger__event').first()).toBeVisible();
  await shoot(page, 'ledger');
  await page.goto('/#/layers');
  await expect(page.locator('.phase').first()).toBeVisible();
  await shoot(page, 'layers');
});
