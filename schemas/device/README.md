# GRIP device-messaging schemas

Application-level messages exchanged between GRIP devices: the base station,
ESP32 clients (in-car rovers), and trackside beam gates. These complement the
raw RTCM3 correction stream (base → client) with structured reports and control.

> **Status / scope.** This directory is the first concrete step toward the
> canonical inter-device schema discussed in
> [GRIP-Event-Base#3](https://github.com/Pylon-Motorsports/GRIP-Event-Base/issues/3).
> That issue's "where does it live / what format" decision landed (for now) as:
> **JSON Schema, hosted here in GRIP**, on a feature branch until the end-to-end
> system is proven. Evaluating a compact binary (protobuf) encoding for the
> HaLow link is tracked separately.

## Messages

| Schema | Direction | Purpose |
| --- | --- | --- |
| [`beam_crossing.schema.json`](beam_crossing.schema.json) | gate → base | One beam-break timing event from a start/finish gate node. |

More messages (heartbeat/position from clients, time-sync and control from the
base) will be added here as they are specified — see GRIP-Event-Base#3.

## Conventions

- **Versioning.** Every message carries an integer `v`. Bump it on any
  incompatible change to that message's shape. Firmware pins the value it emits
  in `grip_core/grip_version.h` (GRIP-Event-Beam); keep the two in lockstep.
- **Time.** Timestamps are unix **microseconds** as integers. UTC for absolute
  times (`t_utc_us`), monotonic-since-boot for capture provenance
  (`t_mono_us`). No floats on the wire — integers keep precision and size
  predictable (cf. GRIP#7).
- **Identity.** `device` ids match `^[a-z0-9][a-z0-9-]{0,30}$` so firmware can
  embed them in JSON without escaping.

## Validating examples

Each schema is exercised by examples under `examples/`. To check them locally:

```sh
python tools/validate_schemas.py
```

CI runs the same check on every push (`.github/workflows/validate.yml`).
