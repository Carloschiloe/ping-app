import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AgentTurnAdmissionService } from './agentTurnAdmission.service';

const ADMISSION_RPC = 'admit_agent_turn_with_routing_mode';
const CLAIM_RPC = 'claim_agent_turn_admission';
const COMPLETE_RPC = 'complete_agent_turn_admission';
const FAIL_RPC = 'fail_agent_turn_admission';
const SUPABASE_ROOT_CA_PATH = resolve(__dirname, '../../certs/prod-ca-2021.crt');

let cachedSupabaseRootCa: string | undefined;

export type PrivateDatabaseCheckCategory =
    | 'missing_url'
    | 'invalid_url'
    | 'dns'
    | 'network'
    | 'tls'
    | 'authentication_identity'
    | 'authentication_password'
    | 'authorization'
    | 'unknown';

export type PrivateDatabaseCheckResult = {
    passed: boolean;
    category?: PrivateDatabaseCheckCategory;
    driverCode?: string;
};

let latestPrivateDatabaseDiagnostic: PrivateDatabaseCheckResult | null = null;

export type PrivatePoolerUrlFormatResult =
    | { valid: true }
    | { valid: false; reason: 'invalid_url' | 'not_session_pooler' | 'wrong_username' | 'wrong_port' };

/**
 * Checks only the non-secret shape of a Supabase Session Pooler URL. It never
 * returns or logs the parsed password.
 */
export function validatePrivateSessionPoolerUrl(
    databaseUrl: string,
    expectedRole: string,
    expectedProjectRef: string,
): PrivatePoolerUrlFormatResult {
    let parsed: URL;
    try {
        parsed = new URL(databaseUrl);
    } catch {
        return { valid: false, reason: 'invalid_url' };
    }
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) return { valid: false, reason: 'invalid_url' };
    if (!parsed.hostname.endsWith('.pooler.supabase.com')) return { valid: false, reason: 'not_session_pooler' };
    if (parsed.port !== '5432') return { valid: false, reason: 'wrong_port' };
    const expectedUsername = `${expectedRole}.${expectedProjectRef}`;
    if (decodeURIComponent(parsed.username) !== expectedUsername) return { valid: false, reason: 'wrong_username' };
    return { valid: true };
}

const SAFE_DRIVER_CODES = new Set([
    'ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH',
    '28P01', '42501', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN', 'ERR_SSL_WRONG_VERSION_NUMBER',
    'ERR_SSL_PROTOCOL_ERROR', 'ERR_SSL_VERSION_OR_CIPHER_MISMATCH',
]);

function safeTlsCode(code: string, message: string): string | undefined {
    if (SAFE_DRIVER_CODES.has(code) && (code.startsWith('CERT_') || code.startsWith('DEPTH_') || code.startsWith('ERR_TLS_') || code.startsWith('UNABLE_') || code.startsWith('SELF_') || code.startsWith('ERR_SSL_'))) return code;
    if (/hostname\/ip does not match certificate|certificate.*altnames|altnames.*certificate/.test(message)) return 'ERR_TLS_CERT_ALTNAME_INVALID';
    if (/certificate has expired/.test(message)) return 'CERT_HAS_EXPIRED';
    if (/self-signed certificate in certificate chain/.test(message)) return 'SELF_SIGNED_CERT_IN_CHAIN';
    if (/self-signed certificate/.test(message)) return 'DEPTH_ZERO_SELF_SIGNED_CERT';
    if (/issuer|verify|trust/.test(message)) return 'UNABLE_TO_VERIFY_LEAF_SIGNATURE';
    if (/hostname|host name|altname/.test(message)) return 'ERR_TLS_CERT_ALTNAME_INVALID';
    if (/unable to verify.*leaf signature/.test(message)) return 'UNABLE_TO_VERIFY_LEAF_SIGNATURE';
    if (/unable to get local issuer certificate|certificate verify failed/.test(message)) return 'UNABLE_TO_VERIFY_LEAF_SIGNATURE';
    if (/protocol|version|cipher/.test(message)) return 'ERR_SSL_PROTOCOL_ERROR';
    if (/wrong version number/.test(message)) return 'ERR_SSL_WRONG_VERSION_NUMBER';
    return undefined;
}

function getSupabaseRootCa(): string {
    if (!cachedSupabaseRootCa) {
        cachedSupabaseRootCa = readFileSync(SUPABASE_ROOT_CA_PATH, 'utf8').trim();
        if (!cachedSupabaseRootCa.startsWith('-----BEGIN CERTIFICATE-----')
            || !cachedSupabaseRootCa.endsWith('-----END CERTIFICATE-----')) {
            throw new Error('Bundled Supabase root CA is invalid');
        }
    }
    return cachedSupabaseRootCa;
}

