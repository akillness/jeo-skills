#!/usr/bin/env python3
"""Track indexed workspace changes across response lifecycle events."""
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
import shutil
import secrets
from pathlib import Path
import http.client
import subprocess
import sys
import socket
import stat
import tempfile
import time
from contextlib import contextmanager


def snapshot_command(root, package_dir, node):
    if sys.platform != 'darwin' or not Path('/usr/bin/sandbox-exec').is_file():
        raise RuntimeError('snapshot filesystem sandbox unavailable')
    paths = [Path(root).resolve(strict=True), Path(package_dir).resolve(strict=True),
             Path('/usr'), Path('/System'), Path('/Library'), Path('/dev'), Path('/private/etc'),
             Path('/private/var/db/timezone')]
    script = Path(__file__).with_name('host-snapshot.mjs').resolve(strict=True)
    node_path = Path(node).resolve(strict=True)
    rules = ''.join('(allow file-read* (subpath ' + json.dumps(str(path)) + '))' for path in paths)
    rules += ''.join('(allow file-read* (literal ' + json.dumps(str(path)) + '))' for path in (script, node_path))
    profile = '(version 1)(deny default)(allow process*)(allow sysctl-read)(allow mach-lookup)(allow signal)(allow file-read-metadata)(allow file-read-data (literal "/"))(allow file-write-data (literal "/dev/null"))(allow ipc-posix-shm)(allow iokit-open)' + rules
    return ['/usr/bin/sandbox-exec', '-p', profile, str(node_path), str(script), str(Path(root).resolve()), str(Path(package_dir).resolve())]


def snapshot(root):
    package_dir = os.environ.get('ZVEC_GREP_PACKAGE_DIR')
    if not package_dir:
        binary = shutil.which('zg')
        if not binary:
            raise OSError('zg executable not found')
        package_dir = str(Path(binary).resolve().parents[2])
    node = shutil.which('node')
    if not node:
        raise OSError('node executable not found')
    result = subprocess.run(snapshot_command(root, package_dir, node),
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, timeout=5)
    result = json.loads(result.stdout)
    if not isinstance(result, dict):
        raise ValueError('invalid snapshot')
    return result


def warnings_directory():
    base = Path(os.environ.get('XDG_STATE_HOME', Path.home() / '.local' / 'state'))
    if not base.is_absolute():
        base = Path.home() / '.local' / 'state'
    directory = Path(os.environ.get('ZVEC_GREP_MANAGED_WARNINGS_DIR', base / 'zvec-grep' / 'warnings'))
    if not directory.is_absolute():
        raise ValueError('warning directory must be absolute')
    return Path(os.path.abspath(directory))


def warn(root, code, exc, directory=None):
    message = 'zvec-grep hook unavailable: ' + type(exc).__name__
    print(message, file=sys.stderr)
    try:
        root = str(Path(root).resolve())
        directory = warnings_directory() if directory is None else Path(directory)
        if not directory.is_absolute():
            raise ValueError('warning directory must be absolute')
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        directory_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            info = os.fstat(directory_fd)
            if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
                raise PermissionError('unsafe warning directory')
            name = hashlib.sha256(root.encode()).hexdigest() + '.json'
            temporary = '.warning-' + secrets.token_hex(16)
            fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory_fd)
            try:
                with os.fdopen(fd, 'w', encoding='utf-8') as stream:
                    json.dump({'root': root, 'code': code, 'message': message,
                               'at': datetime.now(timezone.utc).isoformat()}, stream)
                os.replace(temporary, name, src_dir_fd=directory_fd, dst_dir_fd=directory_fd)
            finally:
                try:
                    os.unlink(temporary, dir_fd=directory_fd)
                except FileNotFoundError:
                    pass
        finally:
            os.close(directory_fd)
    except (OSError, ValueError):
        print('zvec-grep warning could not be persisted', file=sys.stderr)


def state_path(root, session, state_dir):
    key = hashlib.sha256(session.encode()).hexdigest()
    return Path(state_dir) / (key + '.json')


def prepare_state(state_dir):
    directory = Path(state_dir)
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    stat = directory.lstat()
    if directory.is_symlink() or stat.st_uid != os.getuid() or stat.st_mode & 0o077:
        raise PermissionError('unsafe hook state directory')
    return directory


