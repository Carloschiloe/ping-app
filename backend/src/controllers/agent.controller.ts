// M-1F — Agent controller. Mínimo por diseño (sección 6): lee `req.user.id`,
// delega todo al orquestador, mapea el resultado a la forma pública, mapea
// errores conocidos a HTTP. Ninguna lógica de retrieval, ninguna llamada a
// un modelo, ningún SQL — todo eso vive en las capas ya certificadas que el
// orquestador compone.
import { Request, Response } from 'express';
import { runAgent } from '../services/agentOrchestrator.service';
import { toPublicAgentResponse } from '../types/agent';
import { AppError } from '../utils/AppError';

export const respond = async (req: Request, res: Response): Promise<void> => {
    try {
        // actorUserId SIEMPRE desde el actor autenticado — nunca desde el
        // body (sección 4). El schema (agentRequest.schema.ts) ni siquiera
        // declara userId/actorUserId/tenantId, así que un cliente que los
        // mande los pierde en el parseo antes de llegar aquí.
        const actorUserId = req.user!.id;
        const { input, conversationId, channel, locale, timezone } = req.body;

        const response = await runAgent({ actorUserId, input, conversationId, channel, locale, timezone });

        // Secciones 16-17: no_evidence/capability_gap/needs_clarification son
        // respuestas VÁLIDAS del agente, no errores — siempre HTTP 200 junto
        // con "answered", ya que sólo llegan aquí si `runAgent` no lanzó.
        res.status(200).json(toPublicAgentResponse(response));
    } catch (error: any) {
        // Sección 19: un fallo del proveedor (interpreter o synthesis) que sí
        // llega hasta acá significa que INCLUSO el fallback determinístico
        // falló de forma inesperada (no debería pasar en el flujo normal,
        // ver docs) — nunca se expone el proveedor/modelo/detalle interno en
        // el mensaje público. Errores conocidos (AppError, ej. 403 de
        // autorización) sí exponen su mensaje, porque ya son seguros por
        // diseño (M-1B.1/M-1D/M-1E los construyen así).
        const statusCode = error instanceof AppError ? error.statusCode : 500;
        res.status(statusCode).json({
            error: statusCode === 500 ? 'The agent could not process your request right now.' : error.message,
        });
    }
};
