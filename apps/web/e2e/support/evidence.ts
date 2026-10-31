import os from 'node:os';
import path from 'node:path';

/**
 * REQ-03 · The one definition of the evidence folder (outside the repo, spec 8.1). The visual helpers, the test-video
 * cache and the perf harness all import it from here, so ONESHOOT_EVIDENCE_DIR can never be read two ways.
 */
export const EVIDENCE =
  process.env.ONESHOOT_EVIDENCE_DIR || path.join(os.homedir(), 'oneshoot-rendimiento-integral-tmp');
