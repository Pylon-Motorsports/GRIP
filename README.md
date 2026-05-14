# GRIP

**Generic Rally Information Protocol** — open JSON Schema definitions for exchanging rally pace notes and stage geometry between tools.

GRIP is storage-agnostic. Documents are identified by natural keys (rally name + date, stage name, set version), with optional UUIDs available for implementations that need stable internal identifiers.

## Schemas

### `field-config.schema.json`
The per-rally definition of which pace-note fields exist. Each field carries a unique `key`, a `kind` (`chips` | `freetext` | `number`), grid placement (`col`, `row`, `w`, `h`), render/TTS order, and — for chips-kind fields — an inline vocabulary of allowed values with their audibles and rendering hints. Replaces the previous fixed-field model so rallies can ship entirely different shorthand systems.

### `pace-note.schema.json`
A pace-note document covers one note set: a single stage, at a specific version. It carries a header (`rally`, `stage`, `set`), an optional inlined `fieldConfig`, and the ordered list of calls (`notes`). Each note holds its position/meta at the top level and the actual shorthand values under `fieldValues` keyed by the field-config's field keys.

#### Producer / consumer contract
- A producer must ensure every key used in `notes[].fieldValues` is declared in the rally's `fieldConfig.fields[].key`. Validators will not catch orphan keys — that's the producer's job.
- When a pace-note document inlines its `fieldConfig`, that inlined copy is authoritative for the document. Consumers should render against it rather than against any cached or sibling configuration.
- Consumers should treat unknown field keys as informational and skip them gracefully, to preserve forward compatibility as field-configs evolve.

### `stage-geometry.schema.json`
A stage-geometry document describes a stage as an ordered list of segments. Each segment carries the length, heading change, and surface/roadside shape for the **end** of the segment. The first segment should be length zero and is used to initialize the starting shape.

For surfaces with an overlay (sand, snow, water): `depthCentimeters = 0` means packed/dry underneath; a positive value is the depth of the loose material or water on top.

## Presets

### `presets/classic-rally.field-config.json`
A starter field-config that reproduces the historical eight-column pace-note vocabulary (`caution`, `direction`, `severity`, `duration`, `decorator`, `link`, `linkDecorator`, `notes`, `linkNotes`). Use it as-is by inlining it under `fieldConfig` in your pace-note documents, or fork it as the starting point for a rally with custom shorthand. Chip vocabularies are example starters — prune or extend per crew.

## Sample: pace notes

A minimal pace-note document with an inlined `fieldConfig` and two notes lives at [`samples/pace-note.sample.json`](samples/pace-note.sample.json). For the full historical vocabulary, see the classic-rally preset above.

## Sample: stage geometry

```json
{
  "rally": { "name": "Rocky Mountain", "date": "2025-08-11" },
  "stage": { "name": "SS1" },
  "segments": [
    {
      "seq": 0,
      "centerLineLengthMeters": 0,
      "horizontalAngleDeltaDegrees": 0,
      "leftSurfaces":  [{ "surface": "gravel_compact", "widthCentimeters": 150 }],
      "rightSurfaces": [{ "surface": "gravel_compact", "widthCentimeters": 150 }]
    },
    {
      "seq": 1,
      "centerLineLengthMeters": 120,
      "horizontalAngleDeltaDegrees": -8,
      "leftSurfaces":  [{ "surface": "gravel_compact", "widthCentimeters": 150 }],
      "rightSurfaces": [{ "surface": "gravel_compact", "widthCentimeters": 150 }],
      "rightLiners":   [{ "feature": "trees", "distanceFromRoadCenterCentimeters": 400, "widthCentimeters": 500, "heightCentimeters": 1500 }]
    }
  ]
}
```
