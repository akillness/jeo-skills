"""Python side of fast-anything.

The fast-anything CLI copies this file to <project>/.fast/runner.py and runs it as
    python runner.py <mode> <job.json> -- <the app's python arguments>
Modes: profile, record, verify. Not meant to be run by hand.
"""

import ast
import base64
import functools
import importlib
import importlib.util
import json
import math
import os
import random
import runpy
import sys
import time

DISABLE_ENV = "FAST_ANYTHING_DISABLE"
SKIP_DIRS = {".fast", ".git", "venv", ".venv", "env", ".env", "site-packages", "dist-packages",
             "node_modules", "__pycache__", "build", "dist", ".tox", ".nox"}
IO_NAMES = {"print", "open", "input", "exec", "eval", "compile", "__import__", "breakpoint", "exit", "quit"}
IO_MODULES = {"os", "sys", "subprocess", "socket", "requests", "urllib", "http", "httpx", "aiohttp", "shutil",
              "pathlib", "logging", "sqlite3", "tempfile", "glob", "asyncio", "threading", "multiprocessing", "io"}
NONDET_MODULES = {"random", "time", "datetime", "uuid", "secrets"}
ARRAY_LIBS = {"np", "numpy", "pd", "pandas", "torch", "scipy", "numba", "polars", "pl"}


# ------------------------------------------------------------------ values

class Unsupported(Exception):
    """A value that can't be recorded as plain data."""


def enc(v):
    if v is None or isinstance(v, (bool, int, str)):
        return v
    if isinstance(v, float):
        return v if math.isfinite(v) else {"$float": repr(v)}
    if isinstance(v, list):
        return [enc(x) for x in v]
    if isinstance(v, tuple):
        return {"$tuple": [enc(x) for x in v]}
    if isinstance(v, (bytes, bytearray)):
        return {"$bytes": base64.b64encode(bytes(v)).decode("ascii")}
    if isinstance(v, dict):
        return {"$dict": [[enc(k), enc(x)] for k, x in v.items()]}
    if isinstance(v, (set, frozenset)):
        return {"$set": [enc(x) for x in v]}
    raise Unsupported(type(v).__name__)


def dec(v):
    if isinstance(v, list):
        return [dec(x) for x in v]
    if isinstance(v, dict):
        ((tag, x),) = v.items()
        if tag == "$tuple":
            return tuple(dec(i) for i in x)
        if tag == "$bytes":
            return base64.b64decode(x)
        if tag == "$dict":
            return {dec(k): dec(i) for k, i in x}
        if tag == "$set":
            return {dec(i) for i in x}
        if tag == "$float":
            return float(x)
        raise ValueError("unknown tag " + tag)
    return v


def same(a, b):
    """Equality the way a caller would see it: list == tuple, floats within 1e-9, but 3 != 3.0
    (it prints differently)."""
    if isinstance(a, bool) or isinstance(b, bool):
        return type(a) is type(b) and a == b
    if isinstance(a, float) or isinstance(b, float):
        if not (isinstance(a, float) and isinstance(b, float)):
            return False
        if math.isnan(a) or math.isnan(b):
            return math.isnan(a) and math.isnan(b)
        return math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-12)
    if isinstance(a, (list, tuple)) and isinstance(b, (list, tuple)):
        return len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(same(a[k], b[k]) for k in a)
    return a == b


def show(v, limit=160):
    text = repr(v)
    return text if len(text) <= limit else text[: limit - 1] + "…"


# ------------------------------------------------------------------ running the app

def parse_target(argv):
    args = list(argv)
    while args and args[0].startswith("-") and args[0] != "-m":
        flag = args.pop(0)
        if flag == "-c":
            sys.exit("fast-anything: 'python -c' isn't supported; point it at a script or a module")
        if flag in ("-X", "-W") and args:
            args.pop(0)
    if not args:
        sys.exit("fast-anything: give the app as 'python script.py ...' or 'python -m package ...'")
    if args[0] == "-m":
        if len(args) < 2:
            sys.exit("fast-anything: -m needs a module name")
        return "module", args[1], args[2:]
    return "script", args[0], args[1:]