function classifyPrivateDatabaseError(error: unknown): { category: PrivateDatabaseCheckCategory; driverCode?: string } {
    const candidate = error as { code?: string; message?: string };
    const code = candidate.code ?? '';
    const message = (candidate.message ?? '').toLowerCase();
    const driverCode = SAFE_DRIVER_CODES.has(code) ? code : safeTlsCode(code, message);

    if (['ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL'].includes(code)) return { category: 'dns', driverCode };
    if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code)) return { category: 'network', driverCode };
    if (/tenant or user not found/.test(message)) return { category: 'authentication_identity', driverCode };
    if (code === '28P01' || /authentication failed|password authentication/.test(message)) return { category: 'authentication_password', driverCode };
    if (code === '42501' || /permission denied|not have permission/.test(message)) return { category: 'authorization', driverCode };
    if (driverCode && (driverCode.startsWith('CERT_') || driverCode.startsWith('DEPTH_') || driverCode.startsWith('ERR_TLS_') || driverCode.startsWith('UNABLE_') || driverCode.startsWith('SELF_') || driverCode.startsWith('ERR_SSL_'))) return { category: 'tls', driverCode };
    if (/ssl|tls|certificate|self-signed|altnames/.test(message)) return { category: 'tls', driverCode };
    return { category: 'unknown', driverCode };
}

function preparePrivatePoolerConnection(databaseUrl: string): { connectionString: string; ssl: { ca: string; rejectUnauthorized: true } | undefined } {
    const parsed = new URL(databaseUrl);
    if (!parsed.hostname.endsWith('.pooler.supabase.com')) return { connectionString: databaseUrl, ssl: undefined };

    const requestedMode = parsed.searchParams.get('sslmode');
    if (requestedMode === 'disable' || requestedMode === 'no-verify' || requestedMode === 'prefer') {
        throw new Error('PING_M7_DATABASE_URL must use verified TLS for the Session Pooler');
    }
    // pg-connection-string can replace the explicit `ssl` object whenever an
    // SSL query parameter is present. Remove every SSL query parameter before
    // handing the URL to pg so the pinned CA cannot be discarded.
    for (const parameter of ['ssl', 'sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat', 'sslnegotiation']) {
        parsed.searchParams.delete(parameter);
    }
    return { connectionString: parsed.toString(), ssl: { ca: getSupabaseRootCa(), rejectUnauthorized: true } };
}

type PrivateAdmissionRpcArgs = {
    p_actor_user_id: string;
    p_dialogue_scope_key: string;
    p_client_turn_key: string;
    p_request_fingerprint: string;
    p_routing_mode: string;
};

type PrivateClaimRpcArgs = {
    p_turn_id: string;
    p_actor_user_id: string;
    p_dialogue_scope_key: string;
};

type PrivateCompleteRpcArgs = PrivateClaimRpcArgs & {
    p_result_ref: Record<string, unknown>;
};

type PrivateFailRpcArgs = PrivateClaimRpcArgs & {
    p_failure_class: string;
    p_result_ref: Record<string, unknown> | null;
};

/**
 * Backend-only PostgreSQL transport for durable admission. It deliberately
 * exposes a fixed allowlist of lifecycle RPCs and never accepts SQL or
 * function names from callers.
 */
export class PrivateAgentTurnAdmissionService {
    private readonly pool: Pool;

    public constructor(databaseUrl: string) {
        if (!databaseUrl.startsWith('postgres://') && !databaseUrl.startsWith('postgresql://')) {
            throw new Error('PING_M7_DATABASE_URL must be a PostgreSQL connection URL');
        }
        const connection = preparePrivatePoolerConnection(databaseUrl);
        this.pool = new Pool({ connectionString: connection.connectionString, ssl: connection.ssl, max: 4, allowExitOnIdle: true, application_name: 'ping-m7-admission' });
    }

