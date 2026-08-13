# GRIP

**Generic Rally Information Protocol** — open JSON Schema definitions for exchanging rally pace notes and stage geometry between tools.

GRIP is storage-agnostic. Documents are identified by natural keys (rally name + date, stage name, set version), with optional UUIDs available for implementations that need stable internal identifiers.

> **GRIP is looking for collaborators.** If you build rally software — note-taking apps, timing systems, stage-recce tools, sims — see [Collaborating](#collaborating). Apache-2.0 licensed, and the pace notes you author stay yours: see [Licensing](#licensing).

## Schemas

### `field-config.schema.json`
The per-rally definition of which pace-note fields exist. Each field carries a unique `key`, a `kind` (`chips` | `freetext` | `number`), grid placement (`colStart` / optional `colEnd` / `row` / `h`), `horizontalRenderOrder` and `ttsOrder` for sequencing, and — for chips-kind fields — an inline vocabulary of allowed values with their audibles and rendering hints. Different rallies can ship entirely different shorthand systems by shipping different field configs.

Columns are alignment **lanes**, not pixel positions: fields sharing the same `colStart` align vertically across rows; lane widths scale to content. Multi-lane spans are expressed inclusively via `colEnd`. Rows and `h` are spatial — renderers should preserve them.

App-specific data lives under namespaced `extensions` objects on the top-level config, on each field, and on each chip. Keys are app slugs (kebab-case, e.g. `grip-note`); each app owns its own subtree. Consumers should pass unknown namespaces through untouched. This is how things like GRIP-Note's `promptOrder` (top-level) or a compass-dial renderer's per-chip `angle` (chip-level) live without bloating the core protocol.

### `pace-note.schema.json`
A pace-note document covers one note set: a single stage, at a specific version. It carries a header (`rally`, `stage`, `set`), an optional inlined `fieldConfig`, and the ordered list of calls (`notes`). Each note holds its position/meta at the top level and the actual shorthand values under `fieldValues` keyed by the field-config's field keys.

#### Producer / consumer contract
- A producer must ensure every key used in `notes[].fieldValues` is declared in the rally's `fieldConfig.fields[].key`. Validators will not catch orphan keys — that's the producer's job.
- When a pace-note document inlines its `fieldConfig`, that inlined copy is authoritative for the document. Consumers should render against it rather than against any cached or sibling configuration.
- Consumers should treat unknown field keys as informational and skip them gracefully, to preserve forward compatibility as field-configs evolve.

### `stage-geometry.schema.json`
A stage-geometry document describes a stage as an ordered list of segments. Each segment carries the length, signed heading change, signed pitch change, and surface/roadside shape for the **end** of the segment. The first segment should be length zero and is used to initialize the starting shape. Heading and pitch use the same convention: a signed angle delta over the segment, with sign indicating direction (`+` heading = left, `+` pitch = climbing). A crest is a positive-then-negative pair of pitch deltas; a dip is the reverse.

For surfaces with an overlay (sand, snow, water): `depthCentimeters = 0` means packed/dry underneath; a positive value is the depth of the loose material or water on top.

## Presets

### `presets/classic-rally.field-config.json`
A starter field-config that reproduces the historical eight-column pace-note vocabulary (`caution`, `direction`, `severity`, `duration`, `decorator`, `link`, `linkDecorator`, `notes`, `linkNotes`). Use it as-is by inlining it under `fieldConfig` in your pace-note documents, or fork it as the starting point for a rally with custom shorthand. Chip vocabularies are example starters — prune or extend per crew.

Presets are dedicated to the public domain under CC0 (see [`presets/LICENSE`](presets/LICENSE)), separately from the Apache-2.0 license covering the rest of the repository. Inlining a preset into your documents therefore carries no attribution or notice obligation of any kind — see [Licensing](#licensing).

## Sample: pace notes

A minimal pace-note document with an inlined `fieldConfig` and two notes lives at [`samples/pace-note.sample.json`](samples/pace-note.sample.json). For the full historical vocabulary, see the classic-rally preset above.

## Development

Install dev dependencies and run the full local check:

```bash
npm install      # installs deps and the pre-commit git hook
npm run check    # biome lint + format check (read-only)
npm test         # schema validation suite
```

`npm run check` is what CI runs for static analysis; `npm run format` writes back any formatter fixes locally. A pre-commit hook (installed automatically on `npm install` via `simple-git-hooks` + `lint-staged`) runs `biome check --write` on every staged JS/TS file before each commit, so style nits are fixed for you.

The harness validates each preset/sample against its schema, cross-checks that `notes[].fieldValues` keys are all declared in the inlined `fieldConfig`, and asserts that every fixture under `tests/invalid/<schema>/` correctly fails validation. CI runs the same suite on every push and pull request via [`.github/workflows/validate.yml`](.github/workflows/validate.yml).

Add a new negative case by dropping a JSON file under `tests/invalid/<schema-name>/` — no script changes required.

`npm run render` produces a monospaced grid-map view of each field-config preset — one box-drawn diagram per preset, with column-span (`colEnd`) and row-span (`h`) merging visible as removed cell walls and `col N` / `row N` axis legends along the top and left edges. In CI, the rendered output is piped to `$GITHUB_STEP_SUMMARY` so reviewers can see the layout directly on the run's page without checking anything out.

## Sample: stage geometry

A minimal stage-geometry document with two segments lives at [`samples/stage-geometry.sample.json`](samples/stage-geometry.sample.json). Validated by the same harness as the pace-note sample.

## Collaborating

GRIP is an early-stage, actively developed protocol, and it is looking for collaborators. A shared format is only worth as much as the tools that speak it, so input from people shipping real rally software carries the most weight here.

Useful ways to get involved:

- **Implement it.** Read or write GRIP documents in your own tool and report what the schemas get wrong, what's missing, or what's awkward in practice.
- **Bring your field vocabulary.** `field-config.schema.json` exists so different crews and regions can ship their own shorthand systems. Real-world configs beyond the classic-rally preset are especially welcome.
- **Extend the domain.** Stage geometry, event and car status, and messaging are all still settling. If you work with timing hardware, safety/tracking systems, or recce workflows, there's room to shape those schemas before they harden.
- **Open an issue or discussion** with the use case you need covered — proposals and objections are as valuable as pull requests.

## Licensing

GRIP is permissively licensed, on purpose. A protocol is worth what its implementations are worth, so adopting it should never require a licensing conversation.

| What | License |
|---|---|
| Schemas, tooling, and documentation | [Apache-2.0](LICENSE) |
| Preset field-configs under `presets/` | [CC0 1.0](presets/LICENSE) — public domain |
| Documents you author in GRIP format | Yours. See below. |

**You can vendor the schemas.** Copying `*.schema.json` into your application to validate at runtime is expected and explicitly fine. Apache-2.0 asks that you carry the [`NOTICE`](NOTICE) file forward into derivative works and their downstream distributions (§4(d)); it does not ask you to open your source, and it does not reach your application's own code.

**Your documents are your own.** Pace notes, stage geometry, event and car status records — anything authored *in* the GRIP format — belong to whoever wrote them. They are not derivative works of these schemas, and no obligation from this repository attaches to them. Crews own their notes; that is the whole point. The presets are CC0 precisely so that inlining one into a document cannot compromise this.

**Patents.** Apache-2.0 includes an express patent grant from contributors, which matters as GRIP grows toward device and timing-hardware messaging. Contributions are made under the same license by default (§5), so no CLA is required.

Prior to v0.1.0 this repository was licensed GPL-3.0. It was relicensed to Apache-2.0 while under single authorship, with the consent of all copyright holders.