def prepare_path(kind, target):
    """Make sys.path look like a normal 'python ...' run. Returns (entry file, import base)."""
    here = os.path.dirname(os.path.abspath(__file__))
    sys.path[:] = [p for p in sys.path if os.path.abspath(p or ".") != here]
    if kind == "script":
        entry = os.path.abspath(target)
        base = os.path.dirname(entry)
        sys.path.insert(0, base)
        return entry, base
    base = os.getcwd()
    sys.path.insert(0, base)
    entry = None
    try:
        spec = importlib.util.find_spec(target)
        if spec is not None and spec.submodule_search_locations:
            spec = importlib.util.find_spec(target + ".__main__")
        if spec is not None and spec.origin:
            entry = os.path.abspath(spec.origin)
    except (ImportError, ValueError):
        pass
    return entry, base


def run_target(kind, target, rest):
    sys.argv = [target] + list(rest)
    try:
        if kind == "script":
            runpy.run_path(target, run_name="__main__")
        else:
            runpy.run_module(target, run_name="__main__", alter_sys=True)
    except SystemExit as e:
        if e.code not in (None, 0):
            raise


# ------------------------------------------------------------------ static analysis

_files = {}


def parse_file(path):
    if path not in _files:
        try:
            with open(path, encoding="utf-8") as f:
                src = f.read()
            tree = ast.parse(src)
        except (OSError, SyntaxError, UnicodeDecodeError, ValueError):
            _files[path] = None
            return None
        by_line, top = {}, set()

        def walk(node, prefix, kind):
            for child in ast.iter_child_nodes(node):
                if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    qual = prefix + child.name
                    for line in [child.lineno] + [d.lineno for d in child.decorator_list]:
                        by_line[line] = (child, qual, kind)
                    if kind == "function":
                        top.add(child.name)
                    walk(child, qual + ".<locals>.", "nested")
                elif isinstance(child, ast.ClassDef):
                    walk(child, prefix + child.name + ".", "method" if kind == "function" else "nested")
                else:
                    walk(child, prefix, kind)

        walk(tree, "", "function")
        guard = next((n.lineno for n in tree.body if isinstance(n, ast.If) and is_main_guard(n.test)), None)
        _files[path] = (src, by_line, top, guard)
    return _files[path]


def is_main_guard(test):
    """if __name__ == "__main__" (either way round)."""
    if not (isinstance(test, ast.Compare) and len(test.ops) == 1 and isinstance(test.ops[0], ast.Eq)):
        return False
    sides = [test.left, test.comparators[0]]
    names = [s for s in sides if isinstance(s, ast.Name) and s.id == "__name__"]
    consts = [s for s in sides if isinstance(s, ast.Constant) and s.value == "__main__"]
    return len(names) == 1 and len(consts) == 1


def dotted(node):
    parts = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        parts.append(node.id)
        return list(reversed(parts))
    return None


def module_name(path, entry, base):
    ap = os.path.abspath(path)
    if entry and os.path.normcase(ap) == os.path.normcase(entry):
        return "__main__"
    try:
        rel = os.path.relpath(ap, base)
    except ValueError:
        return None
    if rel.startswith(os.pardir) or not rel.endswith(".py"):
        return None
    parts = rel[:-3].split(os.sep)
    if parts[-1] == "__init__":
        parts.pop()
    if not parts or not all(p.isidentifier() for p in parts):
        return None
    return ".".join(parts)


