import { describe, it, expect } from 'vitest';
import {
    resolveMessageContent,
    resolveMessageMetadata,
    isMessageFromUser,
    isMessageTombstoned,
    hasLiveAttachment,
    resolvableAttachmentId,
    resolveDeletedMessageLabel,
    resolveReactionEmoji,
} from '../src/utils/messageCompat';

describe('isMessageFromUser', () => {
    it('sender_id identifica al autor del mensaje', () => {
        expect(isMessageFromUser({ sender_id: 'u1' }, 'u1')).toBe(true);
        expect(isMessageFromUser({ sender_id: 'u2' }, 'u1')).toBe(false);
    });

    it('devuelve false sin userId (nunca asume autoria)', () => {
        expect(isMessageFromUser({ sender_id: 'u1' }, null)).toBe(false);
    });
});

describe('resolveReactionEmoji', () => {
    it('uses the V2 reaction column', () => {
        expect(resolveReactionEmoji({ reaction: '👍' })).toBe('👍');
    });

    it('keeps compatibility with the legacy emoji column', () => {
        expect(resolveReactionEmoji({ emoji: '❤️' })).toBe('❤️');
    });

    it('does not render invalid reactions as undefined', () => {
        expect(resolveReactionEmoji({})).toBeNull();
    });
});

describe('resolveMessageContent', () => {
    it('usa content antes que text cuando ambos estan presentes', () => {
        expect(resolveMessageContent({ content: 'hola V2', text: 'hola V1' })).toBe('hola V2');
    });

    it('cae a text si content no esta presente (compatibilidad con el alias del backend)', () => {
        expect(resolveMessageContent({ text: 'solo legacy' })).toBe('solo legacy');
    });
});

describe('isMessageTombstoned — PING: CLEAN MEDIA TOMBSTONE PRESENTATION (message lifecycle is independent of attachment lifecycle)', () => {
    // Canonical contract: message deletion is owned EXCLUSIVELY by
    // messages.deleted_at (see backend's tombstone_message RPC and
    // toLegacyMessageShape, which always selects '*' and therefore always
    // passes deleted_at through verbatim). attachment.lifecycleStatus must
    // NEVER be used to infer that the whole message was deleted — those are
    // two separate canonical truths.
    it('mensaje con deleted_at es tombstoned, aunque no tenga adjunto', () => {
        expect(isMessageTombstoned({ deleted_at: '2026-09-10T00:00:00.000Z' })).toBe(true);
    });

    it('mensaje de texto eliminado (sin ningún adjunto) es tombstoned', () => {
        const deletedTextMessage = { deleted_at: '2026-09-10T00:00:00.000Z', text: 'Mensaje eliminado' };
        expect(isMessageTombstoned(deletedTextMessage)).toBe(true);
    });

    it('mensaje con foto/video eliminado: tombstoned via deleted_at Y su adjunto queda tombstoned — ambos hechos son ciertos a la vez, sin depender uno del otro', () => {
        const deletedPhotoMessage = {
            deleted_at: '2026-09-10T00:00:00.000Z',
            attachment: { id: 'p1', lifecycleStatus: 'tombstoned' },
        };
        const deletedVideoMessage = {
            deleted_at: '2026-09-10T00:00:00.000Z',
            attachment: { id: 'v1', lifecycleStatus: 'tombstoned' },
        };
        expect(isMessageTombstoned(deletedPhotoMessage)).toBe(true);
        expect(isMessageTombstoned(deletedVideoMessage)).toBe(true);
        expect(hasLiveAttachment(deletedPhotoMessage)).toBe(false);
        expect(hasLiveAttachment(deletedVideoMessage)).toBe(false);
    });

    // Requerido: un adjunto tombstoned NO implica que el mensaje esté
    // eliminado. Este es exactamente el error arquitectónico que esta tarea
    // corrige — antes, isMessageTombstoned miraba
    // attachment.lifecycleStatus === 'tombstoned' como señal de borrado del
    // mensaje completo, lo cual es incorrecto: el ciclo de vida del
    // adjunto y el del mensaje son verdades canónicas separadas.
    it('adjunto tombstoned con el mensaje NO eliminado (deleted_at ausente) NUNCA implica que el mensaje esté borrado', () => {
        const messageWithTombstonedAttachmentButNotDeleted = {
            text: 'Video',
            attachment: { id: 'v1', lifecycleStatus: 'tombstoned' },
            // deleted_at deliberadamente ausente.
        };
        expect(isMessageTombstoned(messageWithTombstonedAttachmentButNotDeleted)).toBe(false);
        // El mensaje sigue vivo, pero su adjunto no es fetcheable.
        expect(hasLiveAttachment(messageWithTombstonedAttachmentButNotDeleted)).toBe(false);
    });

    it('mensaje normal con adjunto activo (attached) no es tombstoned', () => {
        expect(isMessageTombstoned({
            attachment: { id: 'a1', lifecycleStatus: 'attached', mimeType: 'video/mp4' },
        })).toBe(false);
    });

    it('mensaje de texto normal sin adjunto no es tombstoned', () => {
        expect(isMessageTombstoned({ text: 'hola' })).toBe(false);
    });

    it('mensaje sin ningún campo no es tombstoned (nunca un falso positivo por datos ausentes)', () => {
        expect(isMessageTombstoned({})).toBe(false);
        expect(isMessageTombstoned(null)).toBe(false);
        expect(isMessageTombstoned(undefined)).toBe(false);
    });

    it('foto y video comparten exactamente el mismo contrato de tombstone de mensaje (sin lógica separada por tipo de medio)', () => {
        const tombstonedPhotoMessage = { deleted_at: '2026-09-10T00:00:00.000Z' };
        const tombstonedVideoMessage = { deleted_at: '2026-09-10T00:00:00.000Z' };
        expect(isMessageTombstoned(tombstonedPhotoMessage)).toBe(true);
        expect(isMessageTombstoned(tombstonedVideoMessage)).toBe(true);
    });
});

