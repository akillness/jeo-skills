#!/usr/bin/env python3
"""Local Jev backend: serves the same /v1/systemone contract as the hosted API.

Backed by the open-weight distillation `autotrust/JEV-9B` (a third-party student
of TypeSafe Jev 1.13 — NOT the original hosted model). Requires the model to be
downloaded first (jev-setup.sh does this) and `torch` + `transformers` in the
running Python environment (jev-setup.sh creates ~/.agents/jev/venv for this).

Request:  POST /v1/systemone  {"state": ..., "questions": {id: {type, instructions, options?}}}
Response: {"model": ..., "answers": {id: {"probability": p} | {"choice": [...], "probabilities": {...}}}}
Health:   GET /healthz
"""
import json
import math
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def selected_profile(args):
    profile = os.environ.get("JEV_PROFILE") or None
    i = 0
    while i < len(args):
        if args[i] == "--profile":
            i += 1
            if i >= len(args):
                sys.exit("--profile requires a profile id")
            profile = args[i]
            if not profile:
                sys.exit("--profile requires a non-empty profile id")
        elif args[i].startswith("--profile="):
            profile = args[i].split("=", 1)[1]
            if not profile:
                sys.exit("--profile requires a non-empty profile id")
        i += 1
    if profile and not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", profile):
        sys.exit("Profile id must contain lowercase letters, digits, and single hyphens only")
    return profile


def load_env_file(path):
    config = {}
    try:
        with open(path, encoding="utf-8") as env_file:
            for line in env_file:
                key, separator, value = line.partition("=")
                key = key.strip()
                if not separator or not re.fullmatch(r"JEV_[A-Z_]+", key):
                    continue
                value = value.strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                    value = value[1:-1]
                config[key] = value
    except FileNotFoundError:
        pass
    return config


PROFILE = selected_profile(sys.argv[1:])
CHECK_ONLY = "--check" in sys.argv[1:]
profile_base_config = {}
if PROFILE:
    config_dir = os.path.expanduser("~/.agents/jev/profiles")
    profile_base_config = load_env_file(os.path.join(config_dir, f"{PROFILE}.env"))
    config = profile_base_config.copy()
    mode = os.environ.get("JEV_MODE") or profile_base_config.get("JEV_MODE", "api")
    if mode == "local":
        config.update(load_env_file(os.path.join(config_dir, f"{PROFILE}.local.env")))
else:
    config = load_env_file(os.path.expanduser("~/.agents/jev/.env"))
for key, value in config.items():
    os.environ.setdefault(key, value)
if PROFILE:
    os.environ["JEV_PROFILE"] = PROFILE
    if profile_base_config.get("JEV_ENABLED", "").lower() != "true" and not CHECK_ONLY:
        sys.exit(f"Jev profile '{PROFILE}' is disabled; enable it with jev-setup.sh --profile {PROFILE} --enable")
    if os.environ.get("JEV_MODE") != "local":
        sys.exit(f"Jev profile '{PROFILE}' is not configured for local mode")

HOST = os.environ.get("JEV_LOCAL_HOST", "127.0.0.1")
PORT = int(os.environ.get("JEV_LOCAL_PORT", "8763"))
MODEL_DIR = os.environ.get("JEV_LOCAL_MODEL_DIR") or os.path.expanduser("~/.agents/jev/models/JEV-9B")
MODEL_NAME = "jev-9b-local"
CHOICE_THRESHOLD = 0.2

_model = None
_tokenizer = None


def load_model():
    global _model, _tokenizer
    if _model is not None:
        return
    if not os.path.isdir(MODEL_DIR):
        sys.exit(f"Model directory not found: {MODEL_DIR}\nRun jev-setup.sh (local mode) to download autotrust/JEV-9B first.")
    import torch  # noqa: F401
    from transformers import AutoModelForCausalLM, AutoTokenizer
    print(f"[jev-local] loading {MODEL_DIR} ...", flush=True)
    _tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR, local_files_only=True)
    _model = AutoModelForCausalLM.from_pretrained(MODEL_DIR, dtype="auto", device_map="auto", local_files_only=True)
    _model.eval()
    print(f"[jev-local] ready on http://{HOST}:{PORT}/v1/systemone", flush=True)


