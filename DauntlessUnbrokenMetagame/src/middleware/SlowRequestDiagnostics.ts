import type {RequestHandler} from 'express';

export type RequestDiagnostic = {
  method: string;
  route: string;
  status: number;
  outcome: 'finished' | 'aborted';
  durationMs: number;
};

export function ParseSlowRequestThreshold(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d{1,7}$/.test(value)) throw new Error('LOG_SLOW_REQUEST_MS must be an integer between 0 and 3600000');
  const threshold = Number(value);
  if (threshold > 3600000) throw new Error('LOG_SLOW_REQUEST_MS must be an integer between 0 and 3600000');
  return threshold;
}

export function SlowRequestDiagnostics(threshold: number, record: (event: RequestDiagnostic) => void): RequestHandler {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    let recorded = false;
    const finish = (outcome: 'finished' | 'aborted') => {
      if (recorded) return;
      recorded = true;
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      if (outcome === 'finished' && res.statusCode < 500 && durationMs < threshold) return;
      const route = typeof req.route?.path === 'string' ? req.route.path : '<unmatched>';
      const method = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(req.method) ? req.method : 'OTHER';
      record({method, route, status: res.statusCode, outcome, durationMs: Math.round(durationMs * 100) / 100});
    };
    res.once('finish', () => finish('finished'));
    res.once('close', () => finish(res.writableFinished ? 'finished' : 'aborted'));
    next();
  };
}
