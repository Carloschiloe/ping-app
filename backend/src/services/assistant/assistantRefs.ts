// Opaque short references are the only handles the model ever holds. A ref
// exists only because a tool showed that entity in this conversation, so the
// model can never act on something it was not shown, and never sees an id.
import type { AssistantRefEntry, AssistantRefKind } from './assistantTypes';

const PREFIX: Record<AssistantRefKind, string> = { commitment: 'c', person: 'p', action: 'a' };
const MAX_REFS = 300;

export class AssistantRefTable {
    private readonly entries: AssistantRefEntry[];

    public constructor(entries: AssistantRefEntry[] = []) {
        this.entries = entries.slice(-MAX_REFS);
    }

    public refFor(kind: AssistantRefKind, id: string, label: string): string {
        const existing = this.entries.find((entry) => entry.kind === kind && entry.id === id);
        if (existing) {
            existing.label = label;
            return existing.ref;
        }
        const prefix = PREFIX[kind];
        const next = this.entries
            .filter((entry) => entry.kind === kind)
            .reduce((max, entry) => Math.max(max, Number(entry.ref.slice(prefix.length)) || 0), 0) + 1;
        const ref = `${prefix}${next}`;
        this.entries.push({ ref, kind, id, label });
        if (this.entries.length > MAX_REFS) this.entries.splice(0, this.entries.length - MAX_REFS);
        return ref;
    }

    public resolve(ref: unknown, kind: AssistantRefKind): AssistantRefEntry | null {
        if (typeof ref !== 'string') return null;
        const normalized = ref.trim().toLowerCase();
        return this.entries.find((entry) => entry.kind === kind && entry.ref === normalized) ?? null;
    }

    public toJSON(): AssistantRefEntry[] {
        return this.entries.map((entry) => ({ ...entry }));
    }
}
