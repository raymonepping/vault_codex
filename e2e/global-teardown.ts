// global-teardown.ts: leave a fresh stage behind (the show burns the map).
import { stageReset } from './helpers/env';

export default async function globalTeardown(): Promise<void> {
  stageReset();
}
