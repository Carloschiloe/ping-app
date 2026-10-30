// Cleanup for manual tests run against production (Ping has no staging).
// Lists the commitments a test created and, only with --apply, cancels them
// through the canonical lifecycle (cancelCommitment), so commitment events and
// memory facts stay consistent. Cancelled rows can be reopened. Never deletes.
//
//   node scripts/prod-test-cleanup.mjs <email> <desde-ISO>          (sólo lista)
//   node scripts/prod-test-cleanup.mjs <email> <desde-ISO> --apply  (cancela)
//
// Only touches rows owned by that account, created after <desde-ISO>, whose
// title contains the test marker (docs/runbooks/PRUEBAS-EN-PRODUCCION.md).
import 'dotenv/config';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';

const [email, since, flag] = process.argv.slice(2);
// Voice transcription varies the marker ("prueba ping", "prueba bingo", "prueba Pink"),
// so match the stable word only, still bounded by owner and creation time.
const MARKER = 'prueba';
const OPEN_STATUSES = ['proposed', 'accepted', 'counter_proposal'];
if (!email || !since || Number.isNaN(Date.parse(since))) {
    console.error('Uso: node scripts/prod-test-cleanup.mjs <email> <desde-ISO> [--apply]');
    process.exit(1);
}

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
});

const { data: profile, error: profileError } = await admin
    .from('profiles').select('id').eq('email', email.toLowerCase()).maybeSingle();
if (profileError || !profile) {
    console.error('No encontré esa cuenta.', profileError?.message ?? '');
    process.exit(1);
}

const { data: rows, error } = await admin
    .from('commitments')
    .select('id, title, status, due_at, created_at')
    .eq('owner_user_id', profile.id)
    .gte('created_at', new Date(since).toISOString())
    .ilike('title', `%${MARKER}%`)
    .in('status', OPEN_STATUSES)
    .order('created_at');
if (error) throw error;

console.table(rows.map(({ id, title, status, due_at, created_at }) => ({ id, title, status, due_at, created_at })));
console.log(`${rows.length} compromiso(s) de prueba abiertos.`);

if (flag !== '--apply' || rows.length === 0) {
    if (rows.length) console.log('Nada cambiado. Repite con --apply para cancelarlos.');
    process.exit(0);
}

const require = createRequire(import.meta.url);
require('ts-node').register({ transpileOnly: true });
const { cancelCommitment } = require('../src/services/commitment.service.ts');

let failed = 0;
for (const row of rows) {
    try {
        await cancelCommitment(profile.id, row.id, 'Limpieza de prueba');
        console.log(`Cancelado ${row.id} "${row.title}"`);
    } catch (cancelError) {
        failed += 1;
        console.error(`No se pudo cancelar ${row.id}:`, cancelError?.message ?? cancelError);
    }
}
console.log(`Cancelados ${rows.length - failed} de ${rows.length}. Siguen en la base y se pueden reabrir desde la app.`);
process.exit(failed ? 1 : 0);
