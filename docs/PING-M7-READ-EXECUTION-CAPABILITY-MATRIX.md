# M-7 READ Execution Contract and Capability Matrix

This document records the contract at HEAD `d44a58e`. It is a design boundary,
not a Retrieval implementation and not a claim that every planned query is
currently executable.

## Ownership

`CanonicalReadQuery` defines the canonical question. A future Core-owned
`ReadExecutionService` selects only operations that preserve every query
constraint. Retrieval obtains canonical facts. Evidence Support later decides
whether those facts prove the requested relationship.

The execution result must distinguish `complete`, `partial`, `unknown`,
`unsupported`, and execution failure. Only a complete execution may return
`no_matching_fact`.

## Existing operations and capability status

| Query | Existing primitive | Exact constraints today | Authorization | Completeness | Status |
| --- | --- | --- | --- | --- | --- |
| Commitment focused current state | `retrieveVisibleCommitmentById` | Canonical commitment ID and current state | Commitment visibility filter | Single target | Supported for current-state focused reads |
| Commitment collection | `retrieveCommitments` | Actor visibility, structured filters, approved FTS | Visibility filter | Bounded limit | Partial/unknown; not complete collection |
| Commitment count | None | No exact count operation | N/A | Not available | Unsupported |
| Commitment lifecycle exact transition | `retrieveCommitmentEvents` | Target can be authorized, but no `eventType` filter | Commitment visibility filter | Bounded events | Unsupported until event-type capability exists |
| Proposal focused | No public by-ID READ resolver | No safe exact focused operation | N/A | Not available | Unsupported |
| Proposal collection | `retrieveCommitmentProposals` | Scope/status/time/approved FTS; focus is filtered later by `agentContextBuilder` | Proposal visibility/participation | Safety cap or bounded limit | Unsupported as exact V4 execution |
| Proposal count | None | No exact count operation | N/A | Not available | Unsupported |
| Proposal focus | `filterByProposalFocus` in legacy context builder | Uses participation facts after retrieval, outside execution boundary | Core-derived participation | Safety cap may be reached | Unsupported until extracted as execution capability |
| Person identity | `resolvePerson` / `AgentPersonResolutionService` | Canonical person resolution | Actor/shared-profile authorization | Unique/ambiguous/zero-match | Reused by target resolution, not READ execution |
| Person relationship query | No dedicated operation | Retrieval inclusion does not prove relationship | Varies by source | Not available | Unsupported for exact relational execution |
| Conversation validation | `assertConversationParticipant` | Validates an already supplied conversation ID | Actor membership | Single validation | Reusable |
| Message collection | `retrieveMessages` / context retrieval | Conversation, person sender, approved FTS, time range | Conversation membership where applicable | Bounded limit | Partial/unknown unless completeness is separately proven |
| Message focused by ID | No public Core READ resolver | Message-window primitive is not a general target resolver | Must validate parent conversation | Not available as a typed operation | Unsupported |
| Attachment collection | `retrieveAttachments` | Authorized conversation and kind filters | Conversation membership | Bounded limit | Partial/unknown |
| Attachment focused by ID | Internal application lookup only | Not a reusable READ primitive | Owner/application-specific rules | Not available | Unsupported |
| Transcription collection | `retrieveTranscriptions` | Authorized conversation, text/time filters | Conversation membership | Bounded limit | Partial/unknown |
| Transcription focused by ID | `retrieveTranscriptionForAttachment` | Attachment lineage and completed audio transcript | Parent conversation membership | Single target | Reusable only after a typed target/lineage contract is exposed |
| Temporal filter range | `timeRange` in Retrieval | Only compatible resolved date/range values | Scope authorization | Depends on source query | Partially reusable |
| Temporal occurrence time | None | Retrieval has no occurrence-role filter | N/A | Not available | Unsupported |
| Elapsed/duration | None | No equivalent Retrieval constraint | N/A | Not available | Unsupported |
| Approved text search | `query` + Postgres FTS | Scope plus approved text constraint | Existing source authorization | Bounded unless full scan/count exists | Partial/unknown for collections |

## Contract rules

- `focused` means a canonical target, not “top result”.
- `collection` is complete only when the source is exhausted or the operation
  provides a database-level completeness guarantee.
- `count` requires an exact count operation over the authorized universe.
- Lifecycle execution must preserve both target ID and exact requested event
  type.
- Proposal focus must be an execution constraint, not a later language or
  presentation filter.
- Parent lineage is preserved when persisted and nullable when absent.
- Retrieval source presence does not prove the requested relationship.
- Unsupported and failed results contain no facts that could be presented as a
  definitive answer.
- A partial/unknown empty result is inconclusive, never “no evidence”.

## Required next capabilities

The next implementation slice should add specialized, authorization-reusing
operations for exact lifecycle events, proposal focus, counts, canonical
message/attachment targets, and temporal occurrence/elapsed roles. It should
also return explicit completeness metadata rather than relying on array length.
