// pages/Ledger.jsx: the Epilogue. The audit logs of all three nodes, merged:
// every attempt, the interception, the approvals, the burn. Answers stay
// HMAC'd; a guess can only be confirmed. The motion: the timeline draws itself.
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { call } from '../api.js';
import { useAction, useResource } from '../hooks.js';
import { useAuth, ErrorNotice, SignInNotice, Loading, Mono, StatePill } from '../components/ui.jsx';
import { ActHero, Said, wink } from '../components/codex.jsx';

const ACT_LABEL = { prologue: 'Prologue', 'act-1': 'I', 'act-2': 'II', 'act-3': 'III', 'act-4': 'IV' };

export default function Ledger() {
  const me = useAuth();
  const l = useResource('ledger', '/api/ledger', { intervalMs: me.signedIn ? 5000 : 0 });
  const [who, setWho] = useState('');
  const [act, setAct] = useState('');
  const [guess, setGuess] = useState('');
  const [conf, setConf] = useState(null);
  const confirm = useAction(async (g) => {
    const r = await call('Ledger: was this answer tried?', '/api/ledger/confirm', { method: 'POST', body: { guess: g } });
    setConf({ guess: g, ...r });
    return r;
  });
  const events = useMemo(() => (l.data?.events || []).filter((e) => (!who || e.who === who) && (!act || e.act === act)), [l.data, who, act]);
  const people = [...new Set((l.data?.events || []).map((e) => e.who))].sort();

  return (
    <>
      <ActHero number="Epilogue" title="The Ledger" lede="The true story, replayed from the audit logs of all three nodes: who tried what, who opened the letter, who approved, when the map burned.">
        <p className="codex-hero__hint">{wink.ledger}</p>
      </ActHero>
      {!me.signedIn && <SignInNotice />}
      <section className="vg-card stack" aria-labelledby="confirm-h">
        <div className="card-head">
          <h3 id="confirm-h">Was this answer tried?</h3>
          <span className="card-sub">
            <Mono>sys/audit-hash/file</Mono>: the HMAC of the guess, compared with the HMAC'd contexts in the log
          </span>
        </div>
        <form
          className="answer-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (guess.trim()) confirm.run(guess);
          }}
        >
          <label className="form-field answer-form__field" htmlFor="guess">
            <span>A guess</span>
            <input id="guess" autoComplete="off" spellCheck={false} maxLength={64} value={guess} onChange={(e) => setGuess(e.target.value)} />
          </label>
          <button type="submit" className="primary-button" disabled={confirm.busy || !guess.trim()}>
            <Search size={14} aria-hidden="true" /> Confirm
          </button>
        </form>
        <ErrorNotice error={confirm.error} title="Confirm" />
        {conf && (
          <div className={`inline-notice ${conf.outcome === 'tried' ? 'ok' : 'info'}`} role="status">
            <strong>
              <Mono>{conf.guess}</Mono>: {conf.outcome}
            </strong>
            {conf.tried?.length > 0 && (
              <ul className="m-0">
                {conf.tried.map((t) => (
                  <li key={`${t.time}-${t.node}`}>
                    {new Date(t.time).toLocaleTimeString('en-GB')} by {t.who} on {t.node}: {t.kind}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <Said v={conf?.vault} />
      </section>
      <section className="vg-card stack" aria-labelledby="tl-h">
        <div className="card-head">
          <h3 id="tl-h">Timeline</h3>
          <span className="card-sub">{l.data ? `${events.length} of ${l.data.count} events since the stage was set` : ''}</span>
        </div>
        <div className="filters">
          <label className="form-field form-field--inline" htmlFor="f-who">
            <span>Persona</span>
            <select id="f-who" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">everyone</option>
              {people.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field form-field--inline" htmlFor="f-act">
            <span>Act</span>
            <select id="f-act" value={act} onChange={(e) => setAct(e.target.value)}>
              <option value="">every act</option>
              {Object.entries(ACT_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        {l.error && <ErrorNotice error={l.error} title="The ledger" />}
        {!l.data && !l.error && me.signedIn && <Loading label="Reading three audit logs…" />}
        {l.data && events.length === 0 && <p className="dim">Nothing yet: play an act.</p>}
        <ol className="ledger">
          {events.map((e, i) => (
            <li key={`${e.request_id}-${e.node}-${i}`} className={`ledger__event${e.ok ? '' : ' ledger__event--refused'}`}>
              <time className="ledger__time" dateTime={e.time}>
                {new Date(e.time).toLocaleTimeString('en-GB')}
              </time>
              <span className="ledger__node">{e.node}</span>
              <span className="ledger__act">{ACT_LABEL[e.act] || '–'}</span>
              <span className="ledger__who">{e.who}</span>
              <span className="ledger__kind">
                {e.kind}
                {e.error && <span className="dim"> · {e.error.replace(/^\d+ errors? occurred:\s*\*?\s*/, '')}</span>}
              </span>
              {e.ok ? <StatePill state="ok">ok</StatePill> : <StatePill state="denied">refused</StatePill>}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
