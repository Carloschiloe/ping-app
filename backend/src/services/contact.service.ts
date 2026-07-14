import { supabaseAdmin } from '../lib/supabaseAdmin';
import { assertOwnContact } from '../utils/authz';

// API minima expuesta de un contacto externo: nunca se devuelven columnas
// mas alla de lo necesario para elegir/mostrar la contraparte en un
// commitment (sin metadata interna).
function toMinimalContact(row: any) {
    return {
        id: row.id,
        display_name: row.display_name,
        phone: row.phone,
        email: row.email,
        linked_user_id: row.linked_user_id,
        created_at: row.created_at,
    };
}

export const createContact = async (userId: string, data: { display_name: string; phone?: string | null; email?: string | null; linked_user_id?: string | null }) => {
    const { data: contact, error } = await supabaseAdmin
        .from('contacts')
        .insert({
            owner_user_id: userId,
            display_name: data.display_name,
            phone: data.phone ?? null,
            email: data.email ?? null,
            linked_user_id: data.linked_user_id ?? null,
        })
        .select('id, display_name, phone, email, linked_user_id, created_at')
        .single();

    if (error) throw error;
    return toMinimalContact(contact);
};

export const getContacts = async (userId: string) => {
    const { data, error } = await supabaseAdmin
        .from('contacts')
        .select('id, display_name, phone, email, linked_user_id, created_at')
        .eq('owner_user_id', userId)
        .order('display_name', { ascending: true });

    if (error) throw error;
    return (data || []).map(toMinimalContact);
};

export const getContact = async (userId: string, contactId: string) => {
    const contact = await assertOwnContact(userId, contactId);
    return toMinimalContact(contact);
};