    public async rpc(name: string, args: Record<string, unknown>) {
        try {
            if (name === ADMISSION_RPC) {
                const typedArgs = args as unknown as PrivateAdmissionRpcArgs;
                const result = await this.pool.query(
                    'select * from public.admit_agent_turn_with_routing_mode($1::uuid, $2::text, $3::text, $4::text, $5::text)',
                    [typedArgs.p_actor_user_id, typedArgs.p_dialogue_scope_key, typedArgs.p_client_turn_key || null, typedArgs.p_request_fingerprint, typedArgs.p_routing_mode],
                );
                return { data: result.rows, error: null } as any;
            }
            if (name === CLAIM_RPC) {
                const typedArgs = args as unknown as PrivateClaimRpcArgs;
                const result = await this.pool.query(
                    'select * from public.claim_agent_turn_admission($1::uuid, $2::uuid, $3::text)',
                    [typedArgs.p_turn_id, typedArgs.p_actor_user_id, typedArgs.p_dialogue_scope_key],
                );
                return { data: result.rows[0] ?? null, error: null } as any;
            }
            if (name === COMPLETE_RPC) {
                const typedArgs = args as unknown as PrivateCompleteRpcArgs;
                const result = await this.pool.query(
                    'select * from public.complete_agent_turn_admission($1::uuid, $2::uuid, $3::text, $4::jsonb)',
                    [typedArgs.p_turn_id, typedArgs.p_actor_user_id, typedArgs.p_dialogue_scope_key, JSON.stringify(typedArgs.p_result_ref)],
                );
                return { data: result.rows[0] ?? null, error: null } as any;
            }
            if (name === FAIL_RPC) {
                const typedArgs = args as unknown as PrivateFailRpcArgs;
                const result = await this.pool.query(
                    'select * from public.fail_agent_turn_admission($1::uuid, $2::uuid, $3::text, $4::text, $5::jsonb)',
                    [typedArgs.p_turn_id, typedArgs.p_actor_user_id, typedArgs.p_dialogue_scope_key, typedArgs.p_failure_class, typedArgs.p_result_ref === null ? null : JSON.stringify(typedArgs.p_result_ref)],
                );
                return { data: result.rows[0] ?? null, error: null } as any;
            }
            throw new Error('Private admission transport does not support this RPC');
        } catch (error) {
            const pgError = error as { message?: string; code?: string };
            return { data: null, error: { message: pgError.message ?? 'Private admission failed', code: pgError.code } } as any;
        }
    }

    public async close(): Promise<void> {
        await this.pool.end();
    }

    public async checkConnection(): Promise<boolean> {
        try {
            await this.checkConnectionOrThrow();
            return true;
        } catch {
            return false;
        }
    }

    public async checkConnectionOrThrow(): Promise<void> {
        await this.pool.query('select 1');
    }
}

export async function checkPrivateAgentTurnDatabase(): Promise<boolean> {
    return (await diagnosePrivateAgentTurnDatabase()).passed;
}

/**
 * Returns only a coarse, non-sensitive category. Raw driver errors never
 * leave this module because connection strings and server details must not be
 * present in startup logs.
 */
export async function diagnosePrivateAgentTurnDatabase(): Promise<PrivateDatabaseCheckResult> {
    const finish = (result: PrivateDatabaseCheckResult): PrivateDatabaseCheckResult => {
        latestPrivateDatabaseDiagnostic = result;
        return result;
    };
    const databaseUrl = process.env.PING_M7_DATABASE_URL;
    if (!databaseUrl) return finish({ passed: false, category: 'missing_url' });

    let adapter: PrivateAgentTurnAdmissionService;
    try {
        adapter = new PrivateAgentTurnAdmissionService(databaseUrl);
    } catch {
        return finish({ passed: false, category: 'invalid_url' });
    }

    try {
        try {
            await adapter.checkConnectionOrThrow();
            return finish({ passed: true });
        } catch (error) {
            const diagnosis = classifyPrivateDatabaseError(error);
            return finish({
                passed: false,
                ...diagnosis,
                driverCode: diagnosis.driverCode ?? (diagnosis.category === 'tls' ? 'TLS_UNCLASSIFIED' : undefined),
            });
        }
    } finally {
        await adapter.close();
    }
}

export function getLatestPrivateAgentTurnDatabaseDiagnostic(): PrivateDatabaseCheckResult | null {
    return latestPrivateDatabaseDiagnostic ? { ...latestPrivateDatabaseDiagnostic } : null;
}

export function isPrivateAgentTurnDatabaseDiagnosticEnabled(): boolean {
    return process.env.PING_ENVIRONMENT === 'staging'
        && process.env.PING_M7_PRIVATE_DB_CHECK === 'true';
}

export function createPrivateAgentTurnAdmissionService(): AgentTurnAdmissionService {
    const databaseUrl = process.env.PING_M7_DATABASE_URL;
    if (!databaseUrl) throw new Error('PING_M7_DATABASE_URL is required for private Agent Turn admission');
    return new AgentTurnAdmissionService(new PrivateAgentTurnAdmissionService(databaseUrl));
}
