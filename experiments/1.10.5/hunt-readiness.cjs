const { setTimeout: sleep } = require('node:timers/promises');

async function waitForHuntReady(probe, timeoutMs = 6000, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let timer;
    const remaining = deadline - Date.now();
    const result = await Promise.race([
      Promise.resolve().then(probe),
      new Promise(resolve => { timer = setTimeout(resolve, remaining); }),
    ]).finally(() => clearTimeout(timer));
    if (result) return result;
    const delay = Math.min(intervalMs, deadline - Date.now());
    if (delay > 0) await sleep(delay);
  }
}

module.exports = { waitForHuntReady };