describe('hasLiveAttachment — sólo un adjunto attached es fetcheable, foto y video con el mismo contrato', () => {
    it('adjunto attached con id es live', () => {
        expect(hasLiveAttachment({ attachment: { id: 'a1', lifecycleStatus: 'attached' } })).toBe(true);
    });

    it('adjunto tombstoned no es live, incluso si conserva su id', () => {
        expect(hasLiveAttachment({ attachment: { id: 'a1', lifecycleStatus: 'tombstoned' } })).toBe(false);
    });

    it('adjunto todavía en "uploaded" (aún no attached al mensaje persistido) no es live — evita reintentos contra un adjunto que el backend todavía no autoriza', () => {
        expect(hasLiveAttachment({ attachment: { id: 'a1', lifecycleStatus: 'uploaded' } })).toBe(false);
    });

    it('adjunto "pending" no es live', () => {
        expect(hasLiveAttachment({ attachment: { id: 'a1', lifecycleStatus: 'pending' } })).toBe(false);
    });

    it('sin adjunto no es live', () => {
        expect(hasLiveAttachment({ text: 'hola' })).toBe(false);
        expect(hasLiveAttachment({})).toBe(false);
        expect(hasLiveAttachment(null)).toBe(false);
    });

    it('foto y video attached comparten exactamente el mismo contrato de "live"', () => {
        expect(hasLiveAttachment({ attachment: { id: 'p1', lifecycleStatus: 'attached', mimeType: 'image/jpeg' } })).toBe(true);
        expect(hasLiveAttachment({ attachment: { id: 'v1', lifecycleStatus: 'attached', mimeType: 'video/mp4' } })).toBe(true);
    });
});

describe('resolvableAttachmentId — el id que MessageItem.tsx puede pasar a resolveAttachmentUrl (cero fetches / cero reintentos cuando es null)', () => {
    // MessageItem.tsx sólo llama resolveAttachmentUrl(canonicalAttachmentId, ...)
    // cuando canonicalAttachmentId es verdadero. Al devolver null aquí para
    // cualquier adjunto no-'attached', se garantiza CERO llamadas a
    // resolveAttachmentUrl y, por lo tanto, cero posibilidad de que el
    // efecto entre en su bucle de reintento cada 3s — no hay nada que
    // reintentar si nunca se intentó una primera vez.
    it('adjunto tombstoned: devuelve null (cero llamadas a resolveAttachmentUrl posibles)', () => {
        expect(resolvableAttachmentId({ attachment: { id: 'a1', lifecycleStatus: 'tombstoned' } })).toBeNull();
    });

    it('adjunto todavía no attached (pending/uploaded): devuelve null', () => {
        expect(resolvableAttachmentId({ attachment: { id: 'a1', lifecycleStatus: 'pending' } })).toBeNull();
        expect(resolvableAttachmentId({ attachment: { id: 'a1', lifecycleStatus: 'uploaded' } })).toBeNull();
    });

    it('adjunto attached: devuelve el id real, habilitando exactamente un intento de fetch', () => {
        expect(resolvableAttachmentId({ attachment: { id: 'a1', lifecycleStatus: 'attached' } })).toBe('a1');
    });

    it('mensaje eliminado (deleted_at) cuyo adjunto también quedó tombstoned: null por la razón del adjunto, no por la del mensaje', () => {
        expect(resolvableAttachmentId({
            deleted_at: '2026-09-10T00:00:00.000Z',
            attachment: { id: 'a1', lifecycleStatus: 'tombstoned' },
        })).toBeNull();
    });

    it('foto y video comparten exactamente el mismo contrato de resolvableAttachmentId', () => {
        expect(resolvableAttachmentId({ attachment: { id: 'p1', lifecycleStatus: 'attached', mimeType: 'image/jpeg' } })).toBe('p1');
        expect(resolvableAttachmentId({ attachment: { id: 'v1', lifecycleStatus: 'attached', mimeType: 'video/mp4' } })).toBe('v1');
        expect(resolvableAttachmentId({ attachment: { id: 'p2', lifecycleStatus: 'tombstoned' } })).toBeNull();
        expect(resolvableAttachmentId({ attachment: { id: 'v2', lifecycleStatus: 'tombstoned' } })).toBeNull();
    });
});

