// pages/Act2.jsx: the sealed letter. A wrapped response can be opened once;
// whoever opens it first leaves the seal broken for everyone after. The
// motion: the wax seal cracks.
import { useEffect, useState } from 'react';
import { Mail, ShieldAlert, Send, RotateCcw } from 'lucide-react';
import { call } from '../api.js';
import { useAction, useResource } from '../hooks.js';
import { useStory } from '../hooks-story.js';
import { remember } from '../story.js';
import { useAuth, ErrorNotice, SignInNotice, Mono, StatePill } from '../components/ui.jsx';
import { ActHero, Riddle, Said, Refusal, AnswerForm, wink } from '../components/codex.jsx';

function useCountdown(letter) {
  const [left, setLeft] = useState(null);
  useEffect(() => {
    if (!letter?.creation_time) return undefined;
    const end = new Date(letter.creation_time).getTime() + letter.ttl * 1000;
    const tick = () => setLeft(Math.max(0, Math.round((end - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [letter]);
  return left;
}

function Seal({ state }) {
  return (
    <svg className={`seal seal--${state}`} viewBox="0 0 120 120" role="img" aria-label={`Wax seal: ${state}`}>
      <circle className="seal__wax" cx="60" cy="60" r="44" />
      <circle className="seal__ring" cx="60" cy="60" r="34" />
      <path className="seal__mark" d="M60 40l14 8v16l-14 8-14-8V48z" />
      <path className="seal__crack" d="M38 30l14 22-8 10 18 12-6 16 12 14" pathLength="100" />
    </svg>
  );
}

export default function Act2() {
  const me = useAuth();
  const story = useStory();
  const [letter, setLetter] = useState(null);
  const [seal, setSeal] = useState('none'); // none | intact | broken | delivered
  const [events, setEvents] = useState([]);
  const [answerRes, setAnswerRes] = useState(null);
  // The API holds the letter; after a reload the page asks it where things stand.
  const server = useResource('act2-state', '/api/act/2/state');
  useEffect(() => {
    if (server.data?.delivered && seal === 'none') setSeal('delivered');
  }, [server.data, seal]);
  const left = useCountdown(seal === 'intact' ? letter : null);
  const log = (title, r) => setEvents((e) => [{ n: e.length + 1, title, r }, ...e]);

  const issue = useAction(async () => {
    const r = await call('Act II: seal a letter', '/api/act/2/letter', { method: 'POST' });
    log('The Archivist seals a letter', r);
    if (r.outcome === 'sealed') {
      setLetter(r.letter);
      setSeal('intact');
    }
    return r;
  });
  const intercept = useAction(async () => {
    const r = await call('Act II: the Interceptor', '/api/act/2/intercept', { method: 'POST' });
    log('The Interceptor opens it first', r);
    if (r.outcome === 'intercepted') setSeal('broken');
    return r;
  });
  const deliver = useAction(async () => {
    const r = await call('Act II: the Courier', '/api/act/2/deliver', { method: 'POST' });
    log('The Courier receives it', r);
    setSeal(r.outcome === 'delivered' ? 'delivered' : 'broken');
    server.reload();
    return r;
  });
  const answer = useAction(async (word) => {
    const r = await call('Act II: an answer', '/api/act/2/answer', { method: 'POST', body: { answer: word } });
    setAnswerRes(r);
    if (r.reveal) remember({ 'act-2': r.reveal.text });
    return r;
  });
  const last = events[0]?.r;
  const opened = answerRes?.reveal?.text || story['act-2'];
  const busy = issue.busy || intercept.busy || deliver.busy;

  return (
    <>
      <ActHero number="Act II" title="The Sealed Letter" lede="The Archivist sends the next page in a letter that can be opened exactly once. The Interceptor gets there first. The seal shows it.">
        {opened ? <Riddle text={opened} unfold label="The letter reads" /> : <Riddle text={story['act-1']} label="The question you carry" />}
      </ActHero>
      {!me.signedIn && <SignInNotice />}
      <div className="grid-2">
        <section className="vg-card stack letter" aria-labelledby="letter-h">
          <div className="card-head">
            <h3 id="letter-h">The letter</h3>
            {seal === 'intact' && <StatePill state="info">sealed{left != null ? `, ${left}s left` : ''}</StatePill>}
            {seal === 'broken' && <StatePill state="denied">seal broken</StatePill>}
            {seal === 'delivered' && <StatePill state="ok">delivered</StatePill>}
          </div>
          <div className="letter__body">
            <Seal state={seal === 'broken' ? 'broken' : seal === 'none' ? 'none' : 'intact'} />
            <dl className="facts">
              <dt>Accessor</dt>
              <dd>{letter ? <Mono>{letter.accessor}</Mono> : '–'}</dd>
              <dt>Sealed at</dt>
              <dd>{letter ? new Date(letter.creation_time).toLocaleTimeString('en-GB') : '–'}</dd>
              <dt>Holds</dt>
              <dd>{letter ? <Mono>{letter.creation_path}</Mono> : '–'}</dd>
            </dl>
          </div>
          <div className="actions">
            <button type="button" className="primary-button" onClick={() => issue.run()} disabled={busy || !me.signedIn}>
              {seal === 'none' ? <Mail size={14} aria-hidden="true" /> : <RotateCcw size={14} aria-hidden="true" />} {seal === 'none' ? 'The Archivist seals a letter' : 'Ask the Archivist for a new letter'}
            </button>
            <button type="button" className="secondary-button" onClick={() => intercept.run()} disabled={busy || seal !== 'intact'}>
              <ShieldAlert size={14} aria-hidden="true" /> Interceptor opens it
            </button>
            <button type="button" className="secondary-button" onClick={() => deliver.run()} disabled={busy || seal === 'none' || seal === 'delivered'}>
              <Send size={14} aria-hidden="true" /> Courier receives it
            </button>
          </div>
          <ErrorNotice error={issue.error || intercept.error || deliver.error} title="Act II" />
          {last?.outcome === 'intercepted' && (
            <div className="inline-notice warn" role="status">
              <strong>The Interceptor holds a ciphertext:</strong> <Mono>{last.loot}</Mono>. Their own decrypt: Vault said HTTP {last.attempt?.status} <code>{last.attempt?.errors?.[0]}</code>
            </div>
          )}
          {last?.outcome === 'broken' && <Refusal v={last.vault} wink={wink.act2} />}
        </section>
        <section className="vg-card stack" aria-labelledby="who-h">
          <div className="card-head">
            <h3 id="who-h">Who touched the letter</h3>
            <span className="card-sub">every call, as Vault answered it</span>
          </div>
          {events.length === 0 ? (
            <p className="dim">Nothing yet.</p>
          ) : (
            <ol className="touch-list">
              {events.map((e) => (
                <li key={e.n}>
                  <strong>{e.title}</strong>
                  <Said v={e.r.vault} title={`${e.r.vault?.method} ${e.r.vault?.path}`} />
                </li>
              ))}
            </ol>
          )}
          <p className="explain">The ledger has it too: the Epilogue names whoever unwrapped first.</p>
        </section>
      </div>
      <section className="vg-card stack" aria-labelledby="a2-h">
        <div className="card-head">
          <h3 id="a2-h">Read the letter</h3>
          <span className="card-sub">the ciphertext the Courier delivered, decrypted with the answer to riddle I</span>
        </div>
        <AnswerForm
          id="act2-answer"
          label="Your answer to riddle I"
          onSubmit={(w) => answer.run(w)}
          busy={answer.busy}
          disabled={seal !== 'delivered' && !opened}
          hint={seal === 'delivered' || opened ? null : seal === 'broken' ? 'The seal is broken: press "Ask the Archivist for a new letter", then "Courier receives it" (within its TTL).' : 'First: the Archivist seals a letter, then the Courier receives it (within its TTL).'}
        />
        <ErrorNotice error={answer.error} title="The letter" />
        {answerRes && answerRes.outcome !== 'opened' && <Refusal v={answerRes.vault} wink={wink.act1} />}
        <Said v={answerRes?.vault} />
        {opened && (
          <a className="secondary-button next-act" href="#/act-3">
            On to the council
          </a>
        )}
      </section>
    </>
  );
}
