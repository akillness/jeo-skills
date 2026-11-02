#!/usr/bin/env python3
"""Preview account-owned model choices; only --apply writes Ouroboros config.

Uses installed Ouroboros discovery, never its bundled static model snapshots.
Codex owns its picker via app-server; 'default' delegates selection to that CLI.
No inference, credential-file reads, host registration, or package installation.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager, redirect_stdout
import copy
import io
import json
import os
from pathlib import Path
import queue
import shutil
import stat
import subprocess
import sys
import tempfile
import threading
import time

REQUEST_TIMEOUT_SECONDS = 20
DISCOVERY_TIMEOUT_SECONDS = 60
MAX_LINE_BYTES = 1048576
MAX_PENDING_MESSAGES = 128
MAX_MODEL_PAGES = 100
MAX_MODELS = 10000


class SetupError(Exception):
    """A safe-to-display setup failure, with no provider payload attached."""


def codex_inventory(cli: str) -> dict:
    """Read the installed CLI's versioned JSON-RPC surface, never start a turn."""
    process = subprocess.Popen(
        [cli, 'app-server', '-c', 'analytics.enabled=false'],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        text=False,
    )
    messages: queue.Queue = queue.Queue(maxsize=MAX_PENDING_MESSAGES)
    stopped = threading.Event()
    discovery_deadline = time.monotonic() + DISCOVERY_TIMEOUT_SECONDS

    def receive() -> None:
        while not stopped.is_set():
            line = process.stdout.readline(MAX_LINE_BYTES + 1)
            message = line if len(line) <= MAX_LINE_BYTES else SetupError('Codex discovery line exceeded safe size.')
            while not stopped.is_set():
                try:
                    messages.put(message or None, timeout=0.1)
                    break
                except queue.Full:
                    continue
            if not line or isinstance(message, SetupError):
                break

    reader = threading.Thread(target=receive, daemon=True)
    reader.start()
    request_id = 0

    def request(method: str, params: dict) -> dict:
        nonlocal request_id
        request_id += 1
        process.stdin.write((json.dumps({'id': request_id, 'method': method, 'params': params}) + '\n').encode())
        process.stdin.flush()
        # Notifications do not extend the per-request deadline.
        deadline = min(discovery_deadline, time.monotonic() + REQUEST_TIMEOUT_SECONDS)
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise SetupError('Codex discovery deadline exceeded.')
            try:
                line = messages.get(timeout=remaining)
            except queue.Empty as exc:
                raise SetupError('Codex discovery deadline exceeded.') from exc
            if isinstance(line, SetupError):
                raise line
            if line is None:
                raise SetupError('Codex app-server closed before discovery completed.')
            response = json.loads(line)
            if response.get('id') != request_id:
                continue
            if 'error' in response or not isinstance(response.get('result'), dict):
                raise SetupError('Installed Codex does not support the required read-only discovery protocol.')
            return response['result']

    try:
        request('initialize', {'clientInfo': {'name': 'ooo-model-setup', 'version': '1'}})
        process.stdin.write(b'{"method":"initialized"}\n')
        process.stdin.flush()
        account = request('account/read', {'refreshToken': False}).get('account')
        if not isinstance(account, dict):
            raise SetupError('Codex has no authenticated account; authenticate with the CLI first.')
        models: list[str] = []
        cursor = None
        seen: set[str] = set()
        for page_number in range(MAX_MODEL_PAGES):
            page = request('model/list', {'includeHidden': False, 'cursor': cursor})
            entries = page.get('data')
            if not isinstance(entries, list) or any(
                not isinstance(entry, dict) or not isinstance(entry.get('model'), str)
                for entry in entries
            ):
                raise SetupError('Codex returned an unsupported model catalog.')
            models.extend(entry['model'] for entry in entries)
            if len(models) > MAX_MODELS:
                raise SetupError('Codex discovery model limit exceeded.')
            cursor = page.get('nextCursor')
            if cursor is None:
                break
            if not isinstance(cursor, str) or cursor in seen:
                raise SetupError('Codex model catalog pagination did not complete.')
            seen.add(cursor)
        else:
            raise SetupError('Codex discovery page limit exceeded.')
        selected = request('config/read', {'includeLayers': False}).get('config', {}).get('model')
        return {
            'models': models, 'current_model': selected if isinstance(selected, str) else None,
            'source': 'codex app-server account/read + model/list + config/read',
            'account_scope': 'authenticated runtime catalog; native cache possible; entitlement not independently verified',
            'selection': 'inherit-current',
        }
    finally:
        stopped.set()
        process.terminate()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        reader.join(timeout=3)
        process.stdin.close()
        process.stdout.close()


