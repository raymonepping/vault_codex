# DESIGN.md: vault_codex console

The console follows **Vault daylight glass**, the house system for every Vault
project (canonical implementation: Arcanium; contract: the `vault-ui-design`
skill). Light frosted panes, black ink, one dark ink hero per page, strong
status colours that hold WCAG AA. This file states only what vault_codex adds
or decides on top of it.

## Stack

- React 19 + Vite 8 + Tailwind v4 (`web/`), served by nginx over TLS 1.3 with
  the lab CA's listener certificate (`make gen-certs`).
- `web/src/styles/vault-glass.css` is the skill's file, unchanged;
  `shell.css` is vault_crypto's copy of the skill's (labels visually hidden
  below 1180 px instead of `display: none`, so accessible names match).
  Shared layout lives in `web/src/styles/app.css`; the Codex's own pieces
  (riddle type, the six motions, path, keyholes, versions, ledger, layers)
  in `web/src/styles/codex.css`, tokens only.
- Fonts: Hanken Grotesk Variable and JetBrains Mono Variable via
  `@fontsource-variable`, bundled, no external requests.
- Icons: `lucide-react`. No emoji.
- CSP `style-src 'self'`: no inline styles.

## Codex

- **One ink hero per page** carries the act and the riddle the presenter
  carries into it, or the text Vault just revealed. Riddle text is at least
  28px at 1440x900 (`clamp(22px, 2.1vw, 34px)`), the final message larger.
  Everything else is light glass with black ink.
- **Colour only for state:** opened and approved (green), refused and burned
  (red, slate for ash), held (amber), staged and info (blue).
- **Vault first, the wink second.** Every refusal shows Vault's status and
  error verbatim (`Refusal`), then one line of story. Every action carries a
  "Vault said" block (call, who, node, errors, request id; never a token),
  and the topbar drawer lists every answer of the session.
- **Copy voice:** short, a little theatrical, never cute about failure.
  The winks are in `web/src/components/codex.jsx` (`wink`).
- **One motion per act**, CSS or SVG only, all off under
  `prefers-reduced-motion`: the manuscript digits re-settle into a date
  (Prologue); the riddle page unfolds (I); the wax seal cracks (II); three
  keyholes fill (III); the old key versions fade to ash, then disappear (IV);
  the ledger's timeline draws itself (Epilogue).
- **No answer in the console.** The browser never receives an answer or an
  act plaintext before Vault decrypted it; e2e `served.spec.ts` scans the
  bundle. Revealed texts are kept in `sessionStorage` only so the next act's
  hero can show the riddle the presenter carries.
- No real people or brands in the art; Leonardo appears only through riddle
  P's words.

## Pages

| Route | Hero | What the page does |
| --- | --- | --- |
| `#/codex` | Every puzzle is a real Vault control. | the path with state per act, the cast, the key versions, "Before the show" |
| `#/prologue` | The Manuscript | decode the ledger line (FF1), the date settles, riddle P |
| `#/act-1` | The Riddle | the answer as derivation context; attempts with Vault's status |
| `#/act-2` | The Sealed Letter | seal, intercept, deliver, reissue; the TTL counts down; who touched it |
| `#/act-3` | The Council | request, three keyholes, approve as each, open; a Keyholder tries alone |
| `#/act-4` | Burning the Map | the final message; burn, replay (ash), trim; key versions as pages |
| `#/ledger` | The Ledger | merged audit timeline (node badge), filters, "Was this answer tried?" |
| `#/layers` | Terraform builds the house. Ansible decorates it. | phases in run order with tool and evidence, the five gates |

Keyboard: left and right arrows move between pages (not while typing), `?`
lists the shortcuts, Enter submits an answer, Escape closes a drawer.

## Verification

`make test-ui`: the whole show at 1440x900 and at 390x844, the keyboard, the
served headers and bundle, and axe (WCAG 2.1 AA, zero violations) on every
page at both sizes and signed out. `make screenshots` refreshes
`docs/screenshots/` (desktop and phone per page).
