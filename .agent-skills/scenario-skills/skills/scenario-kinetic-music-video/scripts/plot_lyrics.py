"""Visual lyric-timing check: vocal-stem spectrogram with word-start markers, vocal onsets and beats.
usage: python scripts/plot_lyrics.py 1:12.5 21.5:31.5 ...   -> analysis/plots/lyrics_<a>.png  (then look at the PNGs)
Word starts should sit on the rise of a harmonic stack / consonant burst. Held notes show as long flat stacks."""
import sys, os, json, numpy as np, librosa, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from audio_paths import vocal_stem


def load_json(path):
    with open(path) as f:
        return json.load(f)


def save_json(obj, path, **kw):
    with open(path, 'w') as f:
        json.dump(obj, f, **kw)


L = load_json('engine/data/lyrics.json'); A = load_json('engine/data/audio.json')
y, sr = librosa.load(vocal_stem(), sr=22050); os.makedirs('analysis/plots', exist_ok=True)
if len(sys.argv) < 2: sys.exit(__doc__)
for rng in sys.argv[1:]:
    a, b = map(float, rng.split(':')); seg = y[int(a * sr):int(b * sr)]
    S = librosa.amplitude_to_db(np.abs(librosa.stft(seg, n_fft=1024, hop_length=128)), ref=np.max)
    fig, ax = plt.subplots(2, 1, figsize=(22, 7), sharex=True, gridspec_kw={'height_ratios': [3, 1]})
    ax[0].imshow(S[:200], origin='lower', aspect='auto', extent=[a, b, 0, 200 * sr / 1024], cmap='magma', vmin=-60)
    env = np.array(A['env']['vocal']); t = np.arange(len(env)) / A['env_fps']; m = (t >= a) & (t <= b); ax[1].plot(t[m], env[m], 'k')
    for l in L['lines']:
        for w in l['words']:
            if a <= w['s'] <= b: ax[0].axvline(w['s'], color='cyan', lw=1); ax[0].text(w['s'], 3800, w['w'], color='cyan', fontsize=9, rotation=90)
    for o in A['vocal_onsets']:
        if a <= o <= b: ax[1].axvline(o, color='green', lw=1)
    for bt in A['beats']:
        if a <= bt <= b: ax[1].axvline(bt, color='gray', lw=0.6, ls=':')
    plt.tight_layout(); f = f'analysis/plots/lyrics_{a:g}.png'; plt.savefig(f, dpi=70); plt.close(); print(f)