@contextmanager
def session_lock(root, session, state_dir, timeout=3):
    directory = prepare_state(state_dir)
    path = state_path(root, session, directory).with_suffix('.lock')
    fd = os.open(path, os.O_CREAT | os.O_RDWR | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    with os.fdopen(fd, 'r+') as stream:
        deadline = time.monotonic() + timeout
        while True:
            try:
                fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise TimeoutError('session lock timed out')
                time.sleep(0.05)
        yield


def workspace(cwd):
    path = Path(cwd).resolve()
    for candidate in (path, *path.parents):
        if (candidate / '.zvec-grep' / 'manifest.json').is_file():
            return candidate
    return None


def indexed(root):
    index = root / '.zvec-grep'
    info = root.stat()
    if info.st_uid != os.getuid() or index.is_symlink():
        raise PermissionError('unsafe workspace index')
    manifest = root / '.zvec-grep' / 'manifest.json'
    try:
        data = json.loads(manifest.read_text(encoding='utf-8'))
    except FileNotFoundError:
        return False
    return (isinstance(data, dict) and data.get('indexPolicy') == 'enabled'
            and data.get('embedding') is not None and (root / '.zvec-grep' / 'files.zvec').is_dir())


def save_states(target, states):
    fd, name = tempfile.mkstemp(prefix='.baseline-', dir=target.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump({'roots': states}, stream)
        os.replace(name, target)
    finally:
        Path(name).unlink(missing_ok=True)


def load_states(target):
    data = json.loads(target.read_text(encoding='utf-8'))
    if isinstance(data, dict) and isinstance(data.get('root'), str) and isinstance(data.get('snapshot'), dict):
        data = {'roots': {data['root']: data['snapshot']}}
    if not isinstance(data, dict) or not isinstance(data.get('roots'), dict):
        raise ValueError('invalid response baseline')
    states = data['roots']
    if any(not isinstance(root, str) or not Path(root).is_absolute() or (value is not None and not isinstance(value, dict)) for root, value in states.items()):
        raise ValueError('invalid response baseline')
    return states


def begin(root, session, state_dir):
    root = workspace(root)
    if root is None or not indexed(root):
        return False
    trust = managed_post(root, 'check-root', {'root': str(root)})
    if trust.get('status') != 'trusted' or trust.get('registered') is not True or trust.get('root') != str(root):
        raise PermissionError('workspace is not registered with managed daemon')
    prepare_state(state_dir)
    target = state_path(root, session, state_dir)
    try:
        if str(root) in load_states(target):
            return True
    except FileNotFoundError:
        pass
    with session_lock(root, session, state_dir):
        target = state_path(root, session, state_dir)
        states = load_states(target) if target.exists() else {}
        key = str(root)
        if key not in states:
            try:
                states[key] = snapshot(root)
            except (OSError, ValueError, subprocess.SubprocessError):
                states[key] = None
                save_states(target, states)
                raise
            save_states(target, states)
    return True


def finish(root, session, state_dir, request_refresh, require_snapshot=False):
    with session_lock(root, session, state_dir, timeout=20):
        target = state_path(root, session, state_dir)
        try:
            states = load_states(target)
            stored_root = Path(root).resolve()
            baseline = states[str(stored_root)]
        except (FileNotFoundError, KeyError):
            if require_snapshot:
                raise
            return False
        if not indexed(stored_root):
            raise ValueError('workspace index unavailable')
        try:
            current = snapshot(stored_root)
        except (OSError, ValueError, subprocess.SubprocessError):
            current = None
        uncertain = lambda value: value is None or any(isinstance(item, list) and item and item[0] == 'err' for item in value.values())
        if uncertain(baseline) or uncertain(current):
            request_refresh(stored_root, None)
            changed = True
        else:
            changed = sorted(path for path in baseline.keys() | current.keys() if baseline.get(path) != current.get(path))
            if changed:
                request_refresh(stored_root, changed)
        states[str(stored_root)] = current
        save_states(target, states)
        return bool(changed)




class UnixConnection(http.client.HTTPConnection):
    def __init__(self, path):
        super().__init__('localhost', timeout=2)
        self.path = str(path)

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(self.path)


def managed_post(root, endpoint, payload):
    home = Path(os.environ.get('ZVEC_GREP_HOME', Path.home() / '.zvec-grep')).resolve()
    directory = home / 'daemon'
    info = directory.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
        raise PermissionError('unsafe daemon directory')
    lock = directory / 'instance.lock'
    lock_info = lock.lstat()
    if not stat.S_ISREG(lock_info.st_mode) or lock_info.st_uid != os.getuid() or lock_info.st_mode & 0o077:
        raise PermissionError('unsafe daemon lock')
    instance = json.loads(lock.read_text(encoding='utf-8'))
    if instance.get('managed') is not True or instance.get('ready') is not True or instance.get('managed_api') != 1:
        raise ValueError('managed daemon is not ready')
    path = Path(instance['managedSocket'])
    standard = directory / 'managed.sock'
    fallback = Path(tempfile.gettempdir()) / ('zvg-' + str(os.getuid()) + '-' + hashlib.sha256(str(home).encode()).hexdigest()[:8]) / 'managed.sock'
    expected = standard if len(os.fsencode(standard)) <= 100 else fallback
    if path != expected:
        raise ValueError('unsafe daemon socket path')
    socket_dir = path.parent.lstat()
    if not stat.S_ISDIR(socket_dir.st_mode) or socket_dir.st_uid != os.getuid() or stat.S_IMODE(socket_dir.st_mode) != 0o700:
        raise PermissionError('unsafe socket directory')
    socket_info = path.lstat()
    if not stat.S_ISSOCK(socket_info.st_mode) or socket_info.st_uid != os.getuid() or stat.S_IMODE(socket_info.st_mode) != 0o600:
        raise PermissionError('unsafe daemon socket')
    pid = instance.get('pid')
    token = instance.get('instanceToken')
    if not isinstance(pid, int) or isinstance(pid, bool) or pid <= 0 or not isinstance(token, str) or not token:
        raise ValueError('invalid daemon identity')
    os.kill(pid, 0)
    connection = UnixConnection(path)
    try:
        connection.request('GET', '/managed/identity')
        response = connection.getresponse()
        identity = json.loads(response.read())
        verified_socket = connection.sock
        if verified_socket is None:
            raise RuntimeError('daemon closed identity connection')
        connection.auto_open = 0
        if (response.status != 200 or response.getheader('x-managed-instance') != token
                or not isinstance(identity, dict) or identity.get('managed') is not True or identity.get('pid') != pid
                or identity.get('instance_token') != token or not isinstance(identity.get('os_sandbox'), dict)
                or identity['os_sandbox'].get('remote') != 'denied'):
            raise ValueError('daemon identity mismatch')
        daemon_warnings = identity.get('warnings_dir')
        if (not isinstance(daemon_warnings, str) or not Path(daemon_warnings).is_absolute()
                or instance.get('warnings_dir') != daemon_warnings):
            raise ValueError('daemon warning identity mismatch')
        if Path(os.path.abspath(daemon_warnings)) != warnings_directory():
            warn(root, 'warning_directory_mismatch', RuntimeError('warning directory mismatch'), daemon_warnings)
            raise ValueError('daemon warning directory mismatch')
        if connection.sock is not verified_socket:
            raise RuntimeError('daemon identity connection changed')
        connection.request('POST', '/managed/' + endpoint, body=json.dumps(payload), headers={'Content-Type': 'application/json'})
        response = connection.getresponse()
        result = json.loads(response.read())
        if response.status not in (200, 202) or response.getheader('x-managed-instance') != token or not isinstance(result, dict):
            raise RuntimeError('daemon request failed')
        return result
    finally:
        connection.close()


def request_refresh(root, changed_paths, reservation_id=None):
    root = Path(root).resolve()
    payload = {'root': str(root), 'reason': 'turn_end', 'wait': False}
    if changed_paths is None or len(changed_paths) > 5000:
        payload['verify_content'] = True
    else:
        for path in changed_paths:
            if not isinstance(path, str) or not Path(path).is_absolute() or not Path(path).resolve().is_relative_to(root):
                raise ValueError('changed path outside workspace')
        payload['changed_paths'] = changed_paths
        payload['force_paths'] = [p for p in changed_paths if Path(p).is_file()]
    if reservation_id:
        payload['reservation_id'] = reservation_id
    result = managed_post(root, 'refresh', payload)
    if result.get('status') not in {'accepted', 'refreshed', 'unchanged'}:
        raise RuntimeError('managed daemon did not accept refresh')


def reserve(root):
    result = managed_post(root, 'reserve', {'root': str(Path(root).resolve()), 'reason': 'turn_end'})
    if result.get('status') != 'reserved' or not isinstance(result.get('reservation_id'), str):
        raise RuntimeError('managed daemon did not reserve response')
    return result['reservation_id']


def release(root, reservation_id, outcome='unchanged'):
    result = managed_post(root, 'release', {'root': str(Path(root).resolve()), 'reservation_id': reservation_id, 'outcome': outcome})
    if result.get('status') not in {outcome, 'released'}:
        raise RuntimeError('managed daemon did not release reservation')


def main():
    if len(sys.argv) == 6 and sys.argv[1] == 'worker':
        root, session, state_dir, reservation_id = sys.argv[2:]
        completed = False
        try:
            changed = finish(root, session, state_dir, lambda path, paths: request_refresh(path, paths, reservation_id), require_snapshot=True)
            completed = changed
            if not changed:
                release(root, reservation_id)
                completed = True
        except (OSError, ValueError, TypeError, KeyError, RuntimeError, http.client.HTTPException, subprocess.SubprocessError) as exc:
            warn(root, 'snapshot_failed', exc)
        finally:
            if not completed:
                try:
                    release(root, reservation_id, 'failed')
                except (OSError, ValueError, TypeError, KeyError, RuntimeError, http.client.HTTPException) as exc:
                    warn(root, 'release_failed', exc)
        return 0
    if len(sys.argv) != 2 or sys.argv[1] not in {'start', 'end'}:
        return 0
    try:
        event = json.load(sys.stdin)
        if not isinstance(event, dict):
            return 0
        root, session = event.get('cwd'), event.get('session_id')
        if not isinstance(root, str) or not isinstance(session, str) or not session:
            return 0
        state_dir = os.environ.get('ZVEC_HOOK_STATE_DIR', str(Path(tempfile.gettempdir()) / ('zvec-grep-hooks-' + str(os.getuid()))))
        if sys.argv[1] == 'start':
            begin(root, session, state_dir)
        else:
            prepare_state(state_dir)
            target = state_path(root, session, state_dir)
            try:
                roots = list(load_states(target))
            except FileNotFoundError:
                roots = []
            try:
                current_root = workspace(root)
                if current_root is not None and indexed(current_root) and str(current_root) not in roots:
                    trust = managed_post(current_root, 'check-root', {'root': str(current_root)})
                    if trust.get('status') != 'trusted' or trust.get('registered') is not True or trust.get('root') != str(current_root):
                        raise PermissionError('workspace is not registered with managed daemon')
                    with session_lock(current_root, session, state_dir):
                        current = load_states(target) if target.exists() else {}
                        current.setdefault(str(current_root), None)
                        save_states(target, current)
                        roots = list(current)
            except (OSError, ValueError, TypeError, KeyError, RuntimeError, http.client.HTTPException) as exc:
                warn(root, 'hook_failed', exc)
            for stored_root in roots:
                try:
                    root_path = Path(stored_root)
                    if not root_path.exists():
                        with session_lock(stored_root, session, state_dir):
                            current = load_states(target)
                            current.pop(stored_root, None)
                            save_states(target, current)
                        continue
                    if not indexed(root_path):
                        warn(stored_root, 'index_unavailable', RuntimeError('workspace index unavailable'))
                        continue
                    reservation_id = reserve(stored_root)
                    try:
                        subprocess.Popen([sys.executable, __file__, 'worker', stored_root, session, state_dir, reservation_id],
                                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                         stderr=subprocess.DEVNULL, start_new_session=True)
                    except OSError:
                        try:
                            release(stored_root, reservation_id, 'failed')
                        finally:
                            raise
                except (OSError, ValueError, TypeError, KeyError, RuntimeError, http.client.HTTPException) as exc:
                    warn(stored_root, 'hook_failed', exc)
    except (OSError, ValueError, TypeError, KeyError, RuntimeError, http.client.HTTPException, subprocess.SubprocessError) as exc:
        if isinstance(locals().get('root'), str):
            warn(root, 'hook_failed', exc)
        else:
            print('zvec-grep hook unavailable: ' + type(exc).__name__, file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
