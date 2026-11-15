// Scores a meeting analysis against the written references, with fixed rules
// and no model involved, so two runs of the same answer always score the same.
import type { MeetingAnalysis } from '../../src/services/meetings/meetingTypes';
import type { Group, MeetingCase, ReferenceCommitment } from '../fixtures/meetingBench';

export const norm = (text: string) => text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/(\d)[.,](\d{3})\b/g, '$1$2')
    .replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ').trim();

const words = (text: string) => norm(text).split(' ').filter(Boolean);

export function groupHits(text: string, group: Group): boolean {
    const n = ` ${norm(text)} `;
    const ws = words(text);
    return group.some((stem) => {
        const s = norm(stem);
        return s.includes(' ') ? n.includes(` ${s} `) : ws.some((w) => w.startsWith(s));
    });
}

export const allGroupsHit = (text: string, groups: Group[]) => groups.every((g) => groupHits(text, g));

function ownerMatches(predicted: string | null, owner: string | string[]): boolean {
    if (!predicted) return false;
    const ws = words(predicted);
    return (Array.isArray(owner) ? owner : [owner]).some((name) => ws.includes(words(name)[0]));
}

export interface CaseScore {
    id: string;
    kinds: string[];
    required: number;
    found: number;
    optionalFound: number;
    predicted: number;
    extra: number; // proposals that match no reference
    mustNotHits: number; // extras that are a cancelled / declined / hypothetical item
    ownerOk: number;
    dateOk: number;
    conditionalOk: number;
    conditionalChecked: number;
    dependencyOk: number;
    dependencyChecked: number;
    decisionsFound: number;
    decisionsExpected: number;
    factsFound: number;
    factsExpected: number;
    perfect: boolean;
    problems: string[];
}

export function scoreCase(testCase: MeetingCase, analysis: MeetingAnalysis): CaseScore {
    const preds = analysis.commitments;
    const used = new Set<number>();
    const matchOf = new Map<string, number>();
    const textOf = (i: number) => `${preds[i].task} ${preds[i].condition || ''}`;
    const problems: string[] = [];

    // Required references first, so a half-promise never takes a real one's match.
    const ordered = [...testCase.commitments].sort((a, b) => Number(!!a.optional) - Number(!!b.optional));
    for (const ref of ordered) {
        const candidates = preds.map((_, i) => i).filter((i) => !used.has(i) && allGroupsHit(textOf(i), ref.what));
        const best = candidates.find((i) => ownerMatches(preds[i].owner, ref.owner)) ?? candidates[0];
        if (best !== undefined) { used.add(best); matchOf.set(ref.id, best); }
    }

    let found = 0; let optionalFound = 0; let ownerOk = 0; let dateOk = 0;
    let conditionalOk = 0; let conditionalChecked = 0; let dependencyOk = 0; let dependencyChecked = 0;
    for (const ref of testCase.commitments) {
        const index = matchOf.get(ref.id);
        if (index === undefined) {
            if (!ref.optional) problems.push(`falta: ${ref.id} (${ref.what.map((g) => g[0]).join(' ')})`);
            continue;
        }
        if (ref.optional) optionalFound += 1; else found += 1;
        const p = preds[index];
        if (ownerMatches(p.owner, ref.owner)) ownerOk += 1; else problems.push(`${ref.id}: responsable «${p.owner}» y era ${[ref.owner].flat().join('/')}`);
        const dues = [ref.due, ...(ref.dueAlt || [])];
        if (dues.includes(p.dueDate)) dateOk += 1; else problems.push(`${ref.id}: fecha ${p.dueDate} y era ${ref.due}`);
        // "When X is done, I do Y" is a dependency; calling it a condition too is fine.
        if (!(ref.dependsOn && ref.conditional === undefined)) {
            conditionalChecked += 1;
            if (p.conditional === !!ref.conditional) conditionalOk += 1; else problems.push(`${ref.id}: condicional ${p.conditional}`);
        }
        if (ref.dependsOn) {
            dependencyChecked += 1;
            const dependencyIndex = matchOf.get(ref.dependsOn);
            if (dependencyIndex !== undefined && p.dependsOn === dependencyIndex) dependencyOk += 1;
            else problems.push(`${ref.id}: no vio que depende de ${ref.dependsOn}`);
        }
    }

    const extras = preds.map((_, i) => i).filter((i) => !used.has(i));
    const mustNotHits = extras.filter((i) => (testCase.mustNot || []).some((groups) => allGroupsHit(textOf(i), groups))).length;
    for (const i of extras) problems.push(`sobra: «${preds[i].task}» (${preds[i].owner})`);

    const decisionText = analysis.decisions.join(' · ');
    const decisionsExpected = testCase.decisions?.length || 0;
    const decisionsFound = (testCase.decisions || []).filter((groups) => allGroupsHit(decisionText, groups)).length;
    if (decisionsFound < decisionsExpected) problems.push('faltó una decisión');
    const factsExpected = testCase.facts?.length || 0;
    const factsFound = (testCase.facts || []).filter((groups) => allGroupsHit(analysis.summary, groups)).length;
    if (factsFound < factsExpected) problems.push('al resumen le faltó un dato');

    const required = testCase.commitments.filter((c) => !c.optional).length;
    const matchedCount = found + optionalFound;
    const perfect = found === required && extras.length === 0 && ownerOk === matchedCount && dateOk === matchedCount
        && dependencyOk === dependencyChecked && conditionalOk === conditionalChecked;

    return {
        id: testCase.id, kinds: testCase.kinds, required, found, optionalFound, predicted: preds.length,
        extra: extras.length, mustNotHits, ownerOk, dateOk, conditionalOk, conditionalChecked,
        dependencyOk, dependencyChecked, decisionsFound, decisionsExpected, factsFound, factsExpected, perfect, problems,
    };
}

