# GRIP
Generic Rally Information Protocol

For the geometry schema, each entry includes the shape for the end of the segment. The first segment should always be length zero to initialize the shape.
For surfaces like sand and snow, 0 depth indicated packed and the depth is loose on top.

Sample pace-note.schema.json records:
```
{
  "PK": "RALLY#RockyMountain#2025-08-11#SS1#v1",
  "SK": "SET#23871#SEQ#0012",
  "SetID": 23871,
  "IndexSequence": 12,
  "IndexOdo": null,
  "IndexLandmark": null,
  "Direction": "Left",
  "Severity": 6,
  "Duration": "long",
  "Decorators": ["keep", "in"],
  "Joiner": "tightens",
  "Notes": null,
  "RecceAt": "2025-08-11T15:30:00Z",
  "UpdatedAt": "2025-08-11T15:30:00Z"
}
```

```
{
  "PK": "RALLY#RockyMountain#2025-08-11#SS1#v1",
  "SK": "SET#23871#SEQ#0013",
  "SetID": 23871,
  "IndexSequence": 13,
  "IndexOdo": null,
  "IndexLandmark": "red house",
  "Direction": null,
  "Severity": null,
  "Duration": null,
  "Decorators": ["caution", "keep", "right", "over", "jump", "maybe"],
  "Joiner": "100",
  "Notes": null,
  "RecceAt": "2025-08-11T15:30:00Z",
  "UpdatedAt": "2025-08-11T15:30:00Z"
}
```