describe('resolveDeletedMessageLabel — PING: REMOVE EMPTY MEDIA BUBBLE AFTER DELETE (universal label, never invented from stripped kind)', () => {
    // Proven against backend/src/utils/messageCompat.ts's toLegacyMessageShape:
    // the tombstone branch's attachment is hardcoded to
    // { id, lifecycleStatus: 'tombstoned' } — kind/mimeType never survive.
    // Per the task's own explicit fallback rule, the label must therefore
    // always be the universal one, regardless of any other field present.
    it('mensaje de texto eliminado: Mensaje eliminado', () => {
        expect(resolveDeletedMessageLabel({ deleted_at: '2026-09-10T00:00:00.000Z', text: 'Mensaje eliminado' }))
            .toBe('Mensaje eliminado');
    });

    it('foto eliminada: universal "Mensaje eliminado", nunca "Foto eliminada" (el payload no conserva kind)', () => {
        expect(resolveDeletedMessageLabel({
            deleted_at: '2026-09-10T00:00:00.000Z',
            attachment: { id: 'p1', lifecycleStatus: 'tombstoned' },
        })).toBe('Mensaje eliminado');
    });

    it('video eliminado: universal "Mensaje eliminado", nunca "Video eliminado" (el payload no conserva kind)', () => {
        expect(resolveDeletedMessageLabel({
            deleted_at: '2026-09-10T00:00:00.000Z',
            attachment: { id: 'v1', lifecycleStatus: 'tombstoned' },
        })).toBe('Mensaje eliminado');
    });

    it('no inventa el tipo aunque un campo local obsoleto conserve mimeType (el backend nunca lo envía tombstoned, pero la política tampoco confía en él)', () => {
        expect(resolveDeletedMessageLabel({
            deleted_at: '2026-09-10T00:00:00.000Z',
            attachment: { id: 'p1', lifecycleStatus: 'tombstoned', mimeType: 'image/jpeg' },
        })).toBe('Mensaje eliminado');
    });
});

