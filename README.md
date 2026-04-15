# GRIP

**Generic Rally Information Protocol** — open JSON Schema definitions for exchanging rally pace notes and stage geometry between tools.

GRIP is storage-agnostic. Documents are identified by natural keys (rally name + date, stage name, set version), with optional UUIDs available for implementations that need stable internal identifiers.

## Schemas

### `pace-note.schema.json`
A pace-note document covers one note set: a single stage, by a single driver, at a specific version. It carries a header (`rally`, `stage`, `set`), the per-rally chip vocabulary (`chips`), and the ordered list of calls (`notes`).

Chips define the legal values each pace-note field may take. They also describe how each value should be rendered (`textFormat`), spoken (`audible`), and — for severity chips — placed on a compass dial (`angle`, in degrees).

### `stage-geometry.schema.json`
A stage-geometry document describes a stage as an ordered list of segments. Each segment carries the length, heading change, and surface/roadside shape for the **end** of the segment. The first segment should be length zero and is used to initialize the starting shape.

For loose surfaces (sand, snow): `depthCentimeters = 0` means packed underneath; a positive value is the depth of loose material on top.

## Sample: pace notes

```json
{
  "rally": { "name": "Rocky Mountain", "date": "2025-08-11" },
  "stage": { "name": "SS1" },
  "set":   { "version": 1, "driver": "A. Mouton", "recceDate": "2025-08-11" },
  "chips": [
    { "category": "direction", "value": "left",  "sortOrder": 0 },
    { "category": "direction", "value": "right", "sortOrder": 1 },
    { "category": "severity",  "value": "6", "sortOrder": 0, "angle": 12, "textFormat": ["sub"] },
    { "category": "caution_decorator", "value": "!!", "sortOrder": 0 }
  ],
  "notes": [
    {
      "seq": 12,
      "indexOdo": null,
      "indexLandmark": null,
      "indexSequence": 12,
      "direction": "left",
      "severity": "6",
      "duration": "long",
      "decorators": ["keep", "in"],
      "joiner": "tightens",
      "joinerDecorators": [],
      "notes": null,
      "joinerNotes": null,
      "recceAt": "2025-08-11T15:30:00Z",
      "updatedAt": "2025-08-11T15:30:00Z"
    },
    {
      "seq": 13,
      "indexOdo": null,
      "indexLandmark": "red house",
      "indexSequence": 13,
      "direction": null,
      "severity": null,
      "duration": null,
      "decorators": ["!!", "keep", "right", "over", "jump", "maybe"],
      "joiner": "100",
      "joinerDecorators": [],
      "notes": null,
      "joinerNotes": null,
      "recceAt": "2025-08-11T15:30:00Z",
      "updatedAt": "2025-08-11T15:30:00Z"
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
