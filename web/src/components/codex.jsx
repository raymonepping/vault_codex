// components/codex.jsx: the pieces every act shares. Vault's answer first,
// the wink second (DESIGN.md, "Codex").
import { useState } from 'react';
import { ScrollText, KeyRound, CornerDownLeft } from 'lucide-react';
import { tidy, StatePill } from './ui.jsx';

// The hero: the page's one ink pane. The act's title, and the riddle the
// presenter carries into it (or the text Vault just revealed).
export function ActHero({ number, title, lede, children, id = 'hero-h' }) {
  return (
    <section className="vg-hero codex-hero" aria-labelledby={id}>
      <p className="codex-hero__number">{number}</p>
      <h2 id={id} className="hero-title codex-hero__title">
        {title}
      </h2>
      {lede && <p className="hero-lede">{lede}</p>}
      {children}
    </section>
  );
}

export function Riddle({ text, unfold = false, label = 'The riddle' }) {
  if (!text) return null;
  return (
    <figure className={`riddle${unfold ? ' riddle--unfold' : ''}`}>
      <figcaption className="riddle__label">{label}</figcaption>
      <blockquote className="riddle__text">{text}</blockquote>
    </figure>
  );
}

// "Vault said" for one call: method, path, who, status, errors verbatim.
export function Said({ v, title = 'Vault said', open = false }) {
  if (!v) return null;
  const ok = v.status >= 200 && v.status < 300;
  return (
    <details className="said" open={open}>
      <summary>
        <ScrollText size={14} aria-hidden="true" />
        <span>{title}</span>
        <span className={`said-status ${ok ? 'ok' : 'bad'}`}>HTTP {v.status}</span>
        <span className="said__as">as {v.as}</span>
      </summary>
      <dl className="facts said__facts">
        <dt>Call</dt>
        <dd>
          <code className="mono">
            {v.method} {v.path}
          </code>
        </dd>
        <dt>As</dt>
        <dd>{v.as}</dd>
        <dt>Node</dt>
        <dd>{v.node || '–'}</dd>
        {v.errors?.length > 0 && (
          <>
            <dt>Errors</dt>
            <dd>
              <ul className="vault-errors">
                {v.errors.map((e) => (
                  <li key={e}>
                    <code>{tidy(e)}</code>
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
        {v.wrap_info && (
          <>
            <dt>Wrapped</dt>
            <dd>
              accessor <code className="mono">{v.wrap_info.accessor}</code>, TTL {v.wrap_info.ttl}s
            </dd>
          </>
        )}
        <dt>Request</dt>
        <dd>
          <code className="mono">{v.request_id || '–'}</code>
        </dd>
      </dl>
    </details>
  );
}

// Vault's refusal, verbatim, then the wink.
export function Refusal({ v, wink }) {
  if (!v) return null;
  return (
    <div className="inline-notice error refusal" role="alert">
      <strong>Vault refused (HTTP {v.status})</strong>
      <ul className="vault-errors">
        {(v.errors?.length ? v.errors : ['(no error text)']).map((e) => (
          <li key={e}>
            Vault said: <code>{tidy(e)}</code>
          </li>
        ))}
      </ul>
      {wink && <p className="wink">{wink}</p>}
    </div>
  );
}

export function AnswerForm({ label, onSubmit, busy, submitLabel = 'Answer', id, disabled = false, hint }) {
  const [value, setValue] = useState('');
  return (
    <form
      className="answer-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSubmit(value);
      }}
    >
      <label className="form-field answer-form__field" htmlFor={id}>
        <span>{label}</span>
        <input id={id} name="answer" autoComplete="off" spellCheck={false} maxLength={64} value={value} onChange={(e) => setValue(e.target.value)} disabled={disabled} aria-describedby={hint ? `${id}-hint` : undefined} />
      </label>
      <button type="submit" className="primary-button" disabled={disabled || busy || !value.trim()}>
        <KeyRound size={14} aria-hidden="true" /> {busy ? 'Asking Vault…' : submitLabel}
        <CornerDownLeft size={12} aria-hidden="true" className="kbd-hint" />
      </button>
      {hint && (
        <p id={`${id}-hint`} className="answer-form__hint">
          {hint}
        </p>
      )}
    </form>
  );
}

// Every attempt this page made, with Vault's status.
export function Attempts({ items }) {
  if (!items.length) return null;
  return (
    <ol className="attempts" aria-label="Attempts">
      {items.map((a) => (
        <li key={a.n} className="attempts__item">
          <code className="mono">{a.answer}</code>
          {a.ok ? <StatePill state="ok">opened</StatePill> : <StatePill state="denied">HTTP {a.status}</StatePill>}
          <span className="dim">{a.error ? tidy(a.error) : ''}</span>
        </li>
      ))}
    </ol>
  );
}

export const wink = {
  act1: 'Context is not a password. But tonight it is the only key you have.',
  act2: 'The seal is broken. The Interceptor stole a locked box.',
  act3one: 'One Keyholder is an opinion. Two are a council.',
  act3self: 'No Keyholder can vouch for their own request.',
  act4: 'The old map is ash.',
  ledger: 'The ledger never wrote down the answers. It can still confirm them.',
};
