import { z } from 'zod';

// Contactos externos (tabla `contacts`): personas sin cuenta en Ping que
// pueden ser contraparte (counterparty_contact_id) o bloqueante
// (waiting_on_contact_id) de un commitment. Minimo CRUD requerido por esta
// fase: crear y listar/consultar los propios. Sin RLS de sesion propia (ver
// utils/authz.ts:assertOwnContact) — solo el owner_user_id puede usarlos, la
// autorizacion vive enteramente en el backend con service role.
export const createContactSchema = z.object({
    body: z.object({
        display_name: z.string().min(1).max(255),
        phone: z.string().max(50).optional().nullable(),
        email: z.string().email().max(255).optional().nullable(),
        linked_user_id: z.string().uuid().optional().nullable(),
    }),
});

export const getContactSchema = z.object({
    params: z.object({ id: z.string().uuid() }),
});
