// pages/Codex.jsx: the path through the five acts, the cast as Vault knows
// them, and the stage as Vault holds it right now.
import { ArrowRight, TerminalSquare } from 'lucide-react';
import { useResource } from '../hooks.js';
import { useStory } from '../hooks-story.js';
import { useAuth, ErrorNotice, Loading, Mono, StatePill, SignInNotice } from '../components/ui.jsx';
import { ActHero } from '../components/codex.jsx';
import { forget } from '../story.js';

const MECH = {
  'transform-fpe': 'Transform FPE (FF1)',
  'transit-derived': 'Derived Transit key: the answer is the context',
  'response-wrapping': 'Response wrapping: single use, short TTL',
  'control-group': 'Control group, 2 of 3, and a "not yourself" EGP',
  'crypto-shred': 'rotate, min_decryption_version, trim',
};

function actState(a, stage, keys, story) {
  if (a.id === 'prologue') return stage?.manuscript ? (story.prologue ? 'solved' : 'staged') : 'missing';
  const s = stage?.[a.id];
  if (!s) return 'missing';
  const k = keys?.[a.key];
  if (k && !k.missing && s.key_version < k.min_decryption_version) return 'burned';
  return story[a.id] ? 'solved' : 'staged';
}

const PILL = { solved: ['ok', 'solved here'], staged: ['info', 'staged'], burned: ['denied', 'burned'], missing: ['warn', 'not staged'] };

export default function Codex() {
  const me = useAuth();
  const story = useStory();
  const c = useResource('codex', '/api/codex', { intervalMs: 10000 });
  const d = c.data;
  return (
    <>
      <ActHero number="A cipher hunt in five acts" title="Every puzzle is a real Vault control." lede="When an answer is wrong, a seal is broken or an approval is missing, Vault refuses, and this console shows Vault's own answer. There is no answer-checking code anywhere: the console never knows the answers.">
        <p className="codex-split">Terraform builds the house. Ansible decorates it. Vault keeps the keys. Make is the front door.</p>
        <a className="hero-link" href="#/prologue">
          Begin with the manuscript <ArrowRight size={14} aria-hidden="true" />
        </a>
      </ActHero>
      {!me.signedIn && <SignInNotice />}
      {c.error && <ErrorNotice error={c.error} title="The stage" />}
      {!d && !c.error && <Loading />}
      {d && (
        <>
          <section className="vg-card stack" aria-labelledby="path-h">
            <div className="card-head">
              <h3 id="path-h">The path</h3>
              <span className="card-sub">
                stage digest <Mono>{d.stage.manuscript?.digest?.slice(0, 12) || '–'}</Mono>
              </span>
            </div>
            <ol className="path">
              {d.codex.acts.map((a) => {
                const st = actState(a, d.stage, d.keys, story);
                const [pill, label] = PILL[st];
                return (
                  <li key={a.id} className={`path__step path__step--${st}`}>
                    <a href={`#/${a.id}`} className="path__link">
                      <span className="path__title">{a.title}</span>
                      <span className="dim">{MECH[a.mechanism]}</span>
                    </a>
                    <StatePill state={pill}>{label}</StatePill>
                  </li>
                );
              })}
            </ol>
          </section>
          <div className="grid-2">
            <section className="vg-card stack" aria-labelledby="cast-h">
              <div className="card-head">
                <h3 id="cast-h">The cast</h3>
                <span className="card-sub">Keycloak realm codex, Vault entities</span>
              </div>
              <table className="vg-table">
                <thead>
                  <tr>
                    <th scope="col">Persona</th>
                    <th scope="col">Vault groups</th>
                    <th scope="col">Role</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>The Archivist</td>
                    <td>
                      <Mono>codex-archivist</Mono> (AppRole)
                    </td>
                    <td>Issues letters, burns the map, keeps the ledger</td>
                  </tr>
                  {d.codex.cast.map((p) => (
                    <tr key={p.user}>
                      <td>
                        {p.persona} <span className="dim">({p.user})</span>
                      </td>
                      <td>{p.groups.join(', ')}</td>
                      <td>{p.story}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="vg-card stack" aria-labelledby="keys-h">
              <div className="card-head">
                <h3 id="keys-h">The inks</h3>
                <span className="card-sub">transit/ keys, runtime state (Ansible)</span>
              </div>
              <dl className="facts">
                {Object.entries(d.keys).map(([k, v]) => (
                  <div key={k} className="facts__row">
                    <dt>
                      <Mono>{k}</Mono>
                    </dt>
                    <dd>{v.missing ? 'not staged' : `versions ${v.versions.join(', ')}; decrypts from v${v.min_decryption_version}`}</dd>
                  </div>
                ))}
              </dl>
              <h4 className="subhead">Before the show</h4>
              <ul className="before">
                <li>
                  <TerminalSquare size={14} aria-hidden="true" /> <Mono>make show-ready</Mono> clock, stack, fresh stage, checks
                </li>
                <li>
                  <TerminalSquare size={14} aria-hidden="true" /> <Mono>make stage-reset CONFIRM=yes</Mono> after a rehearsal
                </li>
                <li>
                  <TerminalSquare size={14} aria-hidden="true" /> <Mono>make verify</Mono> every layer, read-only
                </li>
              </ul>
              <button type="button" className="secondary-button" onClick={forget}>
                Forget what this browser saw
              </button>
            </section>
          </div>
        </>
      )}
    </>
  );
}
