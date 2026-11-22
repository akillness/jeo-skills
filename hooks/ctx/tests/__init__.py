"""`ctx test NAME` dispatcher. Test modules are imported lazily by name.

Each test function takes the argparse Namespace (.vault, .repo, .fixture,
.compare_to), prints `OK` and returns 0 on pass, non-zero otherwise.
"""
from __future__ import annotations

import importlib
import sys
import traceback

# name -> (module, function)
REGISTRY = {
    "ingest-race": ("ctx.tests.vault_tests", "ingest_race"),
    "raw-immutable": ("ctx.tests.vault_tests", "raw_immutable"),
    "consolidation-resume": ("ctx.tests.vault_tests", "consolidation_resume"),
    "graphify-reconciled": ("ctx.tests.graphify_tests", "graphify_reconciled"),
    "zvec-reconciled": ("ctx.tests.zvec_tests", "zvec_reconciled"),
    "core-selftest": ("ctx.tests.core_tests", "core_selftest"),
    "dryrun-noop": ("ctx.tests.dryrun_tests", "dryrun_noop"),
    "zvec-orphan-gc": ("ctx.tests.zvec_tests", "zvec_orphan_gc"),
}

def available() -> list:
    return sorted(REGISTRY)


def run(name: str, args) -> int:
    entry = REGISTRY.get(name)
    if entry is None:
        sys.stderr.write("ctx test: unknown test %r (available: %s)\n" % (name, ", ".join(available())))
        return 2
    mod_name, fn_name = entry
    try:
        mod = importlib.import_module(mod_name)
    except Exception as exc:
        sys.stderr.write("ctx test %s: cannot import %s (%s: %s)\n" % (name, mod_name, type(exc).__name__, exc))
        return 2
    fn = getattr(mod, fn_name, None)
    if fn is None:
        sys.stderr.write("ctx test %s: %s.%s is missing\n" % (name, mod_name, fn_name))
        return 2
    try:
        rc = fn(args)
    except SystemExit as exc:
        rc = exc.code if isinstance(exc.code, int) else 1
    except Exception:
        traceback.print_exc()
        return 1
    return int(rc or 0)