def describe(path, line, name, entry, base):
    parsed = parse_file(path)
    if parsed is None:
        return None
    src, by_line, top, guard = parsed
    hit = by_line.get(line)
    if hit is None or hit[0].name != name:
        return None
    node, qualname, kind = hit
    module = module_name(path, entry, base)

    blockers, warnings, factor = [], [], 1.0
    if module is None:
        blockers.append("can't be imported from the app's folder")
    elif module == "__main__" and guard is None:
        blockers.append("lives in the entry script, which runs on import: put that code under if __name__ == '__main__'")
    elif module == "__main__" and node.lineno > guard:
        blockers.append("defined inside the if __name__ == '__main__' block")
    owner = None
    if kind == "method" and any(isinstance(d, ast.Name) and d.id == "staticmethod" for d in node.decorator_list):
        owner = qualname.rsplit(".", 1)[0]
    elif kind == "method":
        blockers.append("method (module-level functions and @staticmethods only for now)")
    elif kind == "nested":
        blockers.append("nested function")
    if isinstance(node, ast.AsyncFunctionDef):
        blockers.append("async")

    args = node.args
    if args.vararg or args.kwarg:
        warnings.append("takes *args/**kwargs")
        factor *= 0.7

    io, nondet, arrays, helpers = set(), set(), set(), set()
    is_generator = writes_globals = False
    for sub in ast.walk(node):
        if isinstance(sub, (ast.Yield, ast.YieldFrom)):
            is_generator = True
        elif isinstance(sub, (ast.Global, ast.Nonlocal)):
            writes_globals = True
        elif isinstance(sub, ast.Call):
            target = dotted(sub.func)
            if not target:
                continue
            head = target[0]
            if len(target) == 1:
                if head in IO_NAMES:
                    io.add(head)
                elif head in top and head != node.name:
                    helpers.add(head)
            elif head in IO_MODULES:
                io.add(".".join(target))
            elif head in NONDET_MODULES:
                nondet.add(".".join(target))
            elif head in ARRAY_LIBS:
                arrays.add(head)
    if is_generator:
        blockers.append("generator (yield)")
    if writes_globals:
        blockers.append("writes global state")
    if io:
        blockers.append("does I/O: " + ", ".join(sorted(io)[:3]))
    if nondet:
        blockers.append("not deterministic: " + ", ".join(sorted(nondet)[:3]))
    if arrays:
        warnings.append("already uses " + ", ".join(sorted(arrays)) + ", less to gain")
        factor *= 0.4
    if helpers:
        warnings.append("calls " + ", ".join(sorted(helpers)[:3]) + ", they get ported together with it")

    positional = args.posonlyargs + args.args
    defaults = [None] * (len(positional) - len(args.defaults)) + list(args.defaults)
    params = [{"name": a.arg, "annotation": ast.unparse(a.annotation) if a.annotation else None,
               "default": ast.unparse(d) if d is not None else None}
              for a, d in zip(positional, defaults)]
    params += [{"name": a.arg, "annotation": ast.unparse(a.annotation) if a.annotation else None,
                "default": ast.unparse(d) if d is not None else None, "kwonly": True}
               for a, d in zip(args.kwonlyargs, args.kw_defaults)]
    returns = ast.unparse(node.returns) if node.returns else None
    if returns is None or any(p["annotation"] is None for p in params):
        warnings.append("missing type hints, types are inferred from recorded calls")
        factor *= 0.9

    lines = src.splitlines()
    first = min([node.lineno] + [d.lineno for d in node.decorator_list])
    return {
        "qualname": qualname,
        "module": module,
        "kind": kind,
        "owner": owner,
        "end_line": node.end_lineno,
        "params": params,
        "returns": returns,
        "blockers": blockers,
        "warnings": warnings,
        "portability": 0.0 if blockers else factor,
        "calls": sorted(helpers),
        "source": "\n".join(lines[first - 1: node.end_lineno]),
    }


def project_relative(root, path):
    try:
        rel = os.path.relpath(os.path.abspath(path), root)
    except ValueError:
        return None
    if rel == os.pardir or rel.startswith(os.pardir + os.sep):
        return None
    if any(part in SKIP_DIRS for part in rel.split(os.sep)[:-1]):
        return None
    return rel


# ------------------------------------------------------------------ modes

def cmd_profile(job, argv):
    import cProfile
    import pstats

    kind, target, rest = parse_target(argv)
    entry, base = prepare_path(kind, target)
    root = job["root"]
    prof = cProfile.Profile()
    start = time.perf_counter()
    prof.enable()
    try:
        run_target(kind, target, rest)
    finally:
        prof.disable()
    wall = time.perf_counter() - start

    rows = []
    for (path, line, name), (_cc, ncalls, tottime, cumtime, _callers) in pstats.Stats(prof).stats.items():
        if name.startswith("<") or not path or path.startswith("<"):
            continue
        rel = project_relative(root, path)
        if rel is not None:
            rows.append((path, rel, line, name, ncalls, tottime, cumtime))
    rows.sort(key=lambda r: r[6], reverse=True)

    functions = []
    for path, rel, line, name, ncalls, tottime, cumtime in rows[: job.get("max", 40)]:
        info = describe(path, line, name, entry, base)
        if info is None:
            continue
        info.update(file=rel.replace(os.sep, "/"), line=line, name=name,
                    ncalls=ncalls, tottime=tottime, cumtime=cumtime)
        functions.append(info)

    try:
        base_rel = os.path.relpath(base, root)
    except ValueError:
        base_rel = base
    with open(job["out"], "w", encoding="utf-8") as f:
        json.dump({"wall": wall, "base": base_rel, "functions": functions}, f)


