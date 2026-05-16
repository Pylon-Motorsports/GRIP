#!/usr/bin/env node
// Render pace-note samples as grid-map markdown. Output goes to stdout
// (or $GITHUB_STEP_SUMMARY when redirected in CI).
// Run: npm run render

import { readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const samples = [
    'samples/pace-note.sample.json',
];

function htmlEscape(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function formatValue(value, field) {
    if (typeof value === 'number') return String(value);
    const esc = htmlEscape(value);
    const chip = field.chips?.find((c) => c.value === value);
    if (chip?.textFormat?.includes('sub')) return `<sub>${esc}</sub>`;
    if (chip?.textFormat?.includes('sup')) return `<sup>${esc}</sup>`;
    return esc;
}

function fieldsAtOrigin(fields, col, row) {
    return fields
        .filter((f) => f.grid.colStart === col && f.grid.row === row)
        .sort((a, b) => (a.horizontalRenderOrder ?? 0) - (b.horizontalRenderOrder ?? 0));
}

function gridDims(fields) {
    const maxCol = Math.max(...fields.map((f) => f.grid.colEnd ?? f.grid.colStart));
    const maxRow = Math.max(...fields.map((f) => f.grid.row));
    return { maxCol, maxRow };
}

function renderGridTable(maxCol, maxRow, cellFn) {
    const headers = [];
    for (let c = 0; c <= maxCol; c++) headers.push(`col ${c}`);
    let out = `| row | ${headers.join(' | ')} |\n`;
    out += `| --- | ${headers.map(() => '---').join(' | ')} |\n`;
    for (let r = 0; r <= maxRow; r++) {
        const cells = [];
        for (let c = 0; c <= maxCol; c++) {
            cells.push(cellFn(c, r) || ' ');
        }
        out += `| ${r} | ${cells.join(' | ')} |\n`;
    }
    return out;
}

function renderPaceNote(doc, sourcePath) {
    const fc = doc.fieldConfig;
    if (!fc?.fields?.length) {
        return `## \`${sourcePath}\`\n\n_no inlined fieldConfig — skipping render_\n`;
    }
    const fields = fc.fields;
    const { maxCol, maxRow } = gridDims(fields);

    let out = `## \`${sourcePath}\`\n\n`;
    out += `**rally:** ${htmlEscape(doc.rally.name)} (${doc.rally.date})`;
    out += ` &nbsp;·&nbsp; **stage:** ${htmlEscape(doc.stage.name)}`;
    out += ` &nbsp;·&nbsp; **set:** v${doc.set.version}`;
    if (doc.set.crew) out += ` &nbsp;·&nbsp; **crew:** ${htmlEscape(doc.set.crew)}`;
    out += '\n\n';

    out += '### Field-config layout\n\n';
    out += '_Each cell shows the key(s) whose `grid.colStart` / `grid.row` originate there. `→N` annotates a span to `colEnd: N`; `hN` annotates a row span of `N`. Fields stacked in a cell share that origin and are sequenced by `horizontalRenderOrder`._\n\n';
    out += renderGridTable(maxCol, maxRow, (col, row) => {
        const here = fieldsAtOrigin(fields, col, row);
        return here
            .map((f) => {
                const span = (f.grid.colEnd ?? f.grid.colStart) > f.grid.colStart
                    ? ` _→${f.grid.colEnd}_`
                    : '';
                const height = f.grid.h > 1 ? ` _h${f.grid.h}_` : '';
                return `**${f.key}**${span}${height}`;
            })
            .join('<br>');
    });

    for (const note of doc.notes) {
        out += `\n### Note #${note.seq}`;
        const meta = [];
        if (note.indexLandmark) meta.push(`at "${htmlEscape(note.indexLandmark)}"`);
        if (note.indexOdo != null) meta.push(`odo ${note.indexOdo}m`);
        if (note.createdAt) meta.push(note.createdAt);
        if (meta.length) out += ` &nbsp;·&nbsp; ${meta.join(' &nbsp;·&nbsp; ')}`;
        out += '\n\n';

        out += renderGridTable(maxCol, maxRow, (col, row) => {
            const here = fieldsAtOrigin(fields, col, row);
            const tokens = [];
            for (const f of here) {
                const v = note.fieldValues?.[f.key];
                if (v == null) continue;
                if (Array.isArray(v)) {
                    for (const item of v) tokens.push(formatValue(item, f));
                } else {
                    tokens.push(formatValue(v, f));
                }
            }
            return tokens.join(' ');
        });
    }

    return out;
}

let out = '# Pace-note samples — grid render\n\n';
out += '_Auto-generated from the JSON samples on every CI run. The first table per sample shows the field-config layout (where each field lives); each Note table shows the value(s) this note places at each grid origin._\n\n';
for (const rel of samples) {
    const doc = JSON.parse(readFileSync(join(ROOT, rel), 'utf-8'));
    out += renderPaceNote(doc, rel) + '\n';
}
process.stdout.write(out);
