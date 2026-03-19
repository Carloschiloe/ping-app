const fs = require('fs');
const path = require('path');

const backendDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendDir, '..');
const supabaseDir = path.join(repoRoot, 'supabase');
const baseSchemaPath = path.join(supabaseDir, 'schema.sql');
const outputSchemaPath = path.join(supabaseDir, 'schema.full.sql');

function readBaseSchema() {
    if (!fs.existsSync(baseSchemaPath)) {
        throw new Error(`Base schema not found at ${baseSchemaPath}`);
    }
    return fs.readFileSync(baseSchemaPath, 'utf8').trim();
}

function readPhaseFiles() {
    const files = fs.readdirSync(backendDir);
    return files
        .filter((file) => /^phase\d+.*\.sql$/.test(file))
        .sort((a, b) => {
            const getNumber = (name) => Number(name.match(/^phase(\d+)/)?.[1] ?? 0);
            return getNumber(a) - getNumber(b);
        })
        .map((file) => {
            const content = fs.readFileSync(path.join(backendDir, file), 'utf8').trim();
            return `-- ${file}\n${content}`;
        });
}

function buildFullSchema() {
    const base = readBaseSchema();
    const phases = readPhaseFiles();
    const parts = [base];

    if (phases.length > 0) {
        parts.push('-- PHASE MIGRATIONS');
        parts.push(...phases);
    }

    return parts.filter(Boolean).join('\n\n');
}

function writeOutput(content) {
    fs.writeFileSync(outputSchemaPath, `${content}\n`);
    console.log(`✅ Generado ${outputSchemaPath}`);
}

function main() {
    const fullSchema = buildFullSchema();
    writeOutput(fullSchema);
}

main();
