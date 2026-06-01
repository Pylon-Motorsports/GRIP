#!/usr/bin/env node

// Validate GRIP schemas against their presets/samples and against negative fixtures.
// Run: npm test  (or: node scripts/validate.mjs)

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const require = createRequire(import.meta.url);
const draft07 = require('ajv/lib/refs/json-schema-draft-07.json');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ajv = new Ajv({ allErrors: true });
// Our schemas declare $schema with the https variant of the draft-07 URI;
// ajv@6 ships the http variant, so register an https alias. This shim
// becomes unnecessary if we move to ajv@8 (which supports both variants
// natively); see README.md for why we're on ajv@6.
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
    event: loadSchema('event.schema.json'),
    'event-details': loadSchema('event-details.schema.json'),
    'car-status': loadSchema('car-status.schema.json'),
    'car-status-batch': loadSchema('car-status-batch.schema.json'),
    message: loadSchema('message.schema.json'),
    'message-ack': loadSchema('message-ack.schema.json'),
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
test('stage-geometry sample validates as stage-geometry', () => {
    assertValid(validators['stage-geometry'], loadJson('samples/stage-geometry.sample.json'));
});
test('event sample validates as event', () => {
    assertValid(validators.event, loadJson('samples/event.sample.json'));
});
test('event-details sample validates as event-details', () => {
    assertValid(validators['event-details'], loadJson('samples/event-details.sample.json'));
});
test('event-details rallyx sample validates as event-details', () => {
    assertValid(validators['event-details'], loadJson('samples/event-details-rallyx.sample.json'));
});
test('car-status sample validates as car-status', () => {
    assertValid(validators['car-status'], loadJson('samples/car-status.sample.json'));
});
test('car-status-batch sample validates as car-status-batch', () => {
    assertValid(validators['car-status-batch'], loadJson('samples/car-status-batch.sample.json'));
});
test('message sample (car → net) validates as message', () => {
    assertValid(validators.message, loadJson('samples/message.sample.json'));
});
test('message-broadcast sample (net → all) validates as message', () => {
    assertValid(validators.message, loadJson('samples/message-broadcast.sample.json'));
});
test('message-ack sample validates as message-ack', () => {
    assertValid(validators['message-ack'], loadJson('samples/message-ack.sample.json'));
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
console.log(
    '  (each fixture is { description, instance }; description is printed alongside the test name)',
);
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
            const { description, instance } = fixture;
            if (!instance) {
                test(`${schemaName}/${file}`, () => {
                    throw new Error(
                        'fixture is missing `instance` — wrap fixtures as { description, instance }',
                    );
                });
                continue;
            }
            const label = description
                ? `${schemaName}/${file} — ${description}`
                : `${schemaName}/${file}`;
            test(label, () => assertInvalid(validate, instance));
        }
    }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
