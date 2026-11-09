// The whole show through the console, against the live stack: every act,
// each way it is supposed to fail, Vault's answer in the drawer. Nothing is
// mocked. Runs once at 1440x900 and once at 390x844, a fresh stage between.
import { test, expect, type Page } from '@playwright/test';
import { answer, plaintext, stageReset } from '../helpers/env';

test.describe.configure({ mode: 'serial' });

async function submit(page: Page, id: string, word: string) {
  await page.locator(`#${id}`).fill(word);
  await page.locator(`#${id}`).press('Enter');
}

async function show(page: Page) {
  // Prologue
  await page.goto('/#/prologue');
  await page.getByRole('button', { name: 'Decode' }).click();
  await expect(page.locator('.digits--settle')).toHaveAttribute('data-value', plaintext('prologue'));
  await expect(page.locator('.riddle__text')).toBeVisible();

  // Act I: a wrong answer, then the right one typed sloppily
  await page.getByRole('link', { name: 'Answer the riddle' }).click();
  await submit(page, 'act1-answer', 'france');
  await expect(page.locator('.refusal')).toContainText('message authentication failed');
  await expect(page.locator('.refusal .wink')).toContainText('Context is not a password');
  await submit(page, 'act1-answer', `  ${answer('prologue').toUpperCase()} `);
  await expect(page.locator('.vg-hero .riddle__text')).toHaveText(plaintext('act-1'));

  // Act II: intercepted, broken, reissued, delivered, read
  await page.goto('/#/act-2');
  // A second show in the same session finds the API still holding a delivered letter.
  await page.getByRole('button', { name: /The Archivist seals a letter|Ask the Archivist for a new letter/ }).click();
  await expect(page.getByText(/sealed, \d+s left/)).toBeVisible();
  await page.getByRole('button', { name: 'Interceptor opens it' }).click();
  await expect(page.getByText('The Interceptor holds a ciphertext')).toBeVisible();
  await page.getByRole('button', { name: 'Courier receives it' }).click();
  await expect(page.locator('.refusal')).toContainText('wrapping token is not valid or does not exist');
  await expect(page.locator('.seal--broken')).toBeVisible();
  await page.getByRole('button', { name: 'Ask the Archivist for a new letter' }).click();
  await page.getByRole('button', { name: 'Courier receives it' }).click();
  await expect(page.getByText('delivered', { exact: true })).toBeVisible();
  await submit(page, 'act2-answer', answer('act-1'));
  await expect(page.locator('.vg-hero .riddle__text')).toHaveText(plaintext('act-2'));

  // Act III: one approval is an opinion, two are a council
  await page.goto('/#/act-3');
  await submit(page, 'act3-answer', answer('act-2'));
  await expect(page.getByText('held by Vault')).toBeVisible();
  await page.getByRole('button', { name: 'The Seeker tries to approve' }).click();
  await expect(page.locator('.refusal')).toContainText('permission denied');
  await page.getByRole('button', { name: 'Approve as Amber' }).click();
  await page.getByRole('button', { name: 'Open the cryptex' }).click();
  await expect(page.locator('.refusal')).toContainText('Request needs further authorization');
  await page.getByRole('button', { name: 'Approve as Ivory' }).click();
  await expect(page.locator('.keyhole--filled')).toHaveCount(2);
  await page.getByRole('button', { name: 'Open the cryptex' }).click();
  await expect(page.locator('.vg-hero .riddle__text')).toHaveText(plaintext('act-3'));

  // Act III, the EGP: a Keyholder cannot vouch for their own request
  await submit(page, 'act3-self', answer('act-2'));
  await expect(page.getByText(/requested by\s*Onyx/)).toBeVisible();
  await page.getByRole('button', { name: 'Approve as Onyx' }).click();
  await page.getByRole('button', { name: 'Approve as Amber' }).click();
  await page.getByRole('button', { name: 'Open the cryptex' }).click();
  await expect(page.locator('.refusal')).toContainText("onyx's own");

  // Act IV: the final message, the burn, the ash, the trim
  await page.goto('/#/act-4');
  await submit(page, 'act4-answer', answer('act-3'));
  await expect(page.locator('.final-message')).toHaveText(plaintext('act-4'));
  await page.getByRole('button', { name: 'Burn the map' }).click();
  await expect(page.getByText(/Rotated to v2/)).toBeVisible();
  await submit(page, 'act4-replay', answer('prologue'));
  await expect(page.locator('.refusal')).toContainText('too old');
  await expect(page.locator('.refusal .wink')).toContainText('The old map is ash');
  await page.getByRole('button', { name: 'Trim: sweep the ashes' }).click();
  await expect(page.getByText('Trimmed: versions left 2')).toBeVisible();
  await expect(page.locator('.version--gone')).toHaveCount(1);

  // Epilogue: the ledger names the Interceptor and confirms a guess
  await page.goto('/#/ledger');
  await expect(page.locator('.ledger__event', { hasText: 'letter opened' }).filter({ hasText: 'interceptor' }).first()).toBeVisible();
  await page.locator('#guess').fill('france');
  await page.locator('#guess').press('Enter');
  await expect(page.getByText(/france: tried/)).toBeVisible();
  await page.locator('#guess').fill('paris');
  await page.locator('#guess').press('Enter');
  await expect(page.getByText(/paris: never tried/)).toBeVisible();

  // The drawer: every answer, never a token
  await page.getByRole('button', { name: /Vault said/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Vault said' });
  await expect(drawer).toContainText('transit/decrypt/codex-clues as seeker');
  await expect(drawer).not.toContainText(/hv[sb]\./);
}

test('the show at 1440x900', async ({ page }) => {
  await show(page);
});

test('the show at 390x844', async ({ page }) => {
  stageReset();
  await page.setViewportSize({ width: 390, height: 844 });
  await show(page);
});

test('keyboard: arrows move between acts, ? lists the shortcuts', async ({ page }) => {
  await page.goto('/#/prologue');
  await page.locator('body').press('ArrowRight');
  await expect(page).toHaveURL(/#\/act-1$/);
  await page.locator('body').press('ArrowLeft');
  await expect(page).toHaveURL(/#\/prologue$/);
  await page.locator('body').press('?');
  await expect(page.getByRole('dialog', { name: 'Keyboard' })).toBeVisible();
});

test('a stage reset makes a rehearsal tab forget what it solved', async ({ page }) => {
  await page.goto('/#/codex');
  await page.evaluate(() => sessionStorage.setItem('codex.story', JSON.stringify({ stagedAt: '2000-01-01T00:00:00Z', 'act-1': 'an old riddle' })));
  await page.reload();
  await expect(page.locator('.path__step--staged').first()).toBeVisible();
  await expect(page.getByText('solved here')).toHaveCount(0);
});
