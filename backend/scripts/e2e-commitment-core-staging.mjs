import 'dotenv/config';

process.env.PING_C2_TARGET = 'staging';

await import('./e2e-commitment-core-local.mjs');
