# GRIP
Generic Rally Information Protocol

## Schemas

- [`schemas/device/`](schemas/device/) — application-level messages between GRIP
  devices (base, in-car clients, trackside beam gates). Starts with the
  `beam_crossing` timing event; see the directory README for conventions and
  the relationship to GRIP-Event-Base#3.

Validate the example payloads with `python tools/validate_schemas.py`
(CI: `.github/workflows/validate.yml`).
