export type DeviceContact = {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    registered?: {
        id: string;
        full_name?: string | null;
        avatar_url?: string | null;
        phone?: string | null;
        email?: string | null;
        contactProof: string;
    };
};

type ContactDetails = {
    id: string;
    fullName?: string | null;
    phones?: Array<{ number?: string | null }>;
    emails?: Array<{ email?: string | null }>;
};

export function normalizePhone(raw: string): string | null {
    const digits = raw.replace(/\D/g, '');
    if (raw.trim().startsWith('+')) {
        const value = `+${digits}`;
        return /^\+[1-9]\d{7,14}$/.test(value) ? value : null;
    }
    if (digits.startsWith('56') && digits.length === 11) return `+${digits}`;
    if (digits.length === 9) return `+56${digits}`;
    return null;
}

export function mapDeviceContacts(details: ContactDetails[]): DeviceContact[] {
    const contacts: DeviceContact[] = [];
    for (const contact of details) {
        const phone = (contact.phones || [])
            .map((entry) => entry.number ? normalizePhone(entry.number) : null)
            .find((value): value is string => !!value);
        const email = (contact.emails || [])
            .map((entry) => entry.email?.trim().toLowerCase())
            .find((value): value is string => !!value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
        if (!phone && !email) continue;
        contacts.push({
            id: contact.id,
            name: contact.fullName?.trim() || phone || email || 'Contacto',
            phone,
            email,
        });
    }
    return contacts;
}