def cmd_record(job, argv):
    kind, target, rest = parse_target(argv)
    prepare_path(kind, target)
    os.environ[DISABLE_ENV] = "1"  # always record the original Python
    limit = int(job["limit"])
    rng = random.Random(0xFA57)
    kept = []
    stats = {"calls": 0, "skipped": 0, "unsupported": set()}

    def store(slot, case):
        if len(kept) < limit:
            kept.append(case)
        else:
            kept[slot % limit] = case

    def wrap(original):
        @functools.wraps(original)
        def recorder(*args, **kwargs):
            stats["calls"] += 1
            slot = len(kept) if len(kept) < limit else rng.randrange(stats["calls"])
            case = None
            if slot < limit:
                try:  # encode before the call, in case the function mutates its arguments
                    case = {"args": enc(list(args)), "kwargs": {k: enc(v) for k, v in kwargs.items()}}
                except Unsupported as e:
                    stats["skipped"] += 1
                    stats["unsupported"].add(str(e))
            try:
                result = original(*args, **kwargs)
            except Exception as e:
                if case is not None:
                    case["raises"] = type(e).__name__
                    store(slot, case)
                raise
            if case is not None:
                try:
                    if enc(list(args)) != case["args"] or {k: enc(v) for k, v in kwargs.items()} != case["kwargs"]:
                        stats["mutates"] = True
                except Unsupported:
                    pass
                try:
                    case["result"] = enc(result)
                    store(slot, case)
                except Unsupported as e:
                    stats["skipped"] += 1
                    stats["unsupported"].add(str(e))
            return result

        return recorder

    if job["module"] == "__main__":
        # the entry script wraps the function itself, via a block fast-anything inserted
        import builtins

        builtins.__fast_anything_wrap__ = wrap
    else:
        module = importlib.import_module(job["module"])
        owner = getattr(module, job["owner"]) if job.get("owner") else module
        wrapped = wrap(getattr(owner, job["func"]))
        setattr(owner, job["func"], staticmethod(wrapped) if job.get("owner") else wrapped)
    run_target(kind, target, rest)

    with open(job["out"], "w", encoding="utf-8") as f:
        for case in kept:
            f.write(json.dumps(case, ensure_ascii=False) + "\n")
    with open(job["meta"], "w", encoding="utf-8") as f:
        json.dump({"calls": stats["calls"], "kept": len(kept), "skipped": stats["skipped"],
                   "unsupported": sorted(stats["unsupported"]), "mutates": stats.get("mutates", False)}, f)


def cmd_verify(job, _argv):
    os.environ[DISABLE_ENV] = "1"
    sys.path.insert(0, job["base"])
    sys.path.insert(0, job["libdir"])
    fast = getattr(importlib.import_module(job["ext"]), job["func"])
    if job["module"] == "__main__":
        # import the entry script under another name: its if __name__ == "__main__" block won't run
        spec = importlib.util.spec_from_file_location("_fast_anything_entry", job["module_file"])
        entry = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = entry
        spec.loader.exec_module(entry)
        module = entry
    else:
        module = importlib.import_module(job["module"])
    original = getattr(getattr(module, job["owner"]) if job.get("owner") else module, job["func"])

    with open(job["cases"], encoding="utf-8") as f:
        cases = [json.loads(line) for line in f if line.strip()]
    recorded = len(cases)
    derived = derive(original, cases, job.get("derive_budget", 3.0), job.get("derive_limit", 200))
    cases += derived

    report = {"total": len(cases), "derived": len(derived), "passed": 0, "failed": 0, "failures": [],
              "edges": sum(1 for c in derived if c.get("derived") == "edge")}
    calls = []
    for i, case in enumerate(cases):
        args = dec(case["args"])
        kwargs = {k: dec(v) for k, v in case.get("kwargs", {}).items()}
        calls.append((args, kwargs))
        try:
            got, err = fast(*args, **kwargs), None
        except (KeyboardInterrupt, SystemExit):
            raise
        except BaseException as e:  # Rust panics arrive as PanicException (a BaseException)
            got, err = None, e
        if "raises" in case:
            ok, expected = raises_like(err, case["raises"]), "raises " + case["raises"]
        else:
            want = dec(case["result"])
            ok, expected = err is None and same(want, got), show(want)
        if ok:
            report["passed"] += 1
            continue
        report["failed"] += 1
        if len(report["failures"]) < 8:
            shown = [show(a, 80) for a in args] + [k + "=" + show(v, 80) for k, v in kwargs.items()]
            report["failures"].append({
                "case": i,
                "call": {"edge": "(edge) ", True: "(derived) "}.get(case.get("derived"), "") + job["func"] + "(" + ", ".join(shown) + ")",
                "expected": expected,
                "got": show(got) if err is None else "raised " + type(err).__name__ + ": " + show(str(err), 200),
            })

    if cases and report["failed"] == 0:
        calls = calls[:recorded]
        py = best_pass(original, calls, job.get("budget", 0.5))
        rs = best_pass(fast, calls, job.get("budget", 0.5))
        report["micro"] = {"original_ns": py / len(calls) * 1e9, "rust_ns": rs / len(calls) * 1e9,
                           "speedup": py / rs if rs > 0 else 0.0}

    with open(job["out"], "w", encoding="utf-8") as f:
        json.dump(report, f)


