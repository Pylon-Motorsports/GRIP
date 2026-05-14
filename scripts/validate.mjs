#!/usr/bin/env node
// Validate GRIP schemas against their presets/samples and against negative fixtures.
// Run: npm test  (or: node scripts/validate.mjs)

import Ajv from 'ajv';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const draft07 = require('ajv/lib/refs/json-schema-draft-07.json');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ajv = new Ajv({ allErrors: true });
// Our schemas declare $schema with the https variant of the draft-07 URI;
// ajv@6 ships the http variant, so register an https alias.
ajv.addMetaSchema(
    { ...draft07, $id: 'https://json-schema.org/draft-07/schema#' },
    'https://json-schema.org/draft-07/schema#',
);

function loadSchema(rel) {
    const schema = JSON.parse(readFileSync(join(ROOT, rel), 'utf-8'));
    ajv.addSchema(schema);
    return ajv.getSchema(schema.$id);
}

const validators = {
    'field-config': loadSchema('field-config.schema.json'),
    'pace-note': loadSchema('pace-note.schema.json'),
    'stage-geometry': loadSchema('stage-geometry.schema.json'),
};

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ok  ${name}`);
        passed++;
    } catch (e) {
        console.log(`  FAIL ${name}`);
        console.log(`       ${e.message.replace(/\n/g, '\n       ')}`);
        failed++;
    }
}

function loadJson(rel) {
    return JSON.parse(readFileSync(join(ROOT, rel), 'utf-8'));
}

function assertValid(validate, doc) {
    if (!validate(doc)) {
        throw new Error(JSON.stringify(validate.errors, null, 2));
    }
}

function assertInvalid(validate, doc) {
    if (validate(doc)) {
        throw new Error('validated successfully but should have failed');
    }
}

console.log('positive: presets and samples');
test('preset classic-rally validates as field-config', () => {
    assertValid(validators['field-config'], loadJson('presets/classic-rally.field-config.json'));
});
test('pace-note sample validates as pace-note', () => {
    assertValid(validators['pace-note'], loadJson('samples/pace-note.sample.json'));
});
test('pace-note sample.fieldConfig validates as field-config', () => {
    const doc = loadJson('samples/pace-note.sample.json');
    assertValid(validators['field-config'], doc.fieldConfig);
});

console.log('\ncross-checks: producer/consumer contract');
test('pace-note sample has no orphan fieldValues keys', () => {
    const doc = loadJson('samples/pace-note.sample.json');
    const declared = new Set(doc.fieldConfig.fields.map((f) => f.key));
    const used = new Set();
    for (const n of doc.notes) for (const k of Object.keys(n.fieldValues ?? {})) used.add(k);
    const orphans = [...used].filter((k) => !declared.has(k));
    if (orphans.length) throw new Error(`orphan keys: ${orphans.join(', ')}`);
});

console.log('\nnegative: tests/invalid/<schema>/*.json should all fail');
const invalidRoot = join(ROOT, 'tests', 'invalid');
if (existsSync(invalidRoot)) {
    for (const schemaName of readdirSync(invalidRoot)) {
        const dir = join(invalidRoot, schemaName);
        if (!statSync(dir).isDirectory()) continue;
        const validate = validators[schemaName];
        if (!validate) {
            console.log(`  skip tests/invalid/${schemaName} — no matching schema`);
            continue;
        }
        for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
            const fixture = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
            test(`${schemaName}/${file}`, () => assertInvalid(validate, fixture));
        }
    }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
