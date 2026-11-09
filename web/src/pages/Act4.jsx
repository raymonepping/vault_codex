// pages/Act4.jsx: the final message, then burning the map. Rotate, raise the
// minimum, and Act I's page can no longer be read; trim, and its key version
// no longer exists. The motion: the old pages fade to ash.
import { useState } from 'react';
import { Flame, History, Scissors } from 'lucide-react';
import { call } from '../api.js';
import { useAction, useResource } from '../hooks.js';
import { remember, useStory } from '../story.js';
import { useAuth, ErrorNotice, SignInNotice, Mono } from '../components/ui.jsx';
import { ActHero, Riddle, Said, Refusal, AnswerForm, wink } from '../components/codex.jsx';

function Versions({ info }) {
  if (!info || info.missing) return null;
  const all = Array.from({ length: info.latest_version }, (_, i) => i + 1);
  return (
    <ol className="versions" aria-label="Key versions of codex-clues">
      {all.map((v) => {
        const gone = !info.versions.includes(v);
        const ash = !gone && v < info.min_decryption_version;
        return (
          <li key={v} className={`version${ash ? ' version--ash' : ''}${gone ? ' version--gone' : ''}`}>
            <span className="version__n">v{v}</span>
            <span className="version__state">{gone ? 'trimmed' : ash ? 'ash' : 'readable'}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function Act4() {
  const me = useAuth();
  const story = useStory();
  const codex = useResource('codex', '/api/codex');
  const [res, setRes] = useState(null);
  const [ops, setOps] = useState(null);
  const answer = useAction(async (word) => {
    const r = await call('Act IV: an answer', '/api/act/4/answer', { method: 'POST', body: { answer: word } });
    setRes(r);
    if (r.reveal) remember({ 'act-4': r.reveal.text });
    return r;
  });
  const burn = useAction(async () => {
    const r = await call('Act IV: burn the map', '/api/act/4/burn', { method: 'POST' });
    setOps(r);
    remember({ burned: true });
    await codex.reload();
    return r;
  });
  const replay = useAction(async (word) => {
    const r = await call('Act IV: replay Act I', '/api/act/4/replay', { method: 'POST', body: { answer: word } });
    setOps(r);
    return r;
  });
  const trim = useAction(async () => {
    const r = await call('Act IV: sweep the ashes', '/api/act/4/trim', { method: 'POST' });
    setOps(r);
    await codex.reload();
    return r;
  });
  const final = res?.reveal?.text || story['act-4'];
  const key = codex.data?.keys?.['codex-clues'];
  const busy = burn.busy || replay.busy || trim.busy;
  return (
    <>
      <ActHero number="Act IV" title={final ? res?.reveal?.title || 'The Treasure' : 'Burning the Map'} lede={final ? null : 'One last page, and then the map that led here must stop working, on purpose.'}>
        {final ? <p className="final-message">{final}</p> : <Riddle text={story['act-3']} label="The question you carry" />}
      </ActHero>
      {!me.signedIn && <SignInNotice />}
      <section className="vg-card stack" aria-labelledby="a4-h">
        <div className="card-head">
          <h3 id="a4-h">The last page</h3>
          <span className="card-sub">
            <Mono>transit/decrypt/codex-clues</Mono>
          </span>
        </div>
        <AnswerForm id="act4-answer" label="Your answer to riddle III" onSubmit={(w) => answer.run(w)} busy={answer.busy} />
        <ErrorNotice error={answer.error} title="The last page" />
        {res && res.outcome !== 'opened' && <Refusal v={res.vault} wink={wink.act1} />}
        <Said v={res?.vault} />
      </section>
      <section className={`vg-card stack burn${story.burned ? ' burn--done' : ''}`} aria-labelledby="burn-h">
        <div className="card-head">
          <h3 id="burn-h">Burn the map</h3>
          <span className="card-sub">crypto-shredding by key version</span>
        </div>
        <Versions info={key} />
        <div className="actions">
          <button type="button" className="destructive-button" onClick={() => burn.run()} disabled={busy || !me.signedIn}>
            <Flame size={14} aria-hidden="true" /> Burn the map
          </button>
          <button type="button" className="destructive-button" onClick={() => trim.run()} disabled={busy || !key || key.min_decryption_version <= 1}>
            <Scissors size={14} aria-hidden="true" /> Trim: sweep the ashes
          </button>
        </div>
        <p className="explain">
          <strong>Burn:</strong> the Archivist rotates <Mono>codex-clues</Mono> and raises <Mono>min_decryption_version</Mono> to the new version: every older page is refused, but still exists. <strong>Trim:</strong> the older versions are deleted. That cannot be undone; <Mono>make stage-reset</Mono> stages a new map.
        </p>
        <AnswerForm id="act4-replay" label="Replay Act I with its answer" submitLabel="Replay Act I" onSubmit={(w) => replay.run(w)} busy={replay.busy} />
        <ErrorNotice error={burn.error || replay.error || trim.error} title="The map" />
        {ops?.outcome === 'ash' && <Refusal v={ops.vault} wink={wink.act4} />}
        {ops?.outcome === 'burned' && (
          <p className="inline-notice ok" role="status">
            {ops.already ? 'Already burned' : `Rotated to v${ops.latest_version}`}; Vault decrypts nothing older than v{ops.min_decryption_version}.
          </p>
        )}
        {ops?.outcome === 'trimmed' && (
          <p className="inline-notice ok" role="status">
            Trimmed: versions left {ops.versions?.join(', ')}.
          </p>
        )}
        {ops?.outcome === 'opened' && <p className="inline-notice warn">Act I still opened: the map is not burned yet.</p>}
        <Said v={ops?.vault} />
        <a className="secondary-button next-act" href="#/ledger">
          <History size={14} aria-hidden="true" /> The ledger
        </a>
      </section>
    </>
  );
}
