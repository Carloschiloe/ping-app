import {
    AgentSemanticV4HighFidelityReadOnlyResolver,
    type HighFidelityReadOnlyRepository,
} from '../src/services/agentSemanticV4HighFidelityReadOnly.service';
import type { V4CoreShadowResolver } from '../src/services/agentSemanticV4CoreShadow.service';

/**
 * Certification-only boundary. The in-memory repository is storage; the
 * high-fidelity resolver is the V4CoreShadowResolver required by the Core
 * shadow. Keeping this construction here prevents the harness from passing
 * the repository object as if it were the resolver.
 */
export function createBlindShadowResolver(repository: HighFidelityReadOnlyRepository): V4CoreShadowResolver {
    return new AgentSemanticV4HighFidelityReadOnlyResolver(repository);
}
