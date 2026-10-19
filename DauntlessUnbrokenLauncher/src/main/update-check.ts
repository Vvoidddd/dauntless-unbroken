export const UPDATE_POLL_MS = 5 * 60 * 1000;
const FOCUS_COOLDOWN_MS = 60 * 1000;

// Share the same guard between startup, periodic and focus-triggered checks.
export function createUpdateCheck(check: () => Promise<void>, busy: () => boolean, now = () => performance.now()) {
  let running = false;
  let lastCheck = -Infinity;
  return async () => {
    if (running || busy() || now() - lastCheck < FOCUS_COOLDOWN_MS) return;
    running = true;
    lastCheck = now();
    try { await check(); }
    finally { running = false; }
  };
}
