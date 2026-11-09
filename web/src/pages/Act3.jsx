// pages/Act3.jsx: the council. The cryptex decrypt is held by a control group
// until two Keyholders approve; an EGP makes "two" mean two people other than
// the one who asked. The motion: three keyholes fill.
import { useEffect, useState } from 'react';
import { KeyRound, LockOpen, UserCheck } from 'lucide-react';
import { call } from '../api.js';
import { useAction, useResource } from '../hooks.js';
import { remember, useStory } from '../story.js';
import { useAuth, ErrorNotice, SignInNotice, Mono, StatePill } from '../components/ui.jsx';
import { ActHero, Riddle, Said, Refusal, AnswerForm, wink } from '../components/codex.jsx';

function Keyhole({ name, approved }) {
  return (
    <svg className={`keyhole${approved ? ' keyhole--filled' : ''}`} viewBox="0 0 48 64" role="img" aria-label={`${name}: ${approved ? 'approved' : 'not yet'}`}>
      <rect className="keyhole__plate" x="2" y="2" width="44" height="60" rx="10" />
      <path className="keyhole__hole" d="M24 14a8 8 0 0 1 4.5 14.6L31 48H17l2.5-19.4A8 8 0 0 1 24 14z" />
    </svg>
  );
}

export default function Act3() {
  const me = useAuth();
  const story = useStory();
  const codex = useResource('codex', '/api/codex');
  const keyholders = codex.data?.codex?.keyholders || ['amber', 'ivory', 'onyx'];
  const cast = Object.fromEntries((codex.data?.codex?.cast || []).map((p) => [p.user, p.persona]));
  const [held, setHeld] = useState(null);
  const [status, setStatus] = useState(null);
  const [res, setRes] = useState(null);
  const [selfAs, setSelfAs] = useState('onyx');

  const refresh = async () => {
    const s = await call('Act III: council status', '/api/act/3/status', { quiet: true });
    setStatus(s);
    return s;
  };
  // Live status every 3s while a request is held.
  useEffect(() => {
    if (!held) return undefined;
    const t = setInterval(() => refresh().catch(() => {}), 3000);
    return () => clearInterval(t);
  }, [held]);

  const request = useAction(async ({ answer, as }) => {
    const r = await call('Act III: ask the council', '/api/act/3/request', { method: 'POST', body: { answer, ...(as ? { as } : {}) } });
    setRes(r);
    if (r.outcome === 'held') {
      setHeld({ requester: r.requester, accessor: r.accessor });
      await refresh();
    }
    return r;
  });
  const approve = useAction(async (k) => {
    const r = await call(`Act III: ${k} approves`, '/api/act/3/approve', { method: 'POST', body: { keyholder: k } });
    setRes(r);
    await refresh();
    return r;
  });
  const open = useAction(async () => {
    const r = await call('Act III: open the cryptex', '/api/act/3/open', { method: 'POST' });
    setRes(r);
    if (r.reveal) {
      remember({ 'act-3': r.reveal.text });
      setHeld(null);
      setStatus(null);
    }
    return r;
  });
  const approvedBy = status?.authorizations || [];
  const opened = res?.reveal?.text || story['act-3'];
  const busy = request.busy || approve.busy || open.busy;
  const err = request.error || approve.error || open.error;

  return (
    <>
      <ActHero number="Act III" title="The Council" lede="The last riddle lies in a cryptex. Vault holds the request until two of the three Keyholders approve it.">
        {opened ? <Riddle text={opened} unfold label="The cryptex opens" /> : <Riddle text={story['act-2']} label="The question you carry" />}
      </ActHero>
      {!me.signedIn && <SignInNotice />}
      <section className="vg-card stack" aria-labelledby="ask-h">
        <div className="card-head">
          <h3 id="ask-h">Ask the council</h3>
          <span className="card-sub">
            <Mono>transit/decrypt/codex-cryptex</Mono>, control group <Mono>council</Mono>, EGP <Mono>codex-council-not-yourself</Mono>
          </span>
        </div>
        <AnswerForm id="act3-answer" label="Your answer to riddle II" submitLabel="Request the cryptex" onSubmit={(w) => request.run({ answer: w })} busy={request.busy} />
        {held && (
          <p className="council-held" role="status">
            <StatePill state={status?.approved ? 'ok' : 'warn'}>{status?.approved ? 'approved' : 'held by Vault'}</StatePill> requested by <strong>{cast[held.requester] || held.requester}</strong>, accessor <Mono>{held.accessor}</Mono>
          </p>
        )}
      </section>
      <section className="vg-card stack" aria-labelledby="kh-h">
        <div className="card-head">
          <h3 id="kh-h">The Keyholders</h3>
          <span className="card-sub">
            {approvedBy.length} of {codex.data?.codex?.council?.approvals ?? 2} approvals counted by Vault
          </span>
        </div>
        <div className="keyholders">
          {keyholders.map((k) => (
            <div key={k} className="keyholder vg-tile">
              <Keyhole name={cast[k] || k} approved={approvedBy.includes(k)} />
              <span className="keyholder__name">{cast[k] || k}</span>
              <button type="button" className="secondary-button" onClick={() => approve.run(k)} disabled={busy || !held || approvedBy.includes(k)}>
                <UserCheck size={14} aria-hidden="true" /> Approve as {cast[k] || k}
              </button>
            </div>
          ))}
        </div>
        <div className="actions">
          <button type="button" className="primary-button" onClick={() => open.run()} disabled={busy || !held}>
            <LockOpen size={14} aria-hidden="true" /> Open the cryptex
          </button>
          <button type="button" className="secondary-button" onClick={() => approve.run(me.user)} disabled={busy || !held}>
            <KeyRound size={14} aria-hidden="true" /> The Seeker tries to approve
          </button>
        </div>
        {status && !status.approved && approvedBy.length === 1 && held?.requester !== approvedBy[0] && <p className="wink">{wink.act3one}</p>}
        <ErrorNotice error={err} title="The council" />
        {res?.outcome === 'shut' && (
          <Refusal v={res.vault} wink={held && approvedBy.includes(held.requester) ? `${res.why} ${wink.act3self}` : res.why} />
        )}
        {res?.outcome === 'forbidden' && <Refusal v={res.vault} wink="Only a Keyholder's approval counts." />}
        <Said v={res?.vault} />
      </section>
      <section className="vg-card stack" aria-labelledby="alone-h">
        <div className="card-head">
          <h3 id="alone-h">A Keyholder tries alone</h3>
          <span className="card-sub">the EGP's job: a requester's own approval does not count</span>
        </div>
        <p className="explain">
          A Keyholder asks for the cryptex, approves it themselves, and one colleague approves. Two approvals, one of them their own: Vault keeps it shut until a second colleague agrees.
        </p>
        <div className="actions">
          <label className="form-field form-field--inline" htmlFor="self-as">
            <span>Keyholder</span>
            <select id="self-as" value={selfAs} onChange={(e) => setSelfAs(e.target.value)}>
              {keyholders.map((k) => (
                <option key={k} value={k}>
                  {cast[k] || k}
                </option>
              ))}
            </select>
          </label>
        </div>
        <AnswerForm id="act3-self" label={`${cast[selfAs] || selfAs}'s answer to riddle II`} submitLabel={`Request as ${cast[selfAs] || selfAs}`} onSubmit={(w) => request.run({ answer: w, as: selfAs })} busy={request.busy} />
      </section>
      {opened && (
        <a className="secondary-button next-act" href="#/act-4">
          On to the last page
        </a>
      )}
    </>
  );
}
