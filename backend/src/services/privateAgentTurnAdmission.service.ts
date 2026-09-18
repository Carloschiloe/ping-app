import { Pool } from 'pg';
import { AgentTurnAdmissionService } from './agentTurnAdmission.service';

const ADMISSION_RPC = 'admit_agent_turn_with_routing_mode';

export type PrivateDatabaseCheckCategory =
    | 'missing_url'
    | 'invalid_url'
    | 'dns'
    | 'network'
    | 'tls'
    | 'authentication'
    | 'authorization'
    | 'unknown';

export type PrivateDatabaseCheckResult = {
    passed: boolean;
    category?: PrivateDatabaseCheckCategory;
};

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

function classifyPrivateDatabaseError(error: unknown): PrivateDatabaseCheckCategory {
    const candidate = error as { code?: string; message?: string };
    const code = candidate.code ?? '';
    const message = (candidate.message ?? '').toLowerCase();

    if (['ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL'].includes(code)) return 'dns';
    if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code)) return 'network';
    if (code === '28P01' || /authentication failed|password authentication|tenant or user not found/.test(message)) return 'authentication';
    if (code === '42501' || /permission denied|not have permission/.test(message)) return 'authorization';
    if (['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN'].includes(code)) return 'tls';
    if (/ssl|tls|certificate|self-signed|altnames/.test(message)) return 'tls';
    return 'unknown';
}

function preparePrivatePoolerConnection(databaseUrl: string): { connectionString: string; ssl: { rejectUnauthorized: true } | undefined } {
    const parsed = new URL(databaseUrl);
    if (!parsed.hostname.endsWith('.pooler.supabase.com')) return { connectionString: databaseUrl, ssl: undefined };

    const requestedMode = parsed.searchParams.get('sslmode');
    if (requestedMode === 'disable' || requestedMode === 'no-verify' || requestedMode === 'prefer') {
        throw new Error('PING_M7_DATABASE_URL must use verified TLS for the Session Pooler');
    }
    parsed.searchParams.set('sslmode', 'verify-full');
    return { connectionString: parsed.toString(), ssl: { rejectUnauthorized: true } };
}

type PrivateAdmissionRpcArgs = {
    p_actor_user_id: string;
    p_dialogue_scope_key: string;
    p_client_turn_key: string;
    p_request_fingerprint: string;
    p_routing_mode: string;
};

/**
 * Backend-only PostgreSQL transport for durable admission. It deliberately
 * exposes one fixed RPC and never accepts SQL or function names from callers.
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
    const databaseUrl = process.env.PING_M7_DATABASE_URL;
    if (!databaseUrl) return { passed: false, category: 'missing_url' };

    let adapter: PrivateAgentTurnAdmissionService;
    try {
        adapter = new PrivateAgentTurnAdmissionService(databaseUrl);
    } catch {
        return { passed: false, category: 'invalid_url' };
    }

    try {
        try {
            await adapter.checkConnectionOrThrow();
            return { passed: true };
        } catch (error) {
            return { passed: false, category: classifyPrivateDatabaseError(error) };
        }
    } finally {
        await adapter.close();
    }
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
