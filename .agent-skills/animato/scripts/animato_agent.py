#!/usr/bin/env python3
"""API-key driven agent loop for a local Animato server (github.com/otdnnc/Animato).

Default loop (`animate --mode local`) keeps the inference budget at one call and keeps the
generated script auditable:

    upload -> POST /api/prompt -> one LLM call with your key -> static gate -> POST /api/run

`--mode server` hands the same job to Animato's own `/api/chat` (server calls the model and
executes the script immediately, so the static gate cannot run first).

Stdlib only: no extra install beyond the Animato server itself.

Environment:
  ANIMATO_SERVER        Animato base URL            (default http://localhost:8000)
  ANIMATO_API_KEY       LLM key; falls back to GEMINI_API_KEY / OPENAI_API_KEY
  ANIMATO_LLM_ENDPOINT  provider base incl. version (default Gemini generativelanguage v1beta)
  ANIMATO_MODEL         model id                    (default gemini-3-flash-preview)
  ANIMATO_PROVIDER      gemini | openai             (default gemini)
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path

DEFAULT_SERVER = os.environ.get("ANIMATO_SERVER", "http://localhost:8000")
DEFAULT_ENDPOINT = os.environ.get("ANIMATO_LLM_ENDPOINT", "https://generativelanguage.googleapis.com/v1beta")
DEFAULT_MODEL = os.environ.get("ANIMATO_MODEL", "gemini-3-flash-preview")
DEFAULT_PROVIDER = os.environ.get("ANIMATO_PROVIDER", "gemini")
KEY_VARS = ("ANIMATO_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY")
FENCE_RE = re.compile(r"```(?:python|py)?\s*\n(.*?)```", re.S)
VALIDATOR = Path(__file__).resolve().parent / "validate_bpy_script.py"


class AnimatoError(RuntimeError):
    pass


def resolve_key(explicit: str | None) -> str:
    if explicit:
        return explicit
    for var in KEY_VARS:
        value = os.environ.get(var)
        if value:
            return value
    raise AnimatoError(f"no API key: pass --api-key or set one of {', '.join(KEY_VARS)}")


def request(url: str, *, data: bytes | None = None, headers: dict | None = None, method: str | None = None,
            timeout: int = 360) -> tuple[int, bytes]:
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read()
    except urllib.error.URLError as exc:
        raise AnimatoError(f"cannot reach {url}: {exc.reason}") from exc


def get_json(url: str, timeout: int = 60) -> dict | list:
    status, body = request(url, timeout=timeout)
    if status >= 400:
        raise AnimatoError(f"GET {url} -> HTTP {status}: {body[:400].decode('utf-8', 'replace')}")
    return json.loads(body)


def post_json(url: str, payload: dict, timeout: int = 360, headers: dict | None = None) -> dict:
    merged = {"Content-Type": "application/json"}
    merged.update(headers or {})
    status, body = request(url, data=json.dumps(payload).encode(), headers=merged, method="POST", timeout=timeout)
    text = body.decode("utf-8", "replace")
    if status >= 400:
        raise AnimatoError(f"POST {url} -> HTTP {status}: {text[:600]}")
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise AnimatoError(f"POST {url} returned non-JSON: {text[:300]}") from exc


def upload(server: str, model_file: Path) -> dict:
    if not model_file.is_file():
        raise AnimatoError(f"no such model file: {model_file}")
    boundary = f"----animato{uuid.uuid4().hex}"
    ctype = mimetypes.guess_type(model_file.name)[0] or "application/octet-stream"
    head = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{model_file.name}"\r\n'
        f"Content-Type: {ctype}\r\n\r\n"
    ).encode()
    body = head + model_file.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    status, raw = request(
        f"{server}/api/upload",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    if status >= 400:
        raise AnimatoError(f"upload failed (HTTP {status}): {raw[:400].decode('utf-8', 'replace')}")
    return json.loads(raw)


def build_prompt(server: str, filename: str, message: str) -> dict:
    return post_json(f"{server}/api/prompt", {"filename": filename, "message": message})


def run_script(server: str, code: str) -> dict:
    status, raw = request(
        f"{server}/api/run",
        data=code.encode(),
        headers={"Content-Type": "text/plain"},
        method="POST",
    )
    text = raw.decode("utf-8", "replace")
    if status >= 400:
        raise AnimatoError(f"/api/run -> HTTP {status}: {text[:600]}")
    return json.loads(text)


def extract_code(text: str) -> str:
    matches = FENCE_RE.findall(text)
    if matches:
        return max(matches, key=len).strip()
    return text.strip()


def call_llm(prompt: str, *, provider: str, endpoint: str, model: str, api_key: str) -> str:
    endpoint = endpoint.rstrip("/")
    if provider == "gemini":
        url = f"{endpoint}/models/{model}:generateContent"
        payload = {"contents": [{"role": "user", "parts": [{"text": prompt}]}]}
        data = post_json(url, payload, headers={"x-goog-api-key": api_key})
        try:
            parts = data["candidates"][0]["content"]["parts"]
        except (KeyError, IndexError) as exc:
            raise AnimatoError(f"unexpected Gemini response: {json.dumps(data)[:400]}") from exc
        return "".join(part.get("text", "") for part in parts)
    if provider == "openai":
        url = f"{endpoint}/chat/completions"
        payload = {"model": model, "messages": [{"role": "user", "content": prompt}], "temperature": 0}
        data = post_json(url, payload, headers={"Authorization": f"Bearer {api_key}"})
        try:
            return data["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as exc:
            raise AnimatoError(f"unexpected OpenAI-compatible response: {json.dumps(data)[:400]}") from exc
    raise AnimatoError(f"unknown provider: {provider} (use gemini or openai)")


def gate(code: str, model_path: str | None) -> dict:
    scratch = Path(".animato-candidate.py")
    scratch.write_text(code, encoding="utf-8")
    try:
        cmd = [sys.executable, str(VALIDATOR), str(scratch), "--json"]
        if model_path:
            cmd += ["--model-path", model_path]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        try:
            return json.loads(proc.stdout)
        except json.JSONDecodeError as exc:
            raise AnimatoError(f"validator failed: {proc.stdout}{proc.stderr}") from exc
    finally:
        scratch.unlink(missing_ok=True)


def cmd_doctor(args: argparse.Namespace) -> int:
    ok = True
    try:
        files = get_json(f"{args.server}/api/files", timeout=15)
        count = len(files) if isinstance(files, list) else len(files.get("files", []))
        print(f"[ok]    Animato server reachable at {args.server} ({count} uploaded model(s))")
    except AnimatoError as exc:
        ok = False
        print(f"[error] {exc}")
        print("        start it with: uv run fastapi run main.py")
    present = [var for var in KEY_VARS if os.environ.get(var)]
    if present:
        print(f"[ok]    API key found in {', '.join(present)} (value not printed)")
    else:
        ok = False
        print(f"[error] no API key in {', '.join(KEY_VARS)}")
    print(f"[info]  provider={args.provider} model={args.model} endpoint={args.endpoint}")
    if VALIDATOR.is_file():
        print(f"[ok]    static gate present: {VALIDATOR}")
    else:
        ok = False
        print(f"[error] missing validator: {VALIDATOR}")
    return 0 if ok else 1


def cmd_files(args: argparse.Namespace) -> int:
    print(json.dumps(get_json(f"{args.server}/api/files"), indent=2))
    return 0


def cmd_upload(args: argparse.Namespace) -> int:
    print(json.dumps(upload(args.server, Path(args.file)), indent=2))
    return 0


def cmd_prompt(args: argparse.Namespace) -> int:
    data = build_prompt(args.server, args.filename, args.message)
    text = data.get("prompt", "")
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
        print(f"prompt written to {args.out} ({len(text)} chars)")
    else:
        print(text)
    return 0


def cmd_validate(args: argparse.Namespace) -> int:
    result = gate(Path(args.script).read_text(encoding="utf-8"), args.model_path)
    print(json.dumps(result, indent=2))
    return 0 if result["ok"] else 1


def cmd_run(args: argparse.Namespace) -> int:
    code = Path(args.script).read_text(encoding="utf-8")
    if not args.skip_gate:
        result = gate(code, args.model_path)
        if not result["ok"]:
            for item in result["errors"]:
                print(f"[error] {item}")
            print("refusing to execute — fix the script or re-generate")
            return 1
    data = run_script(args.server, extract_code(code))
    print(json.dumps(data, indent=2))
    return 0 if data.get("ok") else 1


def cmd_remove(args: argparse.Namespace) -> int:
    data = post_json(f"{args.server}/api/animation/remove", {"filename": args.filename, "name": args.name})
    print(json.dumps(data, indent=2))
    return 0


def cmd_animate(args: argparse.Namespace) -> int:
    api_key = resolve_key(args.api_key)
    filename = args.filename
    if args.file:
        uploaded = upload(args.server, Path(args.file))
        filename = uploaded["filename"]
        print(f"[1/5] uploaded {filename} -> {uploaded.get('url')}")
    if not filename:
        raise AnimatoError("pass --file to upload a model or --filename for one already uploaded")

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = Path(filename).stem

    if args.mode == "server":
        payload = {
            "api_key": api_key,
            "endpoint": args.endpoint,
            "model": args.model,
            "filename": filename,
            "message": args.message,
            "history": [],
        }
        data = post_json(f"{args.server}/api/chat", payload)
        code = data.get("code", "")
        if code:
            (out_dir / f"{stem}.generated.py").write_text(code, encoding="utf-8")
        report = gate(code, f"public/upload/{filename}") if code else {"ok": False, "errors": ["no code returned"], "warnings": []}
        print(json.dumps({"mode": "server", "ok": data.get("ok"), "output_url": data.get("output_url"),
                          "post_hoc_gate": report}, indent=2))
        return 0 if data.get("ok") else 1

    prompt_data = build_prompt(args.server, filename, args.message)
    prompt = prompt_data.get("prompt", "")
    if not prompt:
        raise AnimatoError(f"/api/prompt returned no prompt: {json.dumps(prompt_data)[:300]}")
    (out_dir / f"{stem}.prompt.txt").write_text(prompt, encoding="utf-8")
    print(f"[2/5] prompt built ({len(prompt)} chars)")

    answer = call_llm(prompt, provider=args.provider, endpoint=args.endpoint, model=args.model, api_key=api_key)
    code = extract_code(answer)
    script_path = out_dir / f"{stem}.generated.py"
    script_path.write_text(code, encoding="utf-8")
    print(f"[3/5] one inference done -> {script_path}")

    model_path = args.model_path or f"public/upload/{filename}"
    report = gate(code, model_path)
    for item in report["warnings"]:
        print(f"        [warn] {item}")
    if not report["ok"]:
        for item in report["errors"]:
            print(f"        [error] {item}")
        print("[4/5] static gate FAILED — nothing was executed")
        return 1
    print("[4/5] static gate passed")

    if args.dry_run:
        print("[5/5] --dry-run: skipped /api/run")
        return 0

    result = run_script(args.server, code)
    print(f"[5/5] executed: ok={result.get('ok')} output_url={result.get('output_url')}")
    if not result.get("ok"):
        print((result.get("stderr") or "")[-2000:])
        return 1
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--server", default=DEFAULT_SERVER, help=f"Animato base URL (default {DEFAULT_SERVER})")
    parser.add_argument("--provider", default=DEFAULT_PROVIDER, choices=["gemini", "openai"])
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT, help="LLM API base including version")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--api-key", help="overrides ANIMATO_API_KEY / GEMINI_API_KEY / OPENAI_API_KEY")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("doctor", help="check server, key, and gate availability").set_defaults(func=cmd_doctor)
    sub.add_parser("files", help="list uploaded models").set_defaults(func=cmd_files)

    p_upload = sub.add_parser("upload", help="upload a rigged model")
    p_upload.add_argument("file")
    p_upload.set_defaults(func=cmd_upload)

    p_prompt = sub.add_parser("prompt", help="build the bpy prompt for an uploaded model")
    p_prompt.add_argument("--filename", required=True)
    p_prompt.add_argument("--message", required=True)
    p_prompt.add_argument("--out")
    p_prompt.set_defaults(func=cmd_prompt)

    p_validate = sub.add_parser("validate", help="run the static gate on a script")
    p_validate.add_argument("script")
    p_validate.add_argument("--model-path")
    p_validate.set_defaults(func=cmd_validate)

    p_run = sub.add_parser("run", help="gate then execute a script via /api/run")
    p_run.add_argument("script")
    p_run.add_argument("--model-path")
    p_run.add_argument("--skip-gate", action="store_true", help="execute without the static gate (not recommended)")
    p_run.set_defaults(func=cmd_run)

    p_remove = sub.add_parser("remove", help="delete a named clip (deterministic, no AI)")
    p_remove.add_argument("--filename", required=True)
    p_remove.add_argument("--name", required=True)
    p_remove.set_defaults(func=cmd_remove)

    p_animate = sub.add_parser("animate", help="run the full API-key agent loop")
    p_animate.add_argument("--file", help="local model to upload first")
    p_animate.add_argument("--filename", help="model already in public/upload/")
    p_animate.add_argument("--message", required=True, help='motion request, e.g. "wave hello with the right arm"')
    p_animate.add_argument("--mode", choices=["local", "server"], default="local",
                           help="local = gate before executing (default); server = delegate to /api/chat")
    p_animate.add_argument("--model-path", help="path the script must import/export (default public/upload/<filename>)")
    p_animate.add_argument("--out-dir", default="animato-out")
    p_animate.add_argument("--dry-run", action="store_true", help="stop after the gate, never call /api/run")
    p_animate.set_defaults(func=cmd_animate)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        return args.func(args)
    except AnimatoError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