def _next_token_logprobs(prompt, candidates):
    """Return {candidate: logprob} for single-step continuations of a chat prompt."""
    import torch
    messages = [{"role": "user", "content": prompt}]
    text = _tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = _tokenizer(text, return_tensors="pt").to(_model.device)
    with torch.no_grad():
        logits = _model(**inputs).logits[0, -1]
    logprobs = torch.log_softmax(logits, dim=-1)
    out = {}
    for cand in candidates:
        ids = _tokenizer.encode(cand, add_special_tokens=False)
        out[cand] = logprobs[ids[0]].item() if ids else -math.inf
    return out


def answer_noul(state_text, instructions):
    prompt = (
        "You are Jev, a strict binary judge. Given the state below, answer the question "
        "with exactly one word: yes or no.\n\n"
        f"STATE:\n{state_text}\n\nQUESTION: {instructions}\nANSWER (yes/no):"
    )
    lp = _next_token_logprobs(prompt, ["yes", "no", "Yes", "No", " yes", " no"])
    yes = max(lp["yes"], lp["Yes"], lp[" yes"])
    no = max(lp["no"], lp["No"], lp[" no"])
    m = max(yes, no)
    p_yes = math.exp(yes - m) / (math.exp(yes - m) + math.exp(no - m))
    return {"probability": round(p_yes, 6)}


def answer_choice(state_text, instructions, options):
    probs = {}
    for option in options:
        prompt = (
            "You are Jev, a strict classifier. Given the state below, decide whether the "
            f"option '{option}' is relevant. Answer exactly one word: yes or no.\n\n"
            f"STATE:\n{state_text}\n\nCRITERION: {instructions}\nIs '{option}' relevant? ANSWER (yes/no):"
        )
        probs[option] = answer_noul_from_prompt(prompt)
    chosen = [o for o, p in probs.items() if p >= CHOICE_THRESHOLD]
    if not chosen and probs:
        chosen = [max(probs, key=probs.get)]
    return {"choice": chosen, "probabilities": {k: round(v, 6) for k, v in probs.items()}}


def answer_noul_from_prompt(prompt):
    lp = _next_token_logprobs(prompt, ["yes", "no", "Yes", "No", " yes", " no"])
    yes = max(lp["yes"], lp["Yes"], lp[" yes"])
    no = max(lp["no"], lp["No"], lp[" no"])
    m = max(yes, no)
    return math.exp(yes - m) / (math.exp(yes - m) + math.exp(no - m))


def handle_request(body):
    state = body.get("state")
    questions = body.get("questions") or {}
    if not isinstance(questions, dict) or not questions:
        raise ValueError("'questions' must be a non-empty object")
    state_text = json.dumps(state, ensure_ascii=False)[:8000]
    answers = {}
    for qid, q in questions.items():
        qtype = (q or {}).get("type", "noul")
        instructions = (q or {}).get("instructions", "")
        if qtype == "choice":
            answers[qid] = answer_choice(state_text, instructions, (q or {}).get("options") or [])
        else:
            answers[qid] = answer_noul(state_text, instructions)
    return {"model": MODEL_NAME, "answers": answers}


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, payload):
        data = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/healthz":
            self._send(200, {"ok": True, "model": MODEL_NAME, "modelDir": MODEL_DIR})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/v1/systemone":
            self._send(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length) or b"{}")
            self._send(200, handle_request(body))
        except Exception as exc:  # noqa: BLE001 — surface every failure as JSON
            self._send(400, {"error": str(exc)})

    def log_message(self, fmt, *args):
        print("[jev-local]", fmt % args, flush=True)


def main():
    if "--check" in sys.argv:  # structural smoke check without loading weights
        print(json.dumps({"host": HOST, "port": PORT, "modelDir": MODEL_DIR, "modelPresent": os.path.isdir(MODEL_DIR)}))
        return
    load_model()
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
