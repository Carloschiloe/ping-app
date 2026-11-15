// The «Resúmenes de reuniones» card in Ajustes: the switch, and what the
// meetings cost this month (each job adds up its transcription and summary).
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from '../utils/AppError';
import { forgetMeetingSwitch } from '../services/meetings/meetingRecording.service';

export type MeetingAdmin = {
    ready: boolean; // the database change is applied
    enabled: boolean;
    month: { processed: number; failed: number; pending: number; costUsd: number; minutes: number; averageUsd: number | null };
};

function monthStartIso(now = new Date()): string {
    // Santiago is UTC-3 or UTC-4; starting the month at 04:00 UTC is close enough for a total.
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 4)).toISOString();
}

export async function meetingAdmin(): Promise<MeetingAdmin> {
    const empty = { processed: 0, failed: 0, pending: 0, costUsd: 0, minutes: 0, averageUsd: null };
    const { data: settings, error } = await supabaseAdmin.from('app_settings').select('meeting_summaries_enabled').eq('id', true).maybeSingle();
    if (error) return { ready: false, enabled: false, month: empty };
    const { data: jobs, error: jobsError } = await supabaseAdmin
        .from('meeting_jobs')
        .select('status, cost_usd, audio_seconds')
        .gte('created_at', monthStartIso());
    if (jobsError) return { ready: false, enabled: false, month: empty };
    const rows = jobs || [];
    const done = rows.filter((r: any) => r.status === 'processed');
    const costUsd = rows.reduce((sum: number, r: any) => sum + Number(r.cost_usd || 0), 0);
    return {
        ready: true,
        enabled: (settings as any)?.meeting_summaries_enabled === true,
        month: {
            processed: done.length,
            failed: rows.filter((r: any) => r.status === 'failed').length,
            pending: rows.filter((r: any) => r.status === 'pending' || r.status === 'processing').length,
            costUsd,
            minutes: Math.round(rows.reduce((sum: number, r: any) => sum + Number(r.audio_seconds || 0), 0) / 60),
            averageUsd: done.length ? done.reduce((sum: number, r: any) => sum + Number(r.cost_usd || 0), 0) / done.length : null,
        },
    };
}

export async function setMeetingSummaries(enabled: boolean): Promise<MeetingAdmin> {
    const { error } = await supabaseAdmin
        .from('app_settings')
        .upsert({ id: true, meeting_summaries_enabled: enabled, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) throw new AppError('Falta aplicar el cambio de la base de datos de reuniones.', 409);
    forgetMeetingSwitch();
    return meetingAdmin();
}
