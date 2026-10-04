# Ping linguistic rule audit

Status: architectural audit after `5d733586ef0a694c340d2f209d62cdae0b2824c0`.

This inventory distinguishes language interpretation from deterministic domain
guards. It is not a vocabulary allow-list for the model or a test fixture.

| Runtime area | Classification | Decision |
| --- | --- | --- |
| `agentDialogueContinuation.classifyPendingPlanDecision` | `SAFETY_INVARIANT` | Keep. It consumes the structured semantic decision and protects confirmation/rejection/correction, stale plans and zero-write paths. |
| `agentAuthorizationPolicy` and canonical authorization/execution checks | `SAFETY_INVARIANT` | Keep. These are not language interpretation and cannot be delegated to an LLM. |
| `date-parser.service` and timezone normalization | `PARSER_LEGITIMATE` | Keep. They parse temporal slots after semantic routing; they do not decide ownership, confirmation or execution. |
| `agentContextBuilder` live entity/result resolution and ambiguity checks | `PARSER_LEGITIMATE` / `SAFETY_INVARIANT` | Keep. They reconcile authorized data and block unsafe ambiguity; they do not select arbitrary natural-language intent. |
| `canonicalSemanticProducer` provider/schema/normalization fallback | `SEMANTIC_FALLBACK` | Keep as fail-closed behavior (`unknown`/clarification); it is activated by provider or contract failure, not by a phrase. |
| `message.service` smart-trigger `taskKeywords` | `LEGACY_LANGUAGE_PATCH` | Leave isolated for existing messaging compatibility; it is not part of the canonical `/agent/turn` runtime and is not used to authorize Core actions. A separate migration is required before removal. |
| `retrieval.service` exact phrase/rank helpers | `PARSER_LEGITIMATE` | Keep as bounded retrieval ranking, never as semantic authority or execution routing. |
| `EXPLICIT_PLAN_CONFIRMATION_PHRASES` and its early route | `REMOVE_OR_REPLACE` | Removed in `5d733586`; confirmation now comes from the structured semantic continuation decision and canonical runtime state. |

No remaining active canonical route was found that converts a fixed natural
language phrase into authorization. The remaining regular expressions are
temporal parsing, punctuation/entity-shape parsing, retrieval ranking, or
legacy messaging triggers and must not be silently replaced by an LLM.