describe('render-order guard — canonical tombstone priority forces every media boolean inert (PING: REMOVE EMPTY MEDIA BUBBLE AFTER DELETE)', () => {
    // MessageItem.tsx derives isImage/isVideo/isAudio/isDocument/mediaUrl
    // gated on `!isTombstoned` as the first condition, so no cached
    // attachment.mimeType or legacy [imagen]/[video]/[audio]/[document=
    // text prefix can resurrect a media layout for a canonically deleted
    // message. This test proves the exact boolean logic MessageItem.tsx
    // now runs, since this repo has no React component-render test
    // infrastructure (see vitest.config.ts) — the decision is mirrored
    // here as pure logic instead of rendered.
    function deriveMediaFlags(item: any, meta: any) {
        const isTombstoned = isMessageTombstoned(item);
        const canonicalAttachmentId = resolvableAttachmentId(item);
        const msgText: string = isTombstoned ? resolveDeletedMessageLabel(item) : (item.content ?? item.text ?? '');
        const trimmedText = msgText.trim();
        const privateMimeType = isTombstoned ? '' : String(item?.attachment?.mimeType || meta?.attachment?.mimeType || '');
        const hasPrivateAttachment = !isTombstoned && (!!canonicalAttachmentId || (!!item.media_bucket && !!item.media_object_path));
        const isImage = !isTombstoned && (privateMimeType.startsWith('image/') || trimmedText.startsWith('[imagen]'));
        const isAudio = !isTombstoned && (privateMimeType.startsWith('audio/') || trimmedText.startsWith('[audio]'));
        const isVideo = !isTombstoned && (privateMimeType.startsWith('video/') || trimmedText.startsWith('[video]'));
        const isDocument = !isTombstoned && ((hasPrivateAttachment && !isImage && !isAudio && !isVideo) || trimmedText.startsWith('[document='));
        const mediaUrl: string | null = hasPrivateAttachment ? 'signed-url-placeholder' : null;
        const usesBubbleMediaStyle = isImage || isVideo || isAudio;
        return { isTombstoned, hasPrivateAttachment, isImage, isAudio, isVideo, isDocument, mediaUrl, usesBubbleMediaStyle, msgText };
    }

    it('foto saliente eliminada: sin wrapper de medios, sin dimensiones, tombstone compacto', () => {
        const flags = deriveMediaFlags({
            deleted_at: '2026-09-10T00:00:00.000Z',
            attachment: { id: 'p1', lifecycleStatus: 'tombstoned', mimeType: 'image/jpeg' },
        }, {});
        expect(flags.isImage).toBe(false);
        expect(flags.hasPrivateAttachment).toBe(false);
        expect(flags.usesBubbleMediaStyle).toBe(false);
        expect(flags.mediaUrl).toBeNull();
        expect(flags.msgText).toBe('Mensaje eliminado');
    });

    it('video eliminado: sin wrapper de medios, sin dimensiones, tombstone compacto', () => {
        const flags = deriveMediaFlags({
            deleted_at: '2026-09-10T00:00:00.000Z',
            attachment: { id: 'v1', lifecycleStatus: 'tombstoned', mimeType: 'video/mp4' },
        }, {});
        expect(flags.isVideo).toBe(false);
        expect(flags.hasPrivateAttachment).toBe(false);
        expect(flags.usesBubbleMediaStyle).toBe(false);
        expect(flags.mediaUrl).toBeNull();
        expect(flags.msgText).toBe('Mensaje eliminado');
    });

    it('medio entrante eliminado: mismo comportamiento compacto que saliente (mismo contrato sin importar isMe)', () => {
        const flags = deriveMediaFlags({
            deleted_at: '2026-09-10T00:00:00.000Z',
            sender_id: 'other-user',
            attachment: { id: 'p2', lifecycleStatus: 'tombstoned', mimeType: 'image/png' },
        }, {});
        expect(flags.usesBubbleMediaStyle).toBe(false);
        expect(flags.mediaUrl).toBeNull();
    });

    it('sin resolución de URL de medios tras el borrado, incluso con un prefijo legacy [imagen]/[video] residual en el texto', () => {
        const flags = deriveMediaFlags({
            deleted_at: '2026-09-10T00:00:00.000Z',
            text: '[imagen]https://example.com/old.jpg',
        }, {});
        expect(flags.isImage).toBe(false);
        expect(flags.mediaUrl).toBeNull();
        expect(flags.msgText).toBe('Mensaje eliminado');
    });

    it('foto en vivo (no eliminada): el layout de medios se conserva sin cambios', () => {
        const flags = deriveMediaFlags({
            attachment: { id: 'p1', lifecycleStatus: 'attached', mimeType: 'image/jpeg' },
        }, {});
        expect(flags.isImage).toBe(true);
        expect(flags.hasPrivateAttachment).toBe(true);
        expect(flags.usesBubbleMediaStyle).toBe(true);
    });

    it('video en vivo (no eliminado): el layout de medios se conserva sin cambios', () => {
        const flags = deriveMediaFlags({
            attachment: { id: 'v1', lifecycleStatus: 'attached', mimeType: 'video/mp4' },
        }, {});
        expect(flags.isVideo).toBe(true);
        expect(flags.hasPrivateAttachment).toBe(true);
        expect(flags.usesBubbleMediaStyle).toBe(true);
    });

    it('tombstone de texto sin cambios: continúa mostrando "Mensaje eliminado" sin ningún flag de medios', () => {
        const flags = deriveMediaFlags({
            deleted_at: '2026-09-10T00:00:00.000Z',
            text: 'Mensaje eliminado',
        }, {});
        expect(flags.isImage).toBe(false);
        expect(flags.isVideo).toBe(false);
        expect(flags.isAudio).toBe(false);
        expect(flags.isDocument).toBe(false);
        expect(flags.usesBubbleMediaStyle).toBe(false);
        expect(flags.msgText).toBe('Mensaje eliminado');
    });
});

describe('resolveMessageMetadata', () => {
    it('usa metadata antes que meta cuando ambos estan presentes', () => {
        expect(resolveMessageMetadata({ metadata: { isSystem: true }, meta: { isSystem: false } })).toEqual({ isSystem: true });
    });

    it('cae a meta si metadata no esta presente', () => {
        expect(resolveMessageMetadata({ meta: { isSystem: true } })).toEqual({ isSystem: true });
    });

    it('permite actuar sobre una sugerencia recibida por Realtime usando metadata V2', () => {
        const suggestedTask = { title: 'Ver película', dueAt: '2026-07-31T16:00:00.000Z' };
        expect(resolveMessageMetadata({ metadata: { suggestedTask } }).suggestedTask)
            .toEqual(suggestedTask);
    });
});
