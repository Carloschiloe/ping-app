function text(value) {
  return typeof value === 'string' ? value.toLocaleLowerCase('es-CL') : '';
}

function objectiveOf(turn) {
  return turn?.checkpoint?.activeObjective ?? null;
}

function includesAny(value, terms) {
  const haystack = text(value);
  return terms.some((term) => haystack.includes(term));
}

function objectiveMatches(objective, { entity, time, excludedEntity, excludedTime }) {
  if (!objective || objective.objectiveType !== 'create_commitment_or_proposal') return false;
  const entityText = [
    ...(Array.isArray(objective.entityHints) ? objective.entityHints : []),
    objective.desiredOutcome,
  ].join(' ');
  const timeText = objective.timeHint;
  return includesAny(entityText, entity)
    && includesAny(timeText, time)
    && !includesAny(entityText, excludedEntity ?? [])
    && !includesAny(timeText, excludedTime ?? []);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * Checks the semantic invariants of the deliberately small staging dialogue.
 * This is a harness assertion over structured checkpoint fields; it does not
 * classify language, route requests, or alter product behavior.
 */
export function assertStrongM7Sequence(turns) {
  assert(Array.isArray(turns) && turns.length === 8, 'Expected exactly eight staging turns');
  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index];
    assert(turn.status === 200, `Turn ${index + 1} did not return HTTP 200`);
    assert(turn.checkpoint?.turnSequence === index + 1, `Turn ${index + 1} sequence is not monotonic`);
  }

  const first = objectiveOf(turns[0]);
  assert(objectiveMatches(first, { entity: ['inventario'], time: ['jueves'] }),
    'Turn 1 did not retain the proposed inventory objective for Thursday');

  const switched = objectiveOf(turns[1]);
  assert(objectiveMatches(switched, {
    entity: ['proveedor'],
    time: ['viernes'],
    excludedEntity: ['inventario'],
    excludedTime: ['jueves'],
  }), 'Turn 2 did not replace the objective and its date atomically');

  const pendingFollowUp = objectiveOf(turns[2]);
  assert(objectiveMatches(pendingFollowUp, {
    entity: ['proveedor'],
    time: ['viernes'],
    excludedEntity: ['inventario'],
    excludedTime: ['jueves'],
  }), 'Turn 3 contaminated or lost the current objective');

  const returned = objectiveOf(turns[3]);
  assert(objectiveMatches(returned, {
    entity: ['inventario'],
    time: ['jueves'],
    excludedEntity: ['proveedor'],
    excludedTime: ['viernes'],
  }), 'Turn 4 did not restore the explicitly requested inventory scope');

  const corrected = objectiveOf(turns[4]);
  assert(objectiveMatches(corrected, {
    entity: ['inventario'],
    time: ['lunes'],
    excludedEntity: ['proveedor'],
    excludedTime: ['jueves', 'viernes'],
  }), 'Turn 5 did not replace only the active inventory date');

  const deferred = objectiveOf(turns[5]);
  assert(objectiveMatches(deferred, {
    entity: ['inventario'],
    time: ['lunes'],
    excludedEntity: ['proveedor'],
    excludedTime: ['jueves', 'viernes'],
  }), 'Turn 6 changed the objective while deferring the current plan');
  const deferredResponse = turns[5].response;
  const safeDeferral = deferredResponse?.kind === 'clarification'
    || deferredResponse?.kind === 'plan'
    || (deferredResponse?.kind === 'response' && deferredResponse.responseStatus === 'answered');
  assert(safeDeferral, 'Turn 6 did not produce a safe non-executing response');

  const confirmed = objectiveOf(turns[6]);
  assert(objectiveMatches(confirmed, {
    entity: ['inventario'],
    time: ['lunes'],
    excludedEntity: ['proveedor'],
    excludedTime: ['jueves', 'viernes'],
  }), 'Turn 7 confirmation was not bound to the current objective');
  // The canonical staging runtime now owns the complete confirmation path:
  // /agent/turn binds the confirmation, then the server performs the
  // canonical authorization/execution boundary before returning its final
  // response.  The old assertion that required a dry-run plan described the
  // pre-unification client-orchestrated contract and is no longer valid.
  assert(turns[6].response?.kind === 'response', 'Turn 7 confirmation did not return the canonical execution response');
  assert(turns[6].response?.responseStatus === 'answered', 'Turn 7 confirmation did not report a verified successful execution');
  assert(turns[6].execution?.status === 'done', 'Turn 7 execution did not reach done');
  assert(turns[6].execution?.verified === true, 'Turn 7 execution was not verified');

  const readAfterWrite = objectiveOf(turns[7]);
  assert(readAfterWrite && readAfterWrite.objectiveType === 'create_commitment_or_proposal',
    'Turn 8 did not preserve canonical context for read-after-write');
  assert(turns[7].response?.kind === 'response' || turns[7].response?.kind === 'clarification',
    'Turn 8 did not return a canonical read-after-write response');
  return { ok: true };
}