def discover(backend: str) -> dict:
    from ouroboros.backends.model_catalog import detect_backend_cli, get_model_catalog, refresh_models

    catalog = get_model_catalog(backend)
    cli = detect_backend_cli(backend)
    if not cli:
        raise SetupError('Selected runtime CLI is unavailable; install/authenticate it separately.')
    if backend == 'codex':
        if catalog.model_selection != 'sentinel':
            raise SetupError('Installed Ouroboros does not support Codex current-model inheritance.')
        inventory = codex_inventory(cli)
    elif backend == 'copilot':
        from ouroboros.copilot.model_discovery import list_copilot_models, used_fallback
        entries = list_copilot_models(refresh=True)
        if used_fallback():
            raise SetupError('Authenticated Copilot discovery unavailable; bundled fallback refused.')
        inventory = {
            'models': [entry.id for entry in entries],
            'source': 'ouroboros.copilot.model_discovery.list_copilot_models(refresh=True)',
            'account_scope': 'current authenticated Copilot API session', 'selection': 'exact',
        }
    elif backend == 'kiro':
        discovered = refresh_models(backend)
        if not isinstance(discovered, (tuple, list)):
            raise SetupError('Kiro account discovery unavailable or malformed; static fallback refused.')
        inventory = {
            'models': list(discovered),
            'source': 'ouroboros.backends.model_catalog.refresh_models: kiro-cli chat --listmodels -f json',
            'account_scope': 'current Kiro CLI session; CLI-reported availability', 'selection': 'exact',
        }
    else:
        raise SetupError('No verified account discovery adapter for this backend; no static fallback used.')
    models = inventory['models']
    if not models or any(not isinstance(model, str) or not model.strip() for model in models):
        raise SetupError('Account discovery returned no usable model IDs; no static fallback used.')
    inventory['models'] = list(dict.fromkeys(models))
    return inventory


@contextmanager
def target_cli(backend: str, orchestrator: dict, custom_config: bool):
    """Keep upstream detect/refresh on the target config's account and CLI."""
    key = f'OUROBOROS_{backend.upper()}_CLI_PATH'
    previous = os.environ.get(key)
    candidate = (previous or '').strip() or orchestrator.get(f'{backend}_cli_path')
    if candidate is None and custom_config:
        candidate = shutil.which('kiro-cli' if backend == 'kiro' else backend)
        if not candidate:
            raise SetupError('Target runtime CLI is unavailable on PATH.')
    if candidate is not None:
        if not isinstance(candidate, str) or not candidate.strip():
            raise SetupError('Target runtime CLI path is invalid.')
        resolved = shutil.which(str(Path(candidate).expanduser()))
        if not resolved:
            raise SetupError('Target runtime CLI path is not executable; fallback refused.')
        os.environ[key] = resolved
    try:
        yield
    finally:
        if previous is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = previous


def section(data: dict, name: str) -> dict:
    value = data.setdefault(name, {})
    if not isinstance(value, dict):
        raise SetupError('Configuration sections must be mappings; original file preserved.')
    return value


