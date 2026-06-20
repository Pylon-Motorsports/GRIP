#!/usr/bin/env python3
"""Validate the device-messaging example payloads against their schemas.

Loads every schema under schemas/device/*.schema.json, indexes them by the
message `type` they pin (the "const" of their `type` property), then validates
each example in schemas/device/examples/ against the schema matching its
`type`. Exits non-zero if anything fails to validate or is unmatched.
"""
import json
import pathlib
import sys

try:
    from jsonschema import Draft202012Validator
except ImportError:
    sys.exit("jsonschema not installed: pip install jsonschema")

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEVICE = ROOT / "schemas" / "device"


def load_schemas():
    by_type = {}
    for path in sorted(DEVICE.glob("*.schema.json")):
        schema = json.loads(path.read_text())
        msg_type = schema.get("properties", {}).get("type", {}).get("const")
        if msg_type is None:
            sys.exit(f"{path.name}: schema has no properties.type.const")
        Draft202012Validator.check_schema(schema)
        by_type[msg_type] = (path.name, Draft202012Validator(schema))
    return by_type


def main():
    schemas = load_schemas()
    examples = sorted((DEVICE / "examples").glob("*.json"))
    if not examples:
        sys.exit("no examples found to validate")

    failures = 0
    for path in examples:
        doc = json.loads(path.read_text())
        msg_type = doc.get("type")
        if msg_type not in schemas:
            print(f"FAIL {path.name}: no schema for type {msg_type!r}")
            failures += 1
            continue
        name, validator = schemas[msg_type]
        errors = sorted(validator.iter_errors(doc), key=lambda e: e.path)
        if errors:
            failures += 1
            print(f"FAIL {path.name} (vs {name}):")
            for err in errors:
                loc = "/".join(str(p) for p in err.path) or "<root>"
                print(f"    {loc}: {err.message}")
        else:
            print(f"ok   {path.name} (vs {name})")

    if failures:
        sys.exit(f"\n{failures} example(s) failed validation")
    print(f"\nAll {len(examples)} example(s) valid.")


if __name__ == "__main__":
    main()
