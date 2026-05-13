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

For loose surfaces (sand, snow): `depthCentimeters = 0` means packed underneath; a positive value is the depth of loose material on top.

## Presets

### `presets/classic-rally.field-config.json`
A starter field-config that reproduces the historical eight-column pace-note vocabulary (`caution`, `direction`, `severity`, `duration`, `decorator`, `link`, `linkDecorator`, `notes`, `linkNotes`). Use it as-is by inlining it under `fieldConfig` in your pace-note documents, or fork it as the starting point for a rally with custom shorthand. Chip vocabularies are example starters — prune or extend per crew.

## Sample: pace notes

```json
{
  "rally": { "name": "Rocky Mountain", "date": "2025-08-11" },
  "stage": { "name": "SS1" },
  "set":   { "version": 1, "driver": "A. Mouton", "recceDate": "2025-08-11" },
  "fieldConfig": {
    "schemaVersion": 1,
    "fields": [
      {
        "key": "caution", "label": "Caution", "kind": "chips",
        "grid": { "col": 0, "row": 0, "w": 1, "h": 1 },
        "renderOrder": 0, "ttsOrder": 0, "repeatable": true, "compact": true,
        "chips": [
          { "value": "!" },
          { "value": "!!" }
        ]
      },
      {
        "key": "direction", "label": "Direction", "kind": "chips",
        "grid": { "col": 0, "row": 1, "w": 2, "h": 3 },
        "renderOrder": 1, "ttsOrder": 1, "compact": true,
        "chips": [
          { "value": "L", "audible": "Left" },
          { "value": "R", "audible": "Right" }
        ]
      },
      {
        "key": "severity", "label": "Severity", "kind": "chips",
        "grid": { "col": 2, "row": 1, "w": 2, "h": 3 },
        "renderOrder": 2, "ttsOrder": 2, "compact": true,
        "chips": [
          { "value": "6", "angle": 12, "textFormat": ["sub"] }
        ]
      },
      {
        "key": "duration", "label": "Duration", "kind": "chips",
        "grid": { "col": 4, "row": 1, "w": 1, "h": 3 },
        "renderOrder": 3, "ttsOrder": 3, "compact": true,
        "chips": [
          { "value": "long" },
          { "value": "short" }
        ]
      },
      {
        "key": "link", "label": "Link", "kind": "chips",
        "grid": { "col": 5, "row": 1, "w": 3, "h": 3 },
        "renderOrder": 4, "ttsOrder": 4,
        "numeric": { "min": 10, "max": 900, "step": 10 },
        "chips": [
          { "value": "tightens" }
        ]
      }
    ]
  },
  "notes": [
    {
      "seq": 12,
      "indexLandmark": null,
      "fieldValues": {
        "direction": "L",
        "severity": "6",
        "duration": "long",
        "link": "tightens"
      },
      "recceAt": "2025-08-11T15:30:00Z"
    },
    {
      "seq": 13,
      "indexLandmark": "red house",
      "fieldValues": {
        "caution": ["!!"],
        "link": 100
      },
      "recceAt": "2025-08-11T15:30:00Z"
    }
  ]
}
```

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
