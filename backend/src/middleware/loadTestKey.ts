import { createHash, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

// A load test from one machine would hit the global request budget within
// seconds and measure nothing. While LOAD_TEST_KEY is set on the server, a
// request carrying that exact key skips only the global budget; sign-in,
// auth-failure and per-route limits still apply. Remove the variable when the
// test ends and the bypass disappears with it.
const MIN_KEY_LENGTH = 32;

const digest = (value: string) => createHash('sha256').update(value).digest();

export function hasLoadTestKey(req: Pick<Request, 'get'>, configured = process.env.LOAD_TEST_KEY): boolean {
    if (!configured || configured.length < MIN_KEY_LENGTH) return false;
    const sent = req.get('x-load-test-key');
    if (!sent) return false;
    return timingSafeEqual(digest(sent), digest(configured));
}