export interface BenchTotals {
    cases: number;
    perfectCases: number;
    recall: number; // required found / required
    precision: number; // proposals that match a reference / proposals
    invented: number; // extra proposals
    mustNotHits: number;
    ownerAccuracy: number;
    dateAccuracy: number;
    conditionalAccuracy: number;
    dependencyAccuracy: number;
    decisionCoverage: number;
    factCoverage: number;
    noCommitmentCasesClean: string; // "x/y" cases without commitments where nothing was proposed
}

const ratio = (a: number, b: number) => (b === 0 ? 1 : a / b);

export function totals(scores: CaseScore[], cases: MeetingCase[]): BenchTotals {
    const sum = (key: keyof CaseScore) => scores.reduce((acc, s) => acc + (s[key] as number), 0);
    const matched = sum('found') + sum('optionalFound');
    const empty = cases.filter((c) => c.commitments.length === 0).map((c) => c.id);
    const clean = scores.filter((s) => empty.includes(s.id) && s.predicted === 0).length;
    return {
        cases: scores.length,
        perfectCases: scores.filter((s) => s.perfect).length,
        recall: ratio(sum('found'), sum('required')),
        precision: ratio(matched, sum('predicted')),
        invented: sum('extra'),
        mustNotHits: sum('mustNotHits'),
        ownerAccuracy: ratio(sum('ownerOk'), matched),
        dateAccuracy: ratio(sum('dateOk'), matched),
        conditionalAccuracy: ratio(sum('conditionalOk'), sum('conditionalChecked')),
        dependencyAccuracy: ratio(sum('dependencyOk'), sum('dependencyChecked')),
        decisionCoverage: ratio(sum('decisionsFound'), sum('decisionsExpected')),
        factCoverage: ratio(sum('factsFound'), sum('factsExpected')),
        noCommitmentCasesClean: `${clean}/${scores.filter((s) => empty.includes(s.id)).length}`,
    };
}

// ---------- transcription ----------

/** Word error rate: (substitutions + deletions + insertions) / reference words. */
export function wordErrorRate(reference: string, hypothesis: string): { wer: number; substitutions: number; deletions: number; insertions: number; words: number } {
    const r = words(reference); const h = words(hypothesis);
    const d: number[][] = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
    for (let j = 1; j <= h.length; j += 1) d[0][j] = j;
    for (let i = 1; i <= r.length; i += 1) {
        for (let j = 1; j <= h.length; j += 1) {
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
        }
    }
    let i = r.length; let j = h.length; let substitutions = 0; let deletions = 0; let insertions = 0;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1)) { if (r[i - 1] !== h[j - 1]) substitutions += 1; i -= 1; j -= 1; }
        else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { deletions += 1; i -= 1; }
        else { insertions += 1; j -= 1; }
    }
    return { wer: r.length ? (substitutions + deletions + insertions) / r.length : 0, substitutions, deletions, insertions, words: r.length };
}

/**
 * Share of correctly heard words given to the right person, after pairing
 * each provider label ("A", "speaker_1") with the person it most often is.
 */
export function speakerAccuracy(
    reference: Array<{ speaker: string; text: string }>,
    hypothesis: Array<{ speaker: string | null; text: string }>,
): number | null {
    if (hypothesis.every((s) => !s.speaker)) return null;
    const r: Array<[string, string]> = reference.flatMap((turn) => words(turn.text).map((w) => [w, turn.speaker] as [string, string]));
    const h: Array<[string, string]> = hypothesis.flatMap((seg) => words(seg.text).map((w) => [w, seg.speaker || '?'] as [string, string]));
    const d: number[][] = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
    for (let j = 1; j <= h.length; j += 1) d[0][j] = j;
    for (let i = 1; i <= r.length; i += 1) for (let j = 1; j <= h.length; j += 1) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1][0] === h[j - 1][0] ? 0 : 1));
    }
    const pairs: Array<[string, string]> = [];
    let i = r.length; let j = h.length;
    while (i > 0 && j > 0) {
        const same = r[i - 1][0] === h[j - 1][0];
        if (d[i][j] === d[i - 1][j - 1] + (same ? 0 : 1)) { if (same) pairs.push([r[i - 1][1], h[j - 1][1]]); i -= 1; j -= 1; }
        else if (d[i][j] === d[i - 1][j] + 1) i -= 1; else j -= 1;
    }
    if (!pairs.length) return 0;
    const counts = new Map<string, Map<string, number>>();
    for (const [person, label] of pairs) {
        if (!counts.has(label)) counts.set(label, new Map());
        counts.get(label)!.set(person, (counts.get(label)!.get(person) || 0) + 1);
    }
    let right = 0;
    for (const [, people] of counts) right += Math.max(...people.values());
    return right / pairs.length;
}

/** Names, figures and dates from the script that the transcript kept. */
export function keyTermsKept(terms: string[], transcript: string): { kept: string[]; lost: string[] } {
    const n = ` ${norm(transcript)} `;
    const kept: string[] = []; const lost: string[] = [];
    for (const term of terms) (n.includes(` ${norm(term)} `) ? kept : lost).push(term);
    return { kept, lost };
}