SLICE_LENGTHS = (0, 1, 2, 3, 5, 8, 13, 21, 34, 55)


def variants(value, rng):
    """Smaller versions of a list/str/bytes/tuple argument: empty, tiny, and random slices."""
    if not isinstance(value, (list, tuple, str, bytes)) or len(value) < 2:
        return []
    n = len(value)
    out = []
    for length in SLICE_LENGTHS:
        if length < n:
            for _ in range(1 if length < 2 else 3):
                start = rng.randrange(n - length + 1)
                out.append(value[start:start + length])
    return out


NON_ASCII = ("\u00e9", "\u65e5\u672c", "\U0001f44d\U0001f3fd", "e\u0301")
BIG = 4096  # the longest "huge" input, in items or characters
EDGE_SAMPLE, EDGE_LIMIT = 20, 100
GROW = (4, 16, 64, 256, 512)  # how much bigger, step by step, than the short version of an input


def edges(value):
    """Inputs where ports and originals tend to part ways, of the same type as the recorded value."""
    if isinstance(value, bool):
        return []
    if isinstance(value, int):
        return [x for x in (0, 1, -1) if x != value]
    if isinstance(value, float):
        return [math.nan, math.inf, -math.inf, -0.0, 0.0, 1e308, 5e-324]
    if isinstance(value, str):
        mid = len(value) // 2
        return [value[:mid] + NON_ASCII[0] + value[mid:], value + NON_ASCII[1], NON_ASCII[2] + value,
                value + NON_ASCII[3], ""]
    if isinstance(value, bytes):
        return [b"", value + b"\x00", b"\xff" + value]
    if isinstance(value, (list, tuple)) and value:
        out = [type(value)()]
        for e in edges(value[0])[:4]:
            out.append((e,) + tuple(value[1:]) if isinstance(value, tuple) else [e] + list(value[1:]))
        return out
    return []


def small(value):
    """A short version of a recorded value, so edge cases stay cheap when the real inputs are big."""
    if isinstance(value, (list, tuple)):
        return value[:8]
    if isinstance(value, (str, bytes)):
        return value[:64]
    return value


def bigger(value, factor):
    """The value repeated factor times (None past BIG items or characters)."""
    if not isinstance(value, (list, tuple, str, bytes)) or not value or len(value) * factor > BIG:
        return None
    return value * factor


def derive_edges(original, cases, budget, limit):
    """Edge cases built from a sample of recorded calls: special numbers, non-ASCII text, empty and
    much bigger inputs. The original answers them; inputs it rejects are skipped."""
    import copy

    derived, seen, start = [], set(), time.perf_counter()

    def left():
        return budget - (time.perf_counter() - start)

    def attempt(args, kwargs):
        try:
            encoded = {"args": enc(args), "kwargs": {k: enc(v) for k, v in kwargs.items()}}
            key = json.dumps(encoded, sort_keys=True)
            if key in seen:
                return None
            seen.add(key)
            t = time.perf_counter()
            result = original(*copy.deepcopy(args), **copy.deepcopy(kwargs))
            took = time.perf_counter() - t
            encoded["result"] = enc(result)
        except Exception:
            return None  # outside the function's domain: not a fair test
        encoded["derived"] = "edge"
        derived.append(encoded)
        return took

    grown = set()
    for case in [c for c in cases if "raises" not in c][:EDGE_SAMPLE]:
        args = dec(case["args"])
        kwargs = {k: dec(v) for k, v in case.get("kwargs", {}).items()}
        base = [small(a) for a in args]
        for i, arg in enumerate(args):
            for e in edges(base[i]):
                if len(derived) >= limit or left() <= 0:
                    return derived
                attempt(base[:i] + [e] + base[i + 1:], kwargs)
            if i in grown or bigger(base[i], 4) is None:
                continue
            # much bigger inputs, only while their time (assumed quadratic) fits the budget
            grown.add(i)
            try:
                t = time.perf_counter()
                original(*copy.deepcopy(base), **copy.deepcopy(kwargs))
                took = time.perf_counter() - t
            except Exception:
                continue
            for factor in GROW:
                big = bigger(base[i], factor)
                if big is None or len(derived) >= limit or took * 16 > left() / 2:
                    break
                took = attempt(base[:i] + [big] + base[i + 1:], kwargs)
                if took is None:
                    break
        kw_base = {k: small(v) for k, v in kwargs.items()}
        for k, v in kwargs.items():
            for e in edges(kw_base[k]):
                if len(derived) >= limit or left() <= 0:
                    return derived
                next_kw = dict(kwargs)
                next_kw[k] = e
                attempt(base, next_kw)
            if ("kw", k) in grown or bigger(kw_base[k], 4) is None:
                continue
            grown.add(("kw", k))
            try:
                t = time.perf_counter()
                original(*copy.deepcopy(base), **copy.deepcopy(kwargs))
                took = time.perf_counter() - t
            except Exception:
                continue
            for factor in GROW:
                big = bigger(kw_base[k], factor)
                if big is None or len(derived) >= limit or took * 16 > left() / 2:
                    break
                next_kw = dict(kwargs)
                next_kw[k] = big
                took = attempt(base, next_kw)
                if took is None:
                    break
    return derived


