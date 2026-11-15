// Recording a call to summarise it, from the phones' side:
//
//   1. someone taps «Grabar y resumir»; Vorian asks everyone else;
//   2. each person's yes is stored; nothing is recorded until all said yes;
//   3. each phone records only its own microphone and uploads it here;
//   4. when every track is in (or a few minutes later), the worker takes it.
//
// The switch in the admin panel (app_settings.meeting_summaries_enabled) turns
// all of this on or off, and it starts off.
import { supabaseAdmin } from '../../lib/supabaseAdmin';
import { AppError } from '../../utils/AppError';
import { assertCallConversationParticipant, assertConversationParticipant } from '../../utils/authz';
import { TtlCache } from '../../utils/ttlCache';
import { MEETING_PIPELINE_VERSION } from './meetingPipeline';

export const RECORDINGS_BUCKET = 'recordings';
/** A phone stops recording on its own after this long. */
export const MAX_MEETING_SECONDS = 90 * 60;
/** A call row counts as "this call" for this long after it was created. */
const CALL_WINDOW_MS = 4 * 60 * 60 * 1000;

const switchCache = new TtlCache<boolean>(15_000, 1);

export async function meetingSummariesEnabled(): Promise<boolean> {
    const cached = switchCache.get('on');
    if (cached !== undefined) return cached;
    const { data, error } = await supabaseAdmin.from('app_settings').select('meeting_summaries_enabled').eq('id', true).maybeSingle();
    // Before the database change is applied the column does not exist: off.
    const on = !error && (data as any)?.meeting_summaries_enabled === true;
    switchCache.set('on', on);
    return on;
}

export function forgetMeetingSwitch(): void {
    switchCache.clear();
}

async function assertEnabled(): Promise<void> {
    if (!(await meetingSummariesEnabled())) throw new AppError('Los resúmenes de reuniones no están disponibles por ahora.', 403);
}

export async function participantIds(conversationId: string): Promise<string[]> {
    const { data, error } = await supabaseAdmin.from('conversation_participants').select('user_id').eq('conversation_id', conversationId);
    if (error) throw error;
    return [...new Set((data || []).map((row: any) => row.user_id as string))];
}

export interface ConsentState {
    callId: string;
    conversationId: string;
    participants: number;
    consented: number;
    allConsented: boolean;
}

async function consentState(callId: string, conversationId: string): Promise<ConsentState> {
    const people = await participantIds(conversationId);
    const { data, error } = await supabaseAdmin
        .from('call_recording_consents')
        .select('user_id')
        .eq('call_id', callId)
        .is('revoked_at', null);
    if (error) throw error;
    const yes = new Set((data || []).map((row: any) => row.user_id as string));
    const consented = people.filter((id) => yes.has(id)).length;
    return { callId, conversationId, participants: people.length, consented, allConsented: people.length > 1 && consented === people.length };
}

/** The call this conversation is in right now: the latest one of the last hours, or a new one. */
async function currentCallId(conversationId: string, userId: string): Promise<string> {
    const since = new Date(Date.now() - CALL_WINDOW_MS).toISOString();
    const { data, error } = await supabaseAdmin
        .from('calls')
        .select('id')
        .eq('conversation_id', conversationId)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    if (data?.id) return data.id as string;
    const { data: created, error: insertError } = await supabaseAdmin
        .from('calls')
        .insert({ conversation_id: conversationId, status: 'started', meta: { channelName: conversationId, callerId: userId } })
        .select('id')
        .single();
    if (insertError) throw insertError;
    return created.id as string;
}

async function conversationOf(callId: string): Promise<string> {
    const { data, error } = await supabaseAdmin.from('calls').select('conversation_id').eq('id', callId).maybeSingle();
    if (error) throw error;
    if (!data) throw new AppError('Call not found', 404);
    return data.conversation_id as string;
}

async function saveConsent(callId: string, userId: string): Promise<void> {
    const { error } = await supabaseAdmin
        .from('call_recording_consents')
        .upsert({ call_id: callId, user_id: userId, consented_at: new Date().toISOString(), revoked_at: null }, { onConflict: 'call_id,user_id' });
    if (error) throw error;
}

/** «Grabar y resumir»: the person who asks also says yes. */
export async function requestMeetingRecording(userId: string, conversationId: string): Promise<ConsentState> {
    await assertEnabled();
    await assertConversationParticipant(userId, conversationId);
    const callId = await currentCallId(conversationId, userId);
    await saveConsent(callId, userId);
    return consentState(callId, conversationId);
}

export async function consentToMeetingRecording(userId: string, callId: string): Promise<ConsentState> {
    await assertEnabled();
    await assertCallConversationParticipant(userId, callId);
    const conversationId = await conversationOf(callId);
    await saveConsent(callId, userId);
    return consentState(callId, conversationId);
}

/** Anyone can say no or stop at any time; the recording is then not used. */
export async function declineMeetingRecording(userId: string, callId: string): Promise<void> {
    await assertCallConversationParticipant(userId, callId);
    const { error } = await supabaseAdmin
        .from('call_recording_consents')
        .upsert({ call_id: callId, user_id: userId, revoked_at: new Date().toISOString() }, { onConflict: 'call_id,user_id' });
    if (error) throw error;
}

export function trackPath(callId: string, userId: string): string {
    return `meetings/${callId}/${userId}.webm`;
}

/** Where this phone uploads its own microphone. Only once everyone said yes. */
export async function meetingUploadUrl(userId: string, callId: string): Promise<{ uploadUrl: string; maxSeconds: number }> {
    await assertEnabled();
    await assertCallConversationParticipant(userId, callId);
    const state = await consentState(callId, await conversationOf(callId));
    if (!state.allConsented) throw new AppError('Todavía falta que todos acepten grabar.', 409);
    const { data, error } = await supabaseAdmin.storage.from(RECORDINGS_BUCKET).createSignedUploadUrl(trackPath(callId, userId), { upsert: true });
    if (error || !data?.signedUrl) throw new AppError('Unable to prepare the upload', 500);
    return { uploadUrl: data.signedUrl, maxSeconds: MAX_MEETING_SECONDS };
}

/** The phone finished uploading: the job waits for the others, then runs. */
export async function meetingTrackUploaded(
    userId: string,
    callId: string,
    input: { startedAt: string; seconds: number; pieces?: Array<{ at: number; from: number; len: number }> | null },
): Promise<{ queued: boolean }> {
    await assertCallConversationParticipant(userId, callId);
    const conversationId = await conversationOf(callId);
    const state = await consentState(callId, conversationId);
    if (!state.allConsented) {
        // Someone took their yes back: the audio is not used.
        await supabaseAdmin.storage.from(RECORDINGS_BUCKET).remove([trackPath(callId, userId)]);
        return { queued: false };
    }
    const { error } = await supabaseAdmin.rpc('add_meeting_track', {
        p_call_id: callId,
        p_pipeline_version: MEETING_PIPELINE_VERSION,
        p_user_id: userId,
        p_track: {
            path: trackPath(callId, userId), startedAt: input.startedAt, seconds: Math.round(input.seconds),
            // Where each piece this phone kept sits in the call (null: it kept everything).
            pieces: Array.isArray(input.pieces) ? input.pieces : null,
        },
        p_expected: state.participants,
    });
    if (error) throw error;
    return { queued: true };
}

export async function allParticipantsConsented(callId: string, conversationId: string): Promise<boolean> {
    return (await consentState(callId, conversationId)).allConsented;
}
