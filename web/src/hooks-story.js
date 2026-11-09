import { useEffect, useState } from 'react';
import { read } from './story.js';

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
