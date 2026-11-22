"""Minimal stand-ins for the host-only packages the kinetic scripts import (librosa, mediapipe, matplotlib, beat_this,
demucs), none of which CI installs. Tests write them into a temp folder and put it first on the child's PYTHONPATH.

Each fake is deterministic from its input, so a test can predict what the script under test does with it:
- mediapipe reads the frame: pose landmarks on bright frames, a segmentation mask from the red channel, a face whose
  mouth opens with the frame's brightness (no face on near-black frames);
- librosa decodes for real (soundfile for .wav, ffmpeg otherwise) and computes a centered RMS; its spectral calls only
  return arrays of the right shape, for plots;
- matplotlib records every axes call and savefig writes that record as JSON, so a test reads what was drawn."""

import os
from pathlib import Path

LIBROSA = r'''
import subprocess, types
import numpy as np


def load(path, sr=22050, mono=True, offset=0.0, duration=None):
    if str(path).lower().endswith('.wav'):
        import soundfile as sf
        y, rate = sf.read(path, dtype='float32', always_2d=True)
        y = y.mean(1)
        y = y[int(offset * rate):]
        if duration is not None:
            y = y[:int(round(duration * rate))]
        if rate != sr:
            t = np.arange(int(len(y) * sr / rate)) / sr
            y = np.interp(t, np.arange(len(y)) / rate, y).astype(np.float32)
        return y, sr
    cmd = ['ffmpeg', '-nostdin', '-v', 'error', '-ss', f'{offset:.6f}']
    if duration is not None:
        cmd += ['-t', f'{duration:.6f}']
    cmd += ['-i', str(path), '-f', 'f32le', '-ac', '1', '-ar', str(sr), '-']
    out = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(out, np.float32).copy(), sr


def _rms(y=None, frame_length=2048, hop_length=512, **_):
    y = np.pad(np.asarray(y, np.float64), frame_length // 2)
    n = 1 + (len(y) - frame_length) // hop_length
    fr = np.stack([y[i * hop_length:i * hop_length + frame_length] for i in range(n)])
    return np.sqrt((fr ** 2).mean(1))[None]


feature = types.SimpleNamespace(rms=_rms)


def stft(y, n_fft=2048, hop_length=512, **_):
    return np.zeros((1 + n_fft // 2, 1 + len(y) // hop_length), np.complex64)


def amplitude_to_db(S, ref=None, **_):
    return np.asarray(S, np.float32)
'''

MEDIAPIPE = r'''
import types


class _P:
    def __init__(self, x, y, visibility=1.0):
        self.x, self.y, self.visibility = x, y, visibility


class _Pose:
    def __init__(self, **kw):
        pass

    def process(self, rgb):
        mean = float(rgb.mean())
        if mean <= 100:
            return types.SimpleNamespace(pose_landmarks=None)
        pts = [_P(j / 33 + 0.0123456, mean / 255, 0.98765) for j in range(33)]
        return types.SimpleNamespace(pose_landmarks=types.SimpleNamespace(landmark=pts))


class _Selfie:
    def __init__(self, **kw):
        pass

    def process(self, rgb):
        return types.SimpleNamespace(segmentation_mask=rgb[..., 0] / 255.0)


class _FaceMesh:
    def __init__(self, **kw):
        pass

    def process(self, rgb):
        mean = float(rgb.mean())
        if mean < 8:
            return types.SimpleNamespace(multi_face_landmarks=None)
        pts = [_P(0.5, 0.5) for _ in range(478)]
        pts[10], pts[152] = _P(0.5, 0.1), _P(0.5, 0.9)
        pts[13], pts[14] = _P(0.5, 0.5), _P(0.5, 0.5 + 0.8 * mean / 255)
        return types.SimpleNamespace(multi_face_landmarks=[types.SimpleNamespace(landmark=pts)])


solutions = types.SimpleNamespace(
    pose=types.SimpleNamespace(Pose=_Pose),
    selfie_segmentation=types.SimpleNamespace(SelfieSegmentation=_Selfie),
    face_mesh=types.SimpleNamespace(FaceMesh=_FaceMesh),
)
'''

MATPLOTLIB = r'''
def use(backend):
    pass
'''

PYPLOT = r'''
import json
import numpy as np

_axes = []


def _safe(v):
    if isinstance(v, np.ndarray):
        v = v.tolist() if v.size <= 4096 else {'shape': list(v.shape)}
    if isinstance(v, (list, tuple)):
        return [_safe(x) for x in v]
    if isinstance(v, dict):
        return {k: _safe(x) for k, x in v.items()}
    if isinstance(v, (np.floating, np.integer)):
        return v.item()
    return v


class _Ax:
    def __init__(self):
        self.calls = []

    def __getattr__(self, name):
        def record(*args, **kw):
            self.calls.append([name, _safe(list(args)), _safe(kw)])
        return record


def subplots(nrows=1, ncols=1, **kw):
    global _axes
    _axes = [_Ax() for _ in range(nrows * ncols)]
    return object(), _axes


def tight_layout():
    pass


def savefig(path, **kw):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump([ax.calls for ax in _axes], f)


def close(*args):
    pass
'''

BEAT_THIS = r'''
class File2Beats:
    def __init__(self, **kw):
        raise AssertionError('stub: the checkpoint gate should stop the script before the beat model loads')
'''

DEMUCS_MAIN = r'''
import json, os, sys
args = sys.argv[1:]
with open('demucs_args.json', 'w', encoding='utf-8') as f:
    json.dump(args, f)
name = os.path.splitext(os.path.basename(args[-1]))[0]
out = os.path.join(args[args.index('-o') + 1], args[args.index('-n') + 1], name)
os.makedirs(out, exist_ok=True)
for stem in ('vocals.wav', 'no_vocals.wav'):
    open(os.path.join(out, stem), 'wb').close()
'''

FILES = {
    "librosa/__init__.py": LIBROSA,
    "mediapipe/__init__.py": MEDIAPIPE,
    "matplotlib/__init__.py": MATPLOTLIB,
    "matplotlib/pyplot.py": PYPLOT,
    "beat_this/__init__.py": "",
    "beat_this/inference.py": BEAT_THIS,
    "demucs/__init__.py": "",
    "demucs/__main__.py": DEMUCS_MAIN,
}


def install(root):
    """Write every stub package under root and return an environment whose PYTHONPATH starts with it."""
    root = Path(root)
    for rel, text in FILES.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")
    env = dict(os.environ)
    env["PYTHONPATH"] = os.pathsep.join([str(root)] + ([env["PYTHONPATH"]] if env.get("PYTHONPATH") else []))
    return env
