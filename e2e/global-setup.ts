// global-setup.ts: fail fast, with the make target that fixes it, when the
// stack is not up; a fresh stage; then sign in once as the Seeker through the
// real Keycloak form and keep the session for every journey.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { labCaSpkiArg, stageReset, urls } from './helpers/env';
import { signIn } from './helpers/auth';

const CORE = ['vcdx-vault_s', 'vcdx-vault_1', 'vcdx-vault_2', 'vcdx-vault_3', 'vcdx-keycloak', 'vcdx-rotator', 'vcdx-vault_agent', 'vcdx-api', 'vcdx-web'];
export const STORAGE = path.join(__dirname, '.auth/seeker.json');

export default async function globalSetup(): Promise<void> {
  const running = execFileSync('podman', ['ps', '--filter', 'name=^vcdx-', '--format', '{{.Names}}'], { encoding: 'utf8' }).split('\n');
  const down = CORE.filter((c) => !running.includes(c));
  if (down.length) throw new Error(`not running: ${down.join(', ')}: run "make up" (or "make lab" on a fresh machine)`);
  const h = await (await fetch(`${urls.api}/api/health`)).json();
  if (!h.ok) throw new Error(`api /api/health is not ok: run "make doctor"`);
  stageReset();
  const browser = await chromium.launch({ args: [labCaSpkiArg()] });
  const page = await browser.newPage();
  await signIn(page, 'seeker');
  await page.context().storageState({ path: STORAGE });
  await browser.close();
}