def derive(original, cases, budget, limit):
    """Extra test cases: edge cases, then recorded calls with smaller inputs, answered by the original."""
    import copy

    edge_cases = derive_edges(original, cases, budget / 2, EDGE_LIMIT)
    rng = random.Random(0xFA57)
    derived, seen, start = edge_cases, set(), time.perf_counter()
    limit += len(edge_cases)
    for case in cases:
        if "raises" in case:
            continue
        args = dec(case["args"])
        kwargs = {k: dec(v) for k, v in case.get("kwargs", {}).items()}
        for i, arg in enumerate(args):
            for smaller in variants(arg, rng):
                if len(derived) >= limit or time.perf_counter() - start > budget:
                    return derived
                new_args = list(args)
                new_args[i] = smaller
                try:
                    encoded = {"args": enc(new_args), "kwargs": {k: enc(v) for k, v in kwargs.items()}}
                    key = json.dumps(encoded, sort_keys=True)
                    if key in seen:
                        continue
                    seen.add(key)
                    result = original(*copy.deepcopy(new_args), **copy.deepcopy(kwargs))
                    encoded["result"] = enc(result)
                except Exception:
                    continue  # outside the function's domain: not a fair test
                encoded["derived"] = True
                derived.append(encoded)
        for k, v in kwargs.items():
            for smaller in variants(v, rng):
                if len(derived) >= limit or time.perf_counter() - start > budget:
                    return derived
                new_kw = dict(kwargs)
                new_kw[k] = smaller
                try:
                    encoded = {"args": enc(args), "kwargs": {key: enc(val) for key, val in new_kw.items()}}
                    key = json.dumps(encoded, sort_keys=True)
                    if key in seen:
                        continue
                    seen.add(key)
                    result = original(*copy.deepcopy(args), **copy.deepcopy(new_kw))
                    encoded["result"] = enc(result)
                except Exception:
                    continue  # outside the function's domain: not a fair test
                encoded["derived"] = True
                derived.append(encoded)
    return derived


def raises_like(err, name):
    """The port raised the exception the original did. A Rust panic (PanicException, a BaseException)
    never counts: the app's except clauses won't catch it."""
    return isinstance(err, Exception) and type(err).__name__ == name


def best_pass(fn, calls, budget):
    """Fastest time to replay every recorded call once, within a time budget."""
    best, spent, passes = float("inf"), 0.0, 0
    while passes < 3 or (spent < budget and passes < 2000):
        start = time.perf_counter()
        for args, kwargs in calls:
            try:
                fn(*args, **kwargs)
            except (KeyboardInterrupt, SystemExit):
                raise
            except BaseException:  # Rust panics arrive as PanicException
                pass
        took = time.perf_counter() - start
        best, spent, passes = min(best, took), spent + took, passes + 1
    return best


def main():
    mode, job_path = sys.argv[1], sys.argv[2]
    rest = sys.argv[3:]
    if rest[:1] == ["--"]:
        rest = rest[1:]
    with open(job_path, encoding="utf-8") as f:
        job = json.load(f)
    {"profile": cmd_profile, "record": cmd_record, "verify": cmd_verify}[mode](job, rest)


if __name__ == "__main__":
    main()
