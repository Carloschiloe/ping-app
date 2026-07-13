export function isTitleMeeting(title?: string | null): boolean {
    return /reuni[oó]n|llamada|junta|meet|zoom|call|cita/i.test(title || '');
}
