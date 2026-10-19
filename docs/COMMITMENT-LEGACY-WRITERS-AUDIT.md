# Auditoría de Commitment Core y legacy satellite writers

Fecha: 2026-10-19

## Resultado

Se revisaron los escritores y adapters de Commitment en Controllers, Services,
Repositories y pruebas, con foco en Calendar, Calls y Operation. No se cambió
ninguna migración ni se ejecutó una operación remota.

El único `.update()` directo sobre `commitments` fuera de los RPC canónicos era
Calendar. El slice seguro aplicado en este bloque no elimina todavía esa
excepción: centraliza las rutas manual y automática en
`persistCalendarCommitmentSync`, dentro de `calendar_sync.service.ts`, y la
mantiene protegida por `ENABLE_NON_MVP_CAPABILITIES`,
`ENABLE_CALENDAR_INTEGRATION` y `ENABLE_LEGACY_SATELLITE_WRITERS`.

## Inventario

| Área | Escritura sobre `commitments` | Estado |
| --- | --- | --- |
| HTTP Commitment | `commitmentApplication.service.ts` delega en Proposal/Lifecycle | Canónico |
| Calls | `createProposal`; no crea un Commitment desde una interpretación IA | Correcto y contenido |
| Operation | Lifecycle por `commitmentApplication`; progreso en `commitment_operation_progress` | Correcto y contenido |
| Calendar manual | Metadata de sincronización externa | Legacy allowlisted, centralizado |
| Calendar automático | Metadata de sincronización externa | Legacy allowlisted, centralizado |

Las lecturas de `commitments` en búsqueda, IA, insights, retrieval y validación
no son writers y no se alteraron.

## Por qué no se migró Calendar al Core todavía

`edit_commitment_with_evidence` acepta únicamente campos descriptivos del
Commitment y registra un evento `edited`. No acepta `meta`, y ampliar ese RPC
para metadata de un proveedor externo mezclaría integración externa con el
ciclo de vida canónico. Usar ese RPC de forma artificial también produciría
auditoría de una edición de usuario que realmente no ocurrió.

Por eso este bloque sólo reduce la superficie legacy y no pretende declarar
Calendar canónico. El helper valida el mismo gate en el punto de escritura y
propaga errores que antes se ignoraban.

## Slice estructural propuesto

El siguiente slice debe ser una migración aditiva y coordinada, no un cambio
local aislado:

1. Crear `commitment_external_links` con clave única
   `(commitment_id, provider)`, `external_event_id`, `external_event_url`,
   `sync_status`, `conflict_detected`, `last_sync_at`, timestamps y una
   referencia al actor que sincronizó.
2. Crear un RPC service-role
   `upsert_commitment_external_link_with_evidence(...)` que valide la
   visibilidad del actor, haga upsert idempotente y deje evidencia específica
   de integración sin modificar `commitments.meta`.
3. Leer primero el sidecar con compatibilidad hacia atrás con las claves
   históricas de `commitments.meta`; después escribir sólo el sidecar.
4. Ejecutar backfill reversible de los metadatos existentes y verificar
   conteos por proveedor antes de retirar el writer legacy.
5. Eliminar el helper legacy y su allowlist sólo después de que manual y
   automático usen el RPC y las pruebas de concurrencia, autorización,
   idempotencia y rollback pasen desde una base local limpia.

Este slice requiere cambiar `supabase/migrations/` y aplicar/validar el cambio
en el proyecto correcto. Queda fuera de esta tarea por la restricción explícita
de no cambiar la migración remota.
