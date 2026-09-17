import { Pool } from 'pg';
import { AgentTurnAdmissionService } from './agentTurnAdmission.service';

const ADMISSION_RPC = 'admit_agent_turn_with_routing_mode';

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
        this.pool = new Pool({ connectionString: databaseUrl, max: 4, allowExitOnIdle: true, application_name: 'ping-m7-admission' });
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
            await this.pool.query('select 1');
            return true;
        } catch {
            return false;
        }
    }
}

export async function checkPrivateAgentTurnDatabase(): Promise<boolean> {
    const databaseUrl = process.env.PING_M7_DATABASE_URL;
    if (!databaseUrl) return false;
    const adapter = new PrivateAgentTurnAdmissionService(databaseUrl);
    try {
        return await adapter.checkConnection();
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
