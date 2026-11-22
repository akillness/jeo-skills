"""Song -> engine/data/audio.json: beats, downbeats, kick/snare/vocal onsets, 60 fps envelopes. Also separates the vocal stem.
usage: python scripts/audio_analysis.py audio/master.mp3
Writes: stems/<name>/vocals.wav + no_vocals.wav (Demucs), engine/data/audio.json (with "master" = the input path).
The master itself is never modified."""
import sys, os, json, hashlib, subprocess, urllib.request, numpy as np, librosa

if len(sys.argv) < 2: sys.exit(__doc__)
master = sys.argv[1]; name = os.path.splitext(os.path.basename(master))[0]
stem_dir = f'stems/htdemucs/{name}'
if not os.path.exists(f'{stem_dir}/vocals.wav'):
    subprocess.run([sys.executable, '-m', 'demucs', '--two-stems=vocals', '-n', 'htdemucs', '-o', 'stems', master], check=True)
FPS_ENV = 60
from beat_this.inference import File2Beats


def load_json(path):
    with open(path) as f:
        return json.load(f)


def save_json(obj, path, **kw):
    with open(path, 'w') as f:
        json.dump(obj, f, **kw)


# beat_this would fetch 'final0' unverified and unpickle it; a checked local copy loads with weights_only.
CKPT = 'models/beat_this-final0.ckpt'
CKPT_URL = 'https://cloud.cp.jku.at/public.php/dav/files/7ik4RrBKTS273gp/final0.ckpt'
CKPT_SHA256 = '8c328b45f59d8dd3dff219253ff6a8d6482be57d0133a29140e2febbf8eb8331'


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def beat_checkpoint():
    if not os.path.exists(CKPT):
        os.makedirs(os.path.dirname(CKPT), exist_ok=True)
        try:
            urllib.request.urlretrieve(CKPT_URL, CKPT + '.part')
        except BaseException:
            if os.path.exists(CKPT + '.part'):
                os.remove(CKPT + '.part')
            raise
        os.replace(CKPT + '.part', CKPT)
    if sha256(CKPT) != CKPT_SHA256:
        os.remove(CKPT)
        sys.exit(f'Checksum mismatch for the beat_this checkpoint from {CKPT_URL}: removed {CKPT}.')
    return CKPT


beats, downbeats = File2Beats(checkpoint_path=beat_checkpoint(), device='cpu', dbn=False)(master)
beats = [float(b) for b in beats]; downbeats = [float(b) for b in downbeats]
bpm = float(60 / np.median(np.diff(beats)))
voc, sr = librosa.load(f'{stem_dir}/vocals.wav', sr=22050, mono=True)
inst, _ = librosa.load(f'{stem_dir}/no_vocals.wav', sr=22050, mono=True)
mix, _ = librosa.load(master, sr=22050, mono=True)
hop = sr // FPS_ENV
def env(y):
    r = librosa.feature.rms(y=y, frame_length=hop * 2, hop_length=hop)[0]; return np.clip(r / (np.percentile(r, 99) + 1e-9), 0, 1.5)
S = np.abs(librosa.stft(inst, n_fft=2048, hop_length=hop)); fr = librosa.fft_frequencies(sr=sr, n_fft=2048)
def band(lo, hi):
    b = S[(fr >= lo) & (fr < hi)].sum(0); return np.clip(b / (np.percentile(b, 99) + 1e-9), 0, 1.5)
def band_onsets(lo, hi, k=1.2):
    Sx = np.abs(librosa.stft(inst, n_fft=2048, hop_length=256)); f2 = librosa.fft_frequencies(sr=sr, n_fft=2048)
    sub = librosa.amplitude_to_db(Sx[(f2 >= lo) & (f2 < hi)])
    o = np.concatenate([[0], np.maximum(0, np.diff(sub, axis=1)).mean(0)]).astype(np.float64)
    pk = librosa.util.peak_pick(o, pre_max=3, post_max=3, pre_avg=10, post_avg=10, delta=float(k * o.std()), wait=8)
    return [float(p * 256 / sr) for p in pk]
out = {
    'master': master, 'duration': float(len(mix) / sr), 'bpm': bpm, 'beats': beats, 'downbeats': downbeats,
    'kicks': band_onsets(30, 130), 'snares': band_onsets(1500, 5000),
    'vocal_onsets': [float(x) for x in librosa.onset.onset_detect(y=voc, sr=sr, hop_length=256, units='time', delta=0.08)],
    'env_fps': FPS_ENV,
    'env': {k: np.round(v, 3).tolist() for k, v in {'mix': env(mix), 'vocal': env(voc), 'kick': band(30, 130), 'snare': band(1500, 5000), 'hats': band(7000, 11000), 'bass': band(40, 250)}.items()},
}
os.makedirs('engine/data', exist_ok=True); save_json(out, 'engine/data/audio.json')
print(f"bpm {bpm:.1f}, {len(beats)} beats, {len(downbeats)} downbeats, {len(out['kicks'])} kicks, {len(out['snares'])} snares, dur {out['duration']:.2f}s")
print('downbeats:', ' '.join(f'{x:.2f}' for x in downbeats))
