#!/usr/bin/env node
// Render pace-note samples as monospaced grid-map blocks. Output goes to
// stdout (or $GITHUB_STEP_SUMMARY when redirected in CI).
// Run: npm run render

import { readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const samples = ['samples/pace-note.sample.json'];

// --- value formatting ------------------------------------------------------

const subscriptMap = {
    0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄',
    5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉',
};

function toSubscript(s) {
    return [...s].map((c) => subscriptMap[c] ?? c).join('');
}

function formatValue(value, field) {
    if (typeof value === 'number') return String(value);
    const s = String(value);
    const chip = field.chips?.find((c) => c.value === value);
    if (chip?.textFormat?.includes('sub')) return toSubscript(s);
    return s;
}

// --- grid helpers ----------------------------------------------------------

function fieldsAtOrigin(fields, col, row) {
    return fields
        .filter((f) => f.grid.colStart === col && f.grid.row === row)
        .sort((a, b) => (a.horizontalRenderOrder ?? 0) - (b.horizontalRenderOrder ?? 0));
}

function gridDims(fields) {
    const maxCol = Math.max(...fields.map((f) => f.grid.colEnd ?? f.grid.colStart));
    const maxRow = Math.max(...fields.map((f) => f.grid.row + (f.grid.h ?? 1) - 1));
    return { maxCol, maxRow };
}

function shortKey(key) {
    return key.length > 5 ? key.slice(0, 4) : key;
}

function labelFor(here) {
    if (here.length === 1) return here[0].key;
    return here.map((f) => shortKey(f.key)).join('/');
}

function valuesFor(here, note) {
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
}

// --- box rendering ---------------------------------------------------------

function center(s, w) {
    // Treats every character as one column (true for ASCII, Unicode
    // arrows/subscripts, and the chip symbols we use). If a future chip
    // value uses a multi-column glyph we may need a width-aware helper.
    const pad = w - [...s].length;
    if (pad <= 0) return s.slice(0, w);
    const left = Math.floor(pad / 2);
    return ' '.repeat(left) + s + ' '.repeat(pad - left);
}

function computeCellWidth(fields, maxCol, maxRow, note) {
    let widest = 0;
    for (let r = 0; r <= maxRow; r++) {
        for (let c = 0; c <= maxCol; c++) {
            const here = fieldsAtOrigin(fields, c, r);
            if (!here.length) continue;
            widest = Math.max(widest, [...labelFor(here)].length);
            if (note) {
                widest = Math.max(widest, [...valuesFor(here, note)].length);
            }
        }
    }
    // 1-char padding on each side; minimum 6 to keep tiny grids readable.
    return Math.max(widest + 2, 6);
}

function buildRowSpans(fields, maxRow) {
    // Per row: spanStart maps colStart→colEnd, spanInside is the set of
    // columns that sit inside (but not at the origin of) a column span.
    const spanStart = [];
    const spanInside = [];
    for (let r = 0; r <= maxRow; r++) {
        const starts = new Map();
        const inside = new Set();
        for (const f of fields) {
            if (f.grid.row !== r) continue;
            const cs = f.grid.colStart;
            const ce = f.grid.colEnd ?? cs;
            if (ce <= cs) continue;
            starts.set(cs, Math.max(starts.get(cs) ?? cs, ce));
            for (let x = cs + 1; x <= ce; x++) inside.add(x);
        }
        spanStart.push(starts);
        spanInside.push(inside);
    }
    return { spanStart, spanInside };
}

function buildContinuesDown(fields, maxCol, maxRow) {
    // continuesDown[r][c] = true if a field at col c continues from row r
    // down into row r+1, i.e. the horizontal wall in col c on the
    // separator between rows r and r+1 should be suppressed. We only need
    // entries for r in [0, maxRow - 1] (the inter-row separators).
    const continuesDown = Array.from({ length: Math.max(maxRow, 0) }, () =>
        new Array(maxCol + 1).fill(false),
    );
    for (const f of fields) {
        const h = f.grid.h ?? 1;
        if (h <= 1) continue;
        const cs = f.grid.colStart;
        const ce = f.grid.colEnd ?? cs;
        const rs = f.grid.row;
        const re = rs + h - 1;
        for (let r = rs; r < re && r < maxRow; r++) {
            for (let c = cs; c <= ce; c++) continuesDown[r][c] = true;
        }
    }
    return continuesDown;
}

const WALL_CHARS = [
    ' ', '╵', '╷', '│', '╴', '┘', '┐', '┤',
    '╶', '└', '┌', '├', '─', '┴', '┬', '┼',
];

function pickChar(up, down, left, right) {
    return WALL_CHARS[(up ? 1 : 0) | (down ? 2 : 0) | (left ? 4 : 0) | (right ? 8 : 0)];
}

function vWallAt(spans, r, x) {
    // Vertical wall presence at column boundary x in row r.
    return r != null && !spans.spanInside[r].has(x);
}

function hWallAt(continuesDown, rowAbove, rowBelow, c) {
    // Horizontal wall presence in col c on the separator between rowAbove
    // and rowBelow. On the top/bottom edge it's always present (the edge
    // itself); otherwise suppressed iff the cell at col c continues from
    // rowAbove down into rowBelow.
    if (rowAbove == null || rowBelow == null) return true;
    return !continuesDown[rowAbove][c];
}

function sepLine(spans, continuesDown, rowAbove, rowBelow, maxCol, cellW) {
    let s = '';
    for (let x = 0; x <= maxCol + 1; x++) {
        const up = x > 0 && x <= maxCol + 1 ? vWallAt(spans, rowAbove, x) : false;
        const down = x > 0 && x <= maxCol + 1 ? vWallAt(spans, rowBelow, x) : false;
        const left = x > 0 ? hWallAt(continuesDown, rowAbove, rowBelow, x - 1) : false;
        const right = x <= maxCol ? hWallAt(continuesDown, rowAbove, rowBelow, x) : false;
        // x=0 and x=maxCol+1 are the grid's vertical edges — those vertical
        // walls always exist (the left and right sides of the grid).
        const edgeUp = (x === 0 || x === maxCol + 1) && rowAbove != null;
        const edgeDown = (x === 0 || x === maxCol + 1) && rowBelow != null;
        s += pickChar(up || edgeUp, down || edgeDown, left, right);
        if (x <= maxCol) {
            const suppressed = !hWallAt(continuesDown, rowAbove, rowBelow, x);
            s += (suppressed ? ' ' : '─').repeat(cellW);
        }
    }
    return s;
}

function fieldsCoveringCell(fields, c, r) {
    return fields.filter((f) => {
        const cs = f.grid.colStart;
        const ce = f.grid.colEnd ?? cs;
        const rs = f.grid.row;
        const re = rs + (f.grid.h ?? 1) - 1;
        return c >= cs && c <= ce && r >= rs && r <= re;
    });
}

function cellOriginsAtRow(covering, r) {
    return covering
        .filter((f) => f.grid.row === r)
        .sort((a, b) => (a.horizontalRenderOrder ?? 0) - (b.horizontalRenderOrder ?? 0));
}

function cellTerminationsAtRow(covering, r) {
    return covering
        .filter((f) => f.grid.row + (f.grid.h ?? 1) - 1 === r)
        .sort((a, b) => (a.horizontalRenderOrder ?? 0) - (b.horizontalRenderOrder ?? 0));
}

function textLineForRow(fields, spans, r, maxCol, cellW, contentFn) {
    let s = '│';
    let c = 0;
    while (c <= maxCol) {
        const covering = fieldsCoveringCell(fields, c, r);
        if (covering.length === 0) {
            s += center('', cellW);
            c++;
        } else {
            const cs = covering[0].grid.colStart;
            if (c !== cs) {
                c++;
                continue;
            }
            const ce = Math.max(...covering.map((f) => f.grid.colEnd ?? f.grid.colStart));
            const span = ce - cs + 1;
            const width = span * cellW + (span - 1);
            s += center(contentFn(covering, r), width);
            c = ce + 1;
        }
        if (c <= maxCol) {
            s += spans.spanInside[r].has(c) ? ' ' : '│';
        } else {
            s += '│';
        }
    }
    return s;
}

function renderBox(fields, maxCol, maxRow, cellW, note) {
    const spans = buildRowSpans(fields, maxRow);
    const continuesDown = buildContinuesDown(fields, maxCol, maxRow);

    const valueFn = (covering, r) => {
        const origins = cellOriginsAtRow(covering, r);
        return origins.length && note ? valuesFor(origins, note) : '';
    };
    const labelFn = (covering, r) => {
        const terminals = cellTerminationsAtRow(covering, r);
        return terminals.length ? labelFor(terminals) : '';
    };

    const lines = [sepLine(spans, continuesDown, null, 0, maxCol, cellW)];
    for (let r = 0; r <= maxRow; r++) {
        lines.push(
            textLineForRow(fields, spans, r, maxCol, cellW, valueFn),
            textLineForRow(fields, spans, r, maxCol, cellW, labelFn),
            sepLine(spans, continuesDown, r, r < maxRow ? r + 1 : null, maxCol, cellW),
        );
    }
    return lines.join('\n') + '\n';
}

// --- markdown table rendering ---------------------------------------------

function htmlEscape(s) {
    return String(s)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

function formatValueHtml(value, field) {
    if (typeof value === 'number') return String(value);
    const esc = htmlEscape(value);
    const chip = field.chips?.find((c) => c.value === value);
    if (chip?.textFormat?.includes('sub')) return `<sub>${esc}</sub>`;
    if (chip?.textFormat?.includes('sup')) return `<sup>${esc}</sup>`;
    return esc;
}

function valuesForHtml(here, note) {
    const tokens = [];
    for (const f of here) {
        const v = note.fieldValues?.[f.key];
        if (v == null) continue;
        if (Array.isArray(v)) {
            for (const item of v) tokens.push(formatValueHtml(item, f));
        } else {
            tokens.push(formatValueHtml(v, f));
        }
    }
    return tokens.join(' ');
}

function renderTable(fields, maxCol, maxRow, note) {
    const headers = [];
    for (let c = 0; c <= maxCol; c++) headers.push(`col ${c}`);
    let out = `| row | ${headers.join(' | ')} |\n`;
    out += `| --- | ${headers.map(() => '---').join(' | ')} |\n`;
    for (let r = 0; r <= maxRow; r++) {
        const cells = [];
        for (let c = 0; c <= maxCol; c++) {
            const here = fieldsAtOrigin(fields, c, r);
            if (!here.length) {
                cells.push(' ');
                continue;
            }
            const lbl = here
                .map((f) => {
                    const span = (f.grid.colEnd ?? f.grid.colStart) > f.grid.colStart
                        ? ` _→${f.grid.colEnd}_`
                        : '';
                    const height = f.grid.h > 1 ? ` _h${f.grid.h}_` : '';
                    return `**${f.key}**${span}${height}`;
                })
                .join('<br>');
            if (note) {
                const vals = valuesForHtml(here, note);
                cells.push(vals ? `${vals}<br><sub>${lbl}</sub>` : `<sub>${lbl}</sub>`);
            } else {
                cells.push(lbl);
            }
        }
        out += `| ${r} | ${cells.join(' | ')} |\n`;
    }
    return out;
}

// --- per-sample composition ------------------------------------------------

function renderPaceNote(doc, sourcePath) {
    const fc = doc.fieldConfig;
    if (!fc?.fields?.length) {
        return `## \`${sourcePath}\`\n\n_no inlined fieldConfig — skipping render_\n\n`;
    }
    const fields = fc.fields;
    const { maxCol, maxRow } = gridDims(fields);

    // Use a single cell width across all renders in this sample so they
    // line up under one another at the same scale.
    let cellW = computeCellWidth(fields, maxCol, maxRow, null);
    for (const note of doc.notes) {
        cellW = Math.max(cellW, computeCellWidth(fields, maxCol, maxRow, note));
    }

    let out = `## \`${sourcePath}\`\n\n`;
    out += `**rally:** ${doc.rally.name} (${doc.rally.date})`;
    out += ` &nbsp;·&nbsp; **stage:** ${doc.stage.name}`;
    out += ` &nbsp;·&nbsp; **set:** v${doc.set.version}`;
    if (doc.set.crew) out += ` &nbsp;·&nbsp; **crew:** ${doc.set.crew}`;
    out += '\n\n';

    out += '### Field-config layout\n\n';
    out += '_Top line of each box cell is the value placed at that origin (empty when no value); bottom line is the field key (or `first4/first4` when fields share the cell). Subscript digits render values whose chip has `textFormat: ["sub"]`. The markdown table beneath each box surfaces the same data plus span (`→N`) and row-span (`hN`) annotations._\n\n';
    out += '```\n';
    out += renderBox(fields, maxCol, maxRow, cellW, null);
    out += '```\n\n';
    out += renderTable(fields, maxCol, maxRow, null);
    out += '\n';

    for (const note of doc.notes) {
        out += `### Note #${note.seq}`;
        const meta = [];
        if (note.indexLandmark) meta.push(`at "${note.indexLandmark}"`);
        if (note.indexOdo != null) meta.push(`odo ${note.indexOdo}m`);
        if (note.createdAt) meta.push(note.createdAt);
        if (meta.length) out += ` &nbsp;·&nbsp; ${meta.join(' &nbsp;·&nbsp; ')}`;
        out += '\n\n';
        out += '```\n';
        out += renderBox(fields, maxCol, maxRow, cellW, note);
        out += '```\n\n';
        out += renderTable(fields, maxCol, maxRow, note);
        out += '\n';
    }

    return out;
}

// --- main ------------------------------------------------------------------

let out = '# Pace-note samples — grid render\n\n';
out += '_Auto-generated from the JSON samples on every CI run. Each note is drawn as the field-config grid with its values placed in their fields\' alignment-lane origins._\n\n';
for (const rel of samples) {
    const doc = JSON.parse(readFileSync(join(ROOT, rel), 'utf-8'));
    out += renderPaceNote(doc, rel);
}
process.stdout.write(out);
