import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const outputPath = path.join(repositoryRoot, 'docs', 'generated', 'import-index.json');

const scanRoots = [
    { directory: 'backend/src', extensions: new Set(['.ts']) },
    { directory: 'mobile/src', extensions: new Set(['.ts', '.tsx']) },
];

function toRepoPath(absolutePath) {
    return path.relative(repositoryRoot, absolutePath).split(path.sep).join('/');
}

async function collectSourceFiles(root) {
    const absoluteRoot = path.join(repositoryRoot, root.directory);
    const files = [];

    async function visit(directory) {
        const entries = await readdir(directory, { withFileTypes: true });
        entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));

        for (const entry of entries) {
            if (entry.name === 'node_modules') continue;
            const absolutePath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                await visit(absolutePath);
            } else if (entry.isFile() && root.extensions.has(path.extname(entry.name))) {
                files.push(absolutePath);
            }
        }
    }

    await visit(absoluteRoot);
    return files;
}

function extractRelativeStaticSpecifiers(source) {
    const specifiers = new Set();
    const patterns = [
        /(?:^|\r?\n)\s*import\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g,
        /(?:^|\r?\n)\s*export\s+(?:type\s+)?(?:\*|\{[\s\S]*?\})\s+from\s+['"](\.{1,2}\/[^'"]+)['"]/g,
    ];

    for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
    }

    return [...specifiers].sort((left, right) => left.localeCompare(right, 'en'));
}

async function isFile(candidate) {
    try {
        return (await stat(candidate)).isFile();
    } catch {
        return false;
    }
}

async function resolveSourceImport(importerPath, specifier, indexedFiles) {
    const cleanSpecifier = specifier.split('?')[0].split('#')[0];
    const base = path.resolve(path.dirname(importerPath), cleanSpecifier);
    const extension = path.extname(base);
    const candidates = [];

    if (extension) {
        candidates.push(base);
        if (extension === '.js' || extension === '.jsx') {
            candidates.push(base.slice(0, -extension.length) + '.ts');
            candidates.push(base.slice(0, -extension.length) + '.tsx');
        }
    } else {
        candidates.push(`${base}.ts`, `${base}.tsx`);
        candidates.push(path.join(base, 'index.ts'), path.join(base, 'index.tsx'));
    }

    for (const candidate of candidates) {
        const normalized = path.normalize(candidate);
        if (indexedFiles.has(normalized) && await isFile(normalized)) return normalized;
    }
    return null;
}

const absoluteFiles = (await Promise.all(scanRoots.map(collectSourceFiles)))
    .flat()
    .sort((left, right) => toRepoPath(left).localeCompare(toRepoPath(right), 'en'));
const indexedFiles = new Set(absoluteFiles.map((file) => path.normalize(file)));
const graph = new Map();

for (const file of absoluteFiles) {
    graph.set(toRepoPath(file), { imports: [], importedBy: [] });
}

for (const importer of absoluteFiles) {
    const importerKey = toRepoPath(importer);
    const source = await readFile(importer, 'utf8');
    const resolvedImports = new Set();

    for (const specifier of extractRelativeStaticSpecifiers(source)) {
        const resolved = await resolveSourceImport(importer, specifier, indexedFiles);
        if (resolved) resolvedImports.add(toRepoPath(resolved));
    }

    graph.get(importerKey).imports = [...resolvedImports]
        .sort((left, right) => left.localeCompare(right, 'en'));
}

for (const [importer, entry] of graph.entries()) {
    for (const imported of entry.imports) graph.get(imported)?.importedBy.push(importer);
}

for (const entry of graph.values()) {
    entry.importedBy.sort((left, right) => left.localeCompare(right, 'en'));
}

const document = {
    schemaVersion: 1,
    scope: ['backend/src/**/*.ts', 'mobile/src/**/*.ts', 'mobile/src/**/*.tsx'],
    files: Object.fromEntries(graph.entries()),
};
const serialized = `${JSON.stringify(document, null, 2)}\n`;

await mkdir(path.dirname(outputPath), { recursive: true });
let current = null;
try {
    current = await readFile(outputPath, 'utf8');
} catch {
    // First generation.
}
if (current !== serialized) await writeFile(outputPath, serialized, 'utf8');

console.log(`Dependency index: ${graph.size} source files → ${toRepoPath(outputPath)}`);
