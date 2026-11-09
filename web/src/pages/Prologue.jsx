// pages/Prologue.jsx: an innocent ledger line that is really a date
// (Transform FPE, FF1). The motion: the digits re-settle into the date.
import { useState } from 'react';
import { Wand2 } from 'lucide-react';
import { call } from '../api.js';
import { useAction, useResource } from '../hooks.js';
import { remember, useStory } from '../story.js';
import { useAuth, ErrorNotice, SignInNotice, Mono } from '../components/ui.jsx';
import { ActHero, Riddle, Said, Refusal } from '../components/codex.jsx';

function Digits({ value, settle }) {
  return (
    <span className={`digits${settle ? ' digits--settle' : ''}`} data-value={value}>
      <span className="sr-only">{value}</span>
      {[...value].map((ch, i) => (
        <span key={`${i}-${ch}`} className={`digit digit--${i}`} aria-hidden="true">
          {ch}
        </span>
      ))}
    </span>
  );
}

export default function Prologue() {
  const me = useAuth();
  const story = useStory();
  const codex = useResource('codex', '/api/codex');
  const [res, setRes] = useState(null);
  const decode = useAction(async () => {
    const r = await call('Decode the manuscript', '/api/prologue/decode', { method: 'POST' });
    setRes(r);
    if (r.reveal) remember({ prologue: { date: r.reveal.date, text: r.reveal.text } });
    return r;
  });
  const riddle = res?.reveal?.text || story.prologue?.text;
  const date = res?.reveal?.date || story.prologue?.date;
  const manuscript = res?.manuscript || codex.data?.stage?.manuscript?.value || '····-··-··';
  return (
    <>
      <ActHero number="Prologue" title="The Manuscript" lede="An old ledger, one line among hundreds. Same shape as every other entry. Vault knows what it really says.">
        {date ? <Riddle text={riddle} unfold label="Written beneath the date" /> : <p className="codex-hero__hint">Decode the line to find the question.</p>}
      </ActHero>
      {!me.signedIn && <SignInNotice />}
      <section className="vg-card stack manuscript" aria-labelledby="ms-h">
        <div className="card-head">
          <h3 id="ms-h">Ledger, folio 37</h3>
          <span className="card-sub">
            transformation <Mono>manuscript</Mono>, role <Mono>codex-scribe</Mono>, FF1, tweak inside Vault
          </span>
        </div>
        <div className="ledger-line">
          <span className="ledger-line__label">Reference</span>
          {date ? <Digits value={date} settle /> : <Digits value={manuscript} />}
        </div>
        {date && (
          <p className="explain">
            The encoded line <Mono>{manuscript}</Mono> kept its format: four digits, two, two. Format-preserving encryption; only a token allowed on <Mono>transform/decode/codex-scribe</Mono> reads it.
          </p>
        )}
        <div className="actions">
          <button type="button" className="primary-button" onClick={() => decode.run()} disabled={decode.busy || !me.signedIn}>
            <Wand2 size={14} aria-hidden="true" /> {decode.busy ? 'Asking Vault…' : 'Decode'}
          </button>
          {date && (
            <a className="secondary-button" href="#/act-1">
              Answer the riddle
            </a>
          )}
        </div>
        <ErrorNotice error={decode.error} title="Decode" />
        {res && res.outcome !== 'decoded' && <Refusal v={res.vault} />}
        <Said v={res?.vault} />
      </section>
    </>
  );
}
