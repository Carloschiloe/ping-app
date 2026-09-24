import type { NormalizedSemanticTurnV4 } from '../types/agentTurnCommit';
import type { AgentSemanticInterpretation } from './agentSemanticInterpreter.service';

export type SemanticShadowDimension = 'route' | 'objective' | 'uncertainty';
export interface SemanticShadowDifference { dimension: SemanticShadowDimension; legacy: string | null; v4: string | null; }

/** Pure comparison only: cannot route, plan, authorize, or execute. */
export function compareLegacySemanticToV4(legacy: AgentSemanticInterpretation, v4: NormalizedSemanticTurnV4): SemanticShadowDifference[] {
 const out: SemanticShadowDifference[]=[];
 const v4Route=v4.kind==='read_request'?'read':v4.kind==='write_request'?'write':null;
 if(v4Route!==legacy.route) out.push({dimension:'route',legacy:legacy.route,v4:v4Route});
 const legacyObjective=legacy.objective?.objectiveType??null, v4Objective=v4.objectiveType??null;
 if(legacyObjective!==v4Objective) out.push({dimension:'objective',legacy:legacyObjective,v4:v4Objective});
 const v4Uncertain=v4.kind==='unknown'||v4.confidence<0.5||v4.ambiguityFields.length>0;
 const legacyUncertain=legacy.interpretation.fallbackUsed===true;
 if(v4Uncertain!==legacyUncertain) out.push({dimension:'uncertainty',legacy:legacyUncertain?'uncertain':'confident',v4:v4Uncertain?'uncertain':'confident'});
 return out;
}
