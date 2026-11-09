// story.js: what this browser has seen Vault reveal in this session (texts,
// solved acts, the burn). Only so a page can show the riddle the presenter
// carries into it; Vault holds the truth. sessionStorage can be missing or
// throw (private windows): the console still works, it just forgets.
import { useEffect, useState } from 'react';

const KEY = 'codex.story';

export function read() {
  try {
    return JSON.parse(window.sessionStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export function remember(patch) {
  const next = { ...read(), ...patch };
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* not remembered */
  }
  window.dispatchEvent(new Event('codex-story'));
  return next;
}

export function forget() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to forget */
  }
  window.dispatchEvent(new Event('codex-story'));
}

// A stage reset (make show-ready, make stage-reset) starts a new show: what a
// rehearsal in this tab revealed must not look "solved" in the next one.
export function followStage(stagedAt) {
  if (!stagedAt || read().stagedAt === stagedAt) return;
  forget();
  remember({ stagedAt });
}

// The session's story state, re-read when any page remembers something.
export function useStory() {
  const [s, setS] = useState(read);
  useEffect(() => {
    const on = () => setS(read());
    window.addEventListener('codex-story', on);
    return () => window.removeEventListener('codex-story', on);
  }, []);
  return s;
}
