// pages/Act1.jsx: the answer is the derivation context of a Transit key.
// No code checks it: Vault either decrypts or it does not. The motion: the
// riddle page unfolds.
import { useState } from 'react';
import { call } from '../api.js';
import { useAction } from '../hooks.js';
import { remember, useStory } from '../story.js';
import { useAuth, ErrorNotice, SignInNotice, Mono } from '../components/ui.jsx';
import { ActHero, Riddle, Said, Refusal, AnswerForm, Attempts, wink } from '../components/codex.jsx';

export default function Act1() {
  const me = useAuth();
  const story = useStory();
  const [last, setLast] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const answer = useAction(async (word) => {
    const r = await call('Act I: an answer', '/api/act/1/answer', { method: 'POST', body: { answer: word } });
    setLast(r);
    setAttempts((a) => [{ n: a.length + 1, answer: word, ok: r.outcome === 'opened', status: r.vault?.status, error: r.vault?.errors?.[0] }, ...a]);
    if (r.reveal) remember({ 'act-1': r.reveal.text });
    return r;
  });
  const opened = last?.reveal?.text || story['act-1'];
  return (
    <>
      <ActHero number="Act I" title="The Riddle" lede="Only the right answer opens the page. The page is a ciphertext; the answer is its context.">
        {opened ? <Riddle text={opened} unfold label="The page opens" /> : <Riddle text={story.prologue?.text} label="The question you carry" />}
        {!opened && !story.prologue && <p className="codex-hero__hint">Decode the manuscript first, or answer from memory.</p>}
      </ActHero>
      {!me.signedIn && <SignInNotice />}
      <section className="vg-card stack" aria-labelledby="a1-h">
        <div className="card-head">
          <h3 id="a1-h">Your answer</h3>
          <span className="card-sub">
            <Mono>transit/decrypt/codex-clues</Mono>, context = base64 of the answer (NFC, trimmed, lowercase)
          </span>
        </div>
        <AnswerForm id="act1-answer" label="In which land?" onSubmit={(w) => answer.run(w)} busy={answer.busy} />
        <ErrorNotice error={answer.error} title="Act I" />
        {last && last.outcome !== 'opened' && <Refusal v={last.vault} wink={wink.act1} />}
        <Attempts items={attempts} />
        <p className="explain codex-note">
          <strong>Context is not a password.</strong> A one-word answer falls to a dictionary in seconds. Here it shows the mechanism: a ciphertext bound to a context only that context opens.
        </p>
        <Said v={last?.vault} />
        {opened && (
          <a className="secondary-button next-act" href="#/act-2">
            On to the sealed letter
          </a>
        )}
      </section>
    </>
  );
}
