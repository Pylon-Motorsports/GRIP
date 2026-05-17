#!/usr/bin/env node
// Render field-config presets as monospaced grid-map blocks. Output goes
// to stdout (or $GITHUB_STEP_SUMMARY when redirected in CI).
// Run: npm run render

import { readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const sources = ['presets/classic-rally.field-config.json'];

// --- helpers ---------------------------------------------------------------

function shortKey(key) {
    return key.length > 5 ? key.slice(0, 4) : key;
}

function labelFor(here) {
    if (here.length === 1) return here[0].key;
    return here.map((f) => shortKey(f.key)).join('/');
}

function center(s, w) {
    const pad = w - [...s].length;
    if (pad <= 0) return s.slice(0, w);
    const left = Math.floor(pad / 2);
    return ' '.repeat(left) + s + ' '.repeat(pad - left);
}

function gridDims(fields) {
    const maxCol = Math.max(...fields.map((f) => f.grid.colEnd ?? f.grid.colStart));
    const maxRow = Math.max(...fields.map((f) => f.grid.row + (f.grid.h ?? 1) - 1));
    return { maxCol, maxRow };
}

function fieldsAtOrigin(fields, col, row) {
    return fields
        .filter((f) => f.grid.colStart === col && f.grid.row === row)
        .sort((a, b) => (a.horizontalRenderOrder ?? 0) - (b.horizontalRenderOrder ?? 0));
}

function computeCellWidth(fields, maxCol, maxRow) {
    let widest = 0;
    for (let r = 0; r <= maxRow; r++) {
        for (let c = 0; c <= maxCol; c++) {
            const here = fieldsAtOrigin(fields, c, r);
            if (!here.length) continue;
            widest = Math.max(widest, [...labelFor(here)].length);
        }
    }
    // 1-char padding on each side; minimum 6 keeps `col N` headers legible.
    return Math.max(widest + 2, 6);
}

// --- span computation ------------------------------------------------------

function buildRowSpans(fields, maxRow) {
    // Per row: spanInside is the set of cols that sit inside (but not at the
    // origin of) a column span. Used to suppress vertical walls inside spans.
    const spanInside = [];
    for (let r = 0; r <= maxRow; r++) {
        const inside = new Set();
        for (const f of fields) {
            if (f.grid.row !== r) continue;
            const cs = f.grid.colStart;
            const ce = f.grid.colEnd ?? cs;
            for (let x = cs + 1; x <= ce; x++) inside.add(x);
        }
        spanInside.push(inside);
    }
    return { spanInside };
}

function buildContinuesDown(fields, maxCol, maxRow) {
    // continuesDown[r][c] = true if a field at col c continues from row r
    // into row r+1, suppressing the horizontal wall in col c on that
    // separator. Only entries for r in [0, maxRow - 1] are populated.
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

// --- wall logic ------------------------------------------------------------

const WALL_CHARS = [
    ' ', '╵', '╷', '│', '╴', '┘', '┐', '┤',
    '╶', '└', '┌', '├', '─', '┴', '┬', '┼',
];

function pickChar(up, down, left, right) {
    return WALL_CHARS[(up ? 1 : 0) | (down ? 2 : 0) | (left ? 4 : 0) | (right ? 8 : 0)];
}

function isOccupied(fields, c, r) {
    if (c < 0 || r < 0) return false;
    return fields.some((f) => {
        const cs = f.grid.colStart;
        const ce = f.grid.colEnd ?? cs;
        const rs = f.grid.row;
        const re = rs + (f.grid.h ?? 1) - 1;
        return c >= cs && c <= ce && r >= rs && r <= re;
    });
}

function vWallPresent(fields, spans, r, x, maxCol) {
    // Vertical wall at column boundary x in row r. Suppressed when inside
    // a horizontal span, or when neither adjacent cell is occupied — so
    // empty cells (including off-grid space at the edges) shed their walls.
    if (r == null) return false;
    if (spans.spanInside[r].has(x)) return false;
    const leftOcc = x > 0 && isOccupied(fields, x - 1, r);
    const rightOcc = x <= maxCol && isOccupied(fields, x, r);
    return leftOcc || rightOcc;
}

function hWallPresent(fields, continuesDown, rowAbove, rowBelow, c) {
    // Horizontal wall in col c on the separator between rowAbove and
    // rowBelow. Suppressed when inside a vertical span, or when neither
    // adjacent cell is occupied (handles top/bottom edges of empty cells).
    if (rowAbove != null && rowBelow != null && continuesDown[rowAbove][c]) return false;
    const aboveOcc = rowAbove != null && isOccupied(fields, c, rowAbove);
    const belowOcc = rowBelow != null && isOccupied(fields, c, rowBelow);
    return aboveOcc || belowOcc;
}

function sepLine(fields, spans, continuesDown, rowAbove, rowBelow, maxCol, cellW) {
    let s = '';
    for (let x = 0; x <= maxCol + 1; x++) {
        const up = vWallPresent(fields, spans, rowAbove, x, maxCol);
        const down = vWallPresent(fields, spans, rowBelow, x, maxCol);
        const left = x > 0 ? hWallPresent(fields, continuesDown, rowAbove, rowBelow, x - 1) : false;
        const right = x <= maxCol ? hWallPresent(fields, continuesDown, rowAbove, rowBelow, x) : false;
        s += pickChar(up, down, left, right);
        if (x <= maxCol) {
            const present = hWallPresent(fields, continuesDown, rowAbove, rowBelow, x);
            s += (present ? '─' : ' ').repeat(cellW);
        }
    }
    return s;
}

// --- cell content rendering ------------------------------------------------

function fieldsCoveringCell(fields, c, r) {
    return fields.filter((f) => {
        const cs = f.grid.colStart;
        const ce = f.grid.colEnd ?? cs;
        const rs = f.grid.row;
        const re = rs + (f.grid.h ?? 1) - 1;
        return c >= cs && c <= ce && r >= rs && r <= re;
    });
}

function cellTerminationsAtRow(covering, r) {
    return covering
        .filter((f) => f.grid.row + (f.grid.h ?? 1) - 1 === r)
        .sort((a, b) => (a.horizontalRenderOrder ?? 0) - (b.horizontalRenderOrder ?? 0));
}

function wallChar(fields, spans, r, x, maxCol) {
    return vWallPresent(fields, spans, r, x, maxCol) ? '│' : ' ';
}

function labelLineForRow(fields, spans, r, maxCol, cellW) {
    let s = wallChar(fields, spans, r, 0, maxCol);
    let c = 0;
    while (c <= maxCol) {
        const covering = fieldsCoveringCell(fields, c, r);
        if (covering.length === 0) {
            s += ' '.repeat(cellW);
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
            const terminals = cellTerminationsAtRow(covering, r);
            s += center(terminals.length ? labelFor(terminals) : '', width);
            c = ce + 1;
        }
        s += wallChar(fields, spans, r, c, maxCol);
    }
    return s;
}

// --- gutter and header -----------------------------------------------------

function colHeaderLine(maxCol, cellW, gutterW) {
    // gutterW spaces + 1 for the box's left │, then "col N" centred in each
    // cellW slot with a single space between (matching connector width).
    let s = ' '.repeat(gutterW + 1);
    for (let c = 0; c <= maxCol; c++) {
        s += center(`col ${c}`, cellW);
        if (c < maxCol) s += ' ';
    }
    return s;
}

function gutter(text, gutterW) {
    return text.padEnd(gutterW);
}

// --- assembly --------------------------------------------------------------

function renderFieldConfigBox(fields) {
    const { maxCol, maxRow } = gridDims(fields);
    const cellW = computeCellWidth(fields, maxCol, maxRow);
    const spans = buildRowSpans(fields, maxRow);
    const continuesDown = buildContinuesDown(fields, maxCol, maxRow);
    const gutterW = `row ${maxRow}`.length;

    const lines = [];
    lines.push(colHeaderLine(maxCol, cellW, gutterW));
    lines.push(gutter('', gutterW) + sepLine(fields, spans, continuesDown, null, 0, maxCol, cellW));
    for (let r = 0; r <= maxRow; r++) {
        lines.push(gutter(`row ${r}`, gutterW) + labelLineForRow(fields, spans, r, maxCol, cellW));
        lines.push(gutter('', gutterW) + sepLine(fields, spans, continuesDown, r, r < maxRow ? r + 1 : null, maxCol, cellW));
    }
    return lines.join('\n') + '\n';
}

function renderFieldConfig(doc, sourcePath) {
    if (!doc?.fields?.length) {
        return `## \`${sourcePath}\`\n\n_no fields — skipping render_\n\n`;
    }
    let out = `## \`${sourcePath}\``;
    if (doc.schemaVersion !== undefined) out += ` &nbsp;·&nbsp; _schemaVersion ${doc.schemaVersion}_`;
    out += '\n\n';
    out += '```\n';
    out += renderFieldConfigBox(doc.fields);
    out += '```\n\n';
    return out;
}

// --- main ------------------------------------------------------------------

let out = '# Field-config layout\n\n';
out += '_Auto-generated from each preset. Each cell shows the field key occupying that origin (or `first4/first4` when fields share a cell). Column spans (`colEnd`) and row spans (`h`) render as merged cells with internal walls omitted._\n\n';
for (const rel of sources) {
    const doc = JSON.parse(readFileSync(join(ROOT, rel), 'utf-8'));
    out += renderFieldConfig(doc, rel);
}
process.stdout.write(out);
