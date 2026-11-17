#!/usr/bin/env python3
"""Offline inventory, hardware, and configuration preflight helper for MiniMind; never connects to network or executes external binaries."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import sys

BLOCKED_PARTS = {".git", ".ssh", ".aws", ".azure", ".config", ".netrc", ".npmrc", ".pypirc"}
SENSITIVE_STEMS = {"credential", "credentials", "secret", "secrets", "password", "token", "api_key", "apikey"}
MINIMIND_KEY_PACKAGES = ("torch", "transformers", "peft", "datasets", "accelerate")


class PreflightError(Exception):
    def __init__(self, message: str, exit_code: int = 2):
        super().__init__(message)
        self.message = message
        self.exit_code = exit_code


def validate_safe_path(raw_path: str, must_exist: bool = True, must_file: bool = False) -> Path:
    if not raw_path:
        raise PreflightError("empty path argument", exit_code=2)
    path = Path(raw_path)
    if not path.is_absolute():
        raise PreflightError("path must be absolute", exit_code=2)
    posix = PurePosixPath(path.as_posix())
    for part in posix.parts:
        lower = part.lower()
        if lower in BLOCKED_PARTS or lower in SENSITIVE_STEMS or lower.startswith(".env"):
            raise PreflightError(f"sensitive path component not allowed: {part}", exit_code=2)
    if must_exist and not path.exists():
        raise PreflightError(f"target path not found: {path}", exit_code=2)
    if must_file and not path.is_file():
        raise PreflightError(f"target path is not a regular file: {path}", exit_code=2)
    return path


def check_python_packages() -> dict[str, bool]:
    results = {}
    for pkg in MINIMIND_KEY_PACKAGES:
        try:
            spec = importlib.util.find_spec(pkg)
            results[pkg] = spec is not None
        except (ImportError, AttributeError, ValueError):
            results[pkg] = False
    return results


def check_hardware_accelerators() -> dict:
    info = {
        "cuda_available": False,
        "cuda_device_count": 0,
        "mps_available": False,
        "device_type": "cpu",
    }
    # Check torch without executing external binaries
    if importlib.util.find_spec("torch"):
        try:
            import torch

            if torch.cuda.is_available():
                info["cuda_available"] = True
                info["cuda_device_count"] = torch.cuda.device_count()
                info["device_type"] = "cuda"
            elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                info["mps_available"] = True
                info["device_type"] = "mps"
        except Exception:
            pass
    return info


def estimate_parameters(config: dict) -> dict:
    dim = config.get("dim", 512)
    n_layers = config.get("n_layers", 8)
    n_heads = config.get("n_heads", 8)
    n_kv_heads = config.get("n_kv_heads", n_heads)
    vocab_size = config.get("vocab_size", 6400)
    use_moe = bool(config.get("use_moe", False))
    n_routed_experts = config.get("n_routed_experts", 4) if use_moe else 1

    hidden_dim = config.get("hidden_dim")
    if hidden_dim is None:
        hidden_dim = int(2 * (4 * dim) / 3)
        multiple_of = config.get("multiple_of", 64)
        hidden_dim = multiple_of * ((hidden_dim + multiple_of - 1) // multiple_of)

    head_dim = dim // n_heads

    # 1. Embeddings: vocab_size * dim
    embed_params = vocab_size * dim

    # 2. Per layer attention:
    # Q: dim * (n_heads * head_dim) = dim * dim
    # K: dim * (n_kv_heads * head_dim)
    # V: dim * (n_kv_heads * head_dim)
    # Out: dim * dim
    q_params = dim * (n_heads * head_dim)
    k_params = dim * (n_kv_heads * head_dim)
    v_params = dim * (n_kv_heads * head_dim)
    o_params = dim * dim
    attn_params = q_params + k_params + v_params + o_params + (2 * dim)  # + norm weights

    # 3. Per layer FFN (SwiGLU: gate, up, down):
    # gate: dim * hidden_dim
    # up: dim * hidden_dim
    # down: hidden_dim * dim
    expert_ffn_params = 3 * dim * hidden_dim
    if use_moe:
        # Gating network: dim * n_routed_experts
        router_params = dim * n_routed_experts
        ffn_params = router_params + (n_routed_experts * expert_ffn_params) + (2 * dim)
    else:
        ffn_params = expert_ffn_params + (2 * dim)

    per_layer_params = attn_params + ffn_params
    total_layer_params = n_layers * per_layer_params

    # 4. Output head + final norm:
    output_params = (vocab_size * dim) + dim

    total_params = embed_params + total_layer_params + output_params

    return {
        "estimated_total_params": total_params,
        "estimated_params_millions": round(total_params / 1_000_000, 2),
        "embed_params": embed_params,
        "per_layer_params": per_layer_params,
        "layers_count": n_layers,
        "architecture_type": "MoE" if use_moe else "Dense",
    }


def parse_config_file(config_path: Path) -> dict:
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as err:
        raise PreflightError(f"invalid JSON configuration file: {err}", exit_code=1)

    required_fields = ("dim", "n_layers", "n_heads", "vocab_size")
    missing = [f for f in required_fields if f not in data]
    if missing:
        raise PreflightError(f"configuration missing required fields: {', '.join(missing)}", exit_code=1)

    param_stats = estimate_parameters(data)
    return {
        "config": data,
        "parameter_stats": param_stats,
    }


def run_preflight(config_arg: str | None = None) -> dict:
    pkg_status = check_python_packages()
    hw_info = check_hardware_accelerators()

    parsed_config = None
    if config_arg:
        safe_path = validate_safe_path(config_arg, must_exist=True, must_file=True)
        parsed_config = parse_config_file(safe_path)

    torch_available = pkg_status.get("torch", False)
    ready = torch_available or (parsed_config is not None)

    return {
        "status": "ready" if ready else "missing_dependencies",
        "python_packages": pkg_status,
        "hardware": hw_info,
        "config_analysis": parsed_config,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", help="Optional absolute path to an LMConfig JSON file to validate")
    parser.add_argument("--json", action="store_true", help="Output results in JSON format")
    args = parser.parse_args()

    try:
        data = run_preflight(args.config)
    except PreflightError as exc:
        if args.json:
            print(json.dumps({"status": "error", "message": exc.message}))
        else:
            print(f"Error: {exc.message}", file=sys.stderr)
        return exc.exit_code
    except Exception as exc:
        if args.json:
            print(json.dumps({"status": "error", "message": str(exc)}))
        else:
            print(f"Unexpected error: {exc}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(data, indent=2))
    else:
        print(f"MiniMind Preflight Status: {data['status']}")
        installed_pkgs = [p for p, found in data["python_packages"].items() if found]
        print(f"  Installed packages: {', '.join(installed_pkgs) if installed_pkgs else 'none detected'}")
        print(f"  Compute device: {data['hardware']['device_type'].upper()}")
        if data["config_analysis"]:
            stats = data["config_analysis"]["parameter_stats"]
            print(f"  Config Model: {stats['architecture_type']} ~{stats['estimated_params_millions']}M parameters")
            print(f"  Layers: {stats['layers_count']}, Per-layer params: {stats['per_layer_params']:,}")

    return 0 if data["status"] == "ready" else 1


if __name__ == "__main__":
    sys.exit(main())
