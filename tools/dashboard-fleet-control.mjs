export async function drainFleet(action, hosts, fetcher = fetch) {
  if (!['start', 'stop'].includes(action)) throw new Error('Invalid drain action');
  if (!Array.isArray(hosts) || hosts.length > 16) throw new Error('Invalid hosts');
  const seen = new Set();
  const endpoints = hosts.map(host => {
    const target = new URL(host.url);
    if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1' || target.username || target.password || target.pathname !== '/' || target.search || target.hash) throw new Error('Worker control must use a loopback tunnel');
    if (typeof host.name !== 'string' || !host.name || seen.has(host.name) || typeof host.key !== 'string' || host.key.length < 32) throw new Error('Invalid worker control configuration');
    seen.add(host.name);
    return {name:host.name, key:host.key, url:new URL('/drain', target)};
  });
  return Promise.all(endpoints.map(async endpoint => {
    try {
      const response = await fetcher(endpoint.url, {method:'POST', headers:{'content-type':'application/json', 'x-worker-control-key':endpoint.key}, body:JSON.stringify({action}), redirect:'error', signal:AbortSignal.timeout(10000)});
      if (response.status === 409) return {name:endpoint.name, state:'conflict'};
      if (!response.ok) return {name:endpoint.name, state:'unavailable'};
      const result = await response.json();
      if (!['dashboard','external','open'].includes(result.state)) return {name:endpoint.name, state:'unknown'};
      return {name:endpoint.name, state:result.state};
    } catch { return {name:endpoint.name, state:'unknown'}; }
  }));
}