def save(path: Path, original: bytes | None, updated: str) -> str | None:
    """Back up exact bytes and atomically replace only an unchanged regular file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_symlink() or (path.exists() and not path.is_file()):
        raise SetupError('Refusing a non-regular configuration target.')
    if (path.read_bytes() if path.exists() else None) != original:
        raise SetupError('Configuration changed during discovery; rerun preview.')
    mode = (stat.S_IMODE(path.stat().st_mode) & 0o600) if original is not None else 0o600
    backup = temporary = None
    fd = None
    committed = False
    try:
        if original is not None:
            fd, backup = tempfile.mkstemp(prefix=path.name + '.backup-', dir=path.parent)
            stream = os.fdopen(fd, 'wb')
            fd = None
            with stream:
                stream.write(original)
        fd, temporary = tempfile.mkstemp(prefix=path.name + '.tmp-', dir=path.parent)
        stream = os.fdopen(fd, 'w', encoding='utf-8')
        fd = None
        with stream:
            stream.write(updated)
            stream.flush()
            os.fsync(stream.fileno())
            os.fchmod(stream.fileno(), mode)
        if (path.read_bytes() if path.exists() else None) != original:
            raise SetupError('Configuration changed before commit; original preserved.')
        os.replace(temporary, path)
        committed = True
        return backup
    finally:
        if fd is not None:
            try:
                os.close(fd)
            except OSError:
                pass  # fdopen can consume/close the descriptor before failing.
        for created in (temporary, backup if not committed else None):
            if created is not None and os.path.exists(created):
                os.unlink(created)


def validate_effective_models(config, inventories: dict) -> dict:
    """Use upstream role/profile precedence against the proposed, unsaved config."""
    from ouroboros.config import model_selection
    from ouroboros.orchestrator_stage import LLM_ROLE_STAGE_MAP

    original_loader = model_selection._load_config
    model_selection._load_config = lambda: config
    profiles = None
    profile_loader = None
    effective = {}
    try:
        if config.llm_role_profiles or 'codex' in inventories:
            from ouroboros.providers import profiles
            from ouroboros.providers.base import CompletionConfig
            profile_loader = profiles.load_config
            profiles.load_config = lambda: config
        for backend, inventory in inventories.items():
            effective[backend] = {}
            for role in sorted(LLM_ROLE_STAGE_MAP):
                resolved = model_selection.resolve_role_model(role, backend=backend).model
                if profiles is not None:
                    completion_profile = profiles.resolve_completion_profile(
                        CompletionConfig(model=resolved, role=role), backend=backend
                    )
                    if getattr(completion_profile, 'backend_profile', None):
                        raise SetupError('Native backend profile account discovery is unsupported; original configuration preserved.')
                    resolved = completion_profile.config.model
                if resolved not in inventory['models'] and not (
                    resolved == 'default' and inventory['selection'] == 'inherit-current'
                ):
                    raise SetupError('An effective upstream role/profile selects an unavailable model; original choices preserved.')
                if resolved == 'default' and inventory.get('current_model') is not None and inventory['current_model'] not in inventory['models']:
                    raise SetupError('An effective role inherits an unavailable native current model; original configuration preserved.')
                effective[backend][role] = resolved
            if backend == 'codex' and profiles is not None:
                # Codex's constructor resolves this fallback from "default",
                # not from the global stage model. Handle-specific role pins
                # use the same prefix and must not escape account validation.
                runtime_roles = {'agent_runtime'} | {
                    role for role in config.llm_role_profiles if role.startswith('agent_runtime_')
                }
                for role in sorted(runtime_roles):
                    completion_profile = profiles.resolve_completion_profile(
                        CompletionConfig(model='default', role=role), backend=backend
                    )
                    if getattr(completion_profile, 'backend_profile', None):
                        raise SetupError('Native backend profile account discovery is unsupported; original configuration preserved.')
                    resolved = completion_profile.config.model
                    if resolved != 'default' and resolved not in inventory['models']:
                        raise SetupError('A configured agent_runtime fallback selects an unavailable model; original choices preserved.')
                    if resolved == 'default' and inventory.get('current_model') is not None and inventory['current_model'] not in inventory['models']:
                        raise SetupError('A configured agent_runtime fallback inherits an unavailable current model; original choices preserved.')
                    effective[backend][role] = resolved
    finally:
        model_selection._load_config = original_loader
        if profiles is not None and profile_loader is not None:
            profiles.load_config = profile_loader
    return effective


def run(args: argparse.Namespace) -> dict:
    import yaml
    from ouroboros.backends import resolve_llm_backend_name, resolve_runtime_backend_name
    from ouroboros.config.models import OuroborosConfig

    path = args.config.expanduser()
    if path.is_symlink():
        raise SetupError('Refusing a symlink configuration target.')
    original = path.read_bytes() if path.exists() else None
    data = yaml.safe_load(original) if original is not None else {}
    if not isinstance(data, dict):
        raise SetupError('Configuration must be a YAML mapping; original file preserved.')
    updated = copy.deepcopy(data)
    orch, llm, models = (section(updated, name) for name in ('orchestrator', 'llm', 'models'))
    shared_runtime = os.environ.get('OUROBOROS_RUNTIME', '').strip()
    agent_env = os.environ.get('OUROBOROS_AGENT_RUNTIME', '').strip()
    llm_env = os.environ.get('OUROBOROS_LLM_BACKEND', '').strip()
    shared_llm = None
    if shared_runtime:
        try:
            shared_llm = resolve_llm_backend_name(shared_runtime)
        except ValueError:
            pass  # Runtime-only backends do not override the LLM backend.
    runtime = args.runtime or agent_env or shared_runtime or orch.get('runtime_backend')
    if not runtime:
        raise SetupError('Select --runtime explicitly; no runtime/model is guessed for a new account.')
    runtime = resolve_runtime_backend_name(runtime)
    backend = resolve_llm_backend_name(args.llm_backend or llm_env or shared_llm or llm.get('backend') or runtime)
    for key, environment, chosen, resolver in (
        ('OUROBOROS_AGENT_RUNTIME' if agent_env else 'OUROBOROS_RUNTIME', agent_env or shared_runtime, runtime, resolve_runtime_backend_name),
        ('OUROBOROS_LLM_BACKEND' if llm_env else 'OUROBOROS_RUNTIME', llm_env or shared_llm, backend, resolve_llm_backend_name),
    ):
        if environment and resolver(environment) != chosen:
            raise SetupError(f'{key} conflicts with the proposed backend; unset it or choose the same backend.')
    stage_profile = orch.get('runtime_profile')
    native_profile = os.environ.get('OUROBOROS_RUNTIME_PROFILE', '').strip()
    if not native_profile:
        native_profile = stage_profile.get('backend_profile') if isinstance(stage_profile, dict) else stage_profile
    if native_profile:
        raise SetupError('OUROBOROS_RUNTIME_PROFILE/runtime_profile.backend_profile requires profile-scoped account discovery, which is unsupported; original configuration preserved.')
    stage_backends = []
    if isinstance(stage_profile, dict):
        if stage_profile.get('default'):
            stage_backends.append(resolve_runtime_backend_name(stage_profile['default']))
        if isinstance(stage_profile.get('stages'), dict):
            stage_backends.extend(resolve_runtime_backend_name(value) for value in stage_profile['stages'].values())
    inventories = {}
    for name in dict.fromkeys((runtime, backend, *stage_backends)):
        with target_cli(name, orch, path != Path.home() / '.ouroboros' / 'config.yaml'):
            inventories[name] = discover(name)
    model = args.model if args.model is not None else models.get('default')
    if model in (None, 'auto'):
        model = 'default' if all(item['selection'] == 'inherit-current' for item in inventories.values()) else None
    environment_model = os.environ.get('OUROBOROS_MODEL', '').strip()
    if environment_model and environment_model != model:
        raise SetupError('OUROBOROS_MODEL conflicts with the selected model; unset it or choose the same discovered model.')
    if model is not None:
        for name, item in inventories.items():
            if model == 'default' and item.get('current_model') is not None and item['current_model'] not in item['models']:
                raise SetupError('Codex current selection is absent from its reported catalog; choose an explicit discovered model or preserve the original configuration.')
            if not isinstance(model, str) or (
                model not in item['models'] and not (model == 'default' and item['selection'] == 'inherit-current')
            ):
                raise SetupError(f'Selected model is not an exact member of the {name} inventory; original choices preserved.')
    orch['runtime_backend'] = runtime
    llm['backend'] = backend
    if model is not None:
        models['default'] = model
    # Validate with the installed upstream schema without dumping away unknown fields.
    try:
        validated_config = OuroborosConfig.model_validate(updated)
    except Exception as exc:
        raise SetupError('Installed upstream schema rejected configuration; original file preserved.') from exc
    effective_roles = validate_effective_models(validated_config, inventories) if model is not None else {}
    changes = [f'{name}.{key}' for name, key in (
        ('orchestrator', 'runtime_backend'), ('llm', 'backend'), ('models', 'default')
    ) if data.get(name, {}).get(key) != updated[name].get(key)]
    report = {'status': 'preview', 'runtime': runtime, 'llm_backend': backend,
              'inventories': inventories, 'model': model, 'selection_required': model is None,
              'changes': changes, 'backup': None, 'effective_roles': effective_roles}
    if args.apply:
        if model is None:
            raise SetupError('Choose --model from the discovered inventory before applying.')
        report['status'] = 'unchanged'
        if changes:
            report['backup'] = save(path, original, yaml.safe_dump(updated, sort_keys=False))
            report['status'] = 'applied'
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime')
    parser.add_argument('--llm-backend')
    parser.add_argument('--model')
    parser.add_argument('--config', type=Path, default=Path.home() / '.ouroboros' / 'config.yaml')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    try:
        # Upstream discovery may log to stdout. Never leak logs/account payloads into JSON.
        with redirect_stdout(io.StringIO()):
            report = run(args)
    except SetupError as exc:
        report = {'status': 'error', 'error': str(exc)}
    except (ImportError, AttributeError):
        report = {'status': 'error', 'error': 'Required installed Ouroboros discovery/config APIs unavailable; use its Python interpreter or upgrade separately.'}
    except Exception:
        # Provider, YAML and validation errors can contain credentials or config values.
        report = {'status': 'error', 'error': 'Discovery or config validation failed; no configuration applied. Check installed CLI authentication, protocol support and YAML structure.'}
    print(json.dumps(report, sort_keys=True))
    return 1 if report['status'] == 'error' else 0


if __name__ == '__main__':
    sys.exit(main())
