import { describe, expect, it } from 'vitest';
import { compareLegacySemanticToV4 } from '../src/services/agentSemanticShadow.service';
import type { AgentSemanticInterpretation } from '../src/services/agentSemanticInterpreter.service';
import type { NormalizedSemanticTurnV4 } from '../src/types/agentTurnCommit';
const legacy:AgentSemanticInterpretation={route:'read',objective:null,interpretation:{intent:'recall',isWriteActionRequest:false,fallbackUsed:false} as any};
const v4:NormalizedSemanticTurnV4={version:4,kind:'write_request',domain:'commitment',objectiveCompleteness:'complete',lifecycleCommand:'none',lifecycleTarget:'unspecified',lifecycleEvidence:'unknown',pendingSlotAnswer:'not_a_slot_answer',continuationLike:'no',candidateSlotType:null,independentObjective:'yes',objectiveType:'create_personal_commitment',entityHints:[],slots:{},ambiguityFields:[],confidence:.9,source:'llm',readMeaning:null};
describe('semantic shadow comparator',()=>{it('reports disagreement without deciding the route',()=>{expect(compareLegacySemanticToV4(legacy,v4)).toEqual(expect.arrayContaining([{dimension:'route',legacy:'read',v4:'write'},{dimension:'objective',legacy:null,v4:'create_personal_commitment'}]));});});
