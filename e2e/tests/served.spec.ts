// What the console serves: TLS 1.3 from the lab CA, a strict CSP, every page.
import { test, expect } from '@playwright/test';
import { servedHeaders, servedLeaf } from '../helpers/env';

test('TLS 1.3, certificate from the lab CA', async () => {
  const { protocol, cert } = await servedLeaf();
  expect(protocol).toBe('TLSv1.3');
  expect(cert.issuer.CN).toContain('Lab CA');
});

test('a Content-Security-Policy without unsafe-inline scripts', async () => {
  const h = await servedHeaders('/');
  const csp = String(h['content-security-policy']);
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toContain('unsafe-inline');
});

test('no answer or act plaintext in the served bundle', async ({ page }) => {
  await page.goto('/');
  const scripts = await page.locator('script[src]').evaluateAll((s) => s.map((x) => (x as HTMLScriptElement).src));
  const { codex } = await import('../helpers/env');
  for (const src of scripts) {
    const body = await page.evaluate((u) => fetch(u).then((r) => r.text()), src);
    for (const a of codex.acts) {
      if (a.answer) expect(new RegExp(`["'\\s]${a.answer}["'\\s]`, 'i').test(body), `answer of ${a.id}`).toBe(false);
      expect(body.includes(a.plaintext), `plaintext of ${a.id}`).toBe(false);
    }
  }
});
