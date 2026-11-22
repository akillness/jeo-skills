"""Word-level lyric timing -> engine/data/lyrics.json
usage:
  python scripts/lyrics_align.py transcribe [--prompt "vocabulary hints, names, jargon"]  # writes analysis/lyrics_raw.json + prints lines
  python scripts/lyrics_align.py align lyrics.txt [--chant outro:GO]                      # maps corrected lyrics onto the timings
Each transcribe pass also keeps its own copy (lyrics_raw_plain.json without --prompt, lyrics_raw_hints.json with it), so the
plain and hinted passes can be compared; align reads lyrics_raw.json, the latest pass.
lyrics.txt format: '# section: name' lines, then one sung line per row (you correct the transcript by hand; supplied lyrics always win).
A line before any section header is aligned with no section.
--chant: that section's lines are counted, not aligned. Each vocal peak between the lines around the section becomes one chant
word, up to as many words as the section's lines hold (all peaks to the next line when it has none).
Method (what held up on sung vocals): faster-whisper large-v3 word timestamps on the Demucs vocal stem, sequence-matched onto the
corrected lyrics, starts snapped to vocal onsets within 80 ms, then a fix for short first words pulled early by a held note.
align prints on stderr each lyric word with no exact transcript match, with the onset it was given: check those first.
wav2vec/MMS forced alignment ran ~200 ms late on singing, so it is not used. Always eyeball the result with plot_lyrics.py."""
import os, sys, json, re, difflib, argparse, numpy as np


def load_json(path):
    with open(path) as f:
        return json.load(f)


def save_json(obj, path, **kw):
    with open(path, 'w') as f:
        json.dump(obj, f, **kw)


def stem():
    from audio_paths import vocal_stem
    return vocal_stem()

def raw_paths(prompt):
    return ['analysis/lyrics_raw.json', f"analysis/lyrics_raw_{'hints' if prompt else 'plain'}.json"]

def transcribe(prompt):
    from faster_whisper import WhisperModel
    # Systran/faster-whisper-large-v3 at a fixed Hugging Face commit, not whatever main points to.
    m = WhisperModel('large-v3', device='cpu', compute_type='int8', revision='edaa852ec7e145841d8ffdb056a99866b5f0a478')
    segs, _ = m.transcribe(stem(), language='en', word_timestamps=True, beam_size=5, condition_on_previous_text=False, initial_prompt=prompt or None, temperature=0)
    out = []
    for s in segs:
        out.append({'start': s.start, 'end': s.end, 'text': s.text.strip(), 'words': [{'w': w.word.strip(), 's': round(w.start, 3), 'e': round(w.end, 3)} for w in s.words]})
        print(f'[{s.start:7.2f}-{s.end:7.2f}] {s.text.strip()}', flush=True)
    os.makedirs('analysis', exist_ok=True)
    for p in raw_paths(prompt): save_json(out, p, indent=1)

def align(path, chant=None, no_fix=()):
    A = load_json('engine/data/audio.json'); vo = np.array(A['vocal_onsets'])
    W = [w for s in load_json('analysis/lyrics_raw.json') for w in s['words']]
    norm = lambda s: re.sub(r'[^a-z0-9]', '', s.lower())
    lines, sec, sec_at = [], None, {}
    with open(path) as fh:
        raw = fh.readlines()
    for row, L in enumerate(raw, 1):
        L = L.strip()
        if not L: continue
        if L.startswith('# section:'): sec = L.split(':', 1)[1].strip(); sec_at.setdefault(sec, len(lines)); continue
        lines.append({'section': sec, 'text': L, 'words': L.split(), '_row': row})
    chant_sec, chant_word = (chant.split(':') + ['GO'])[:2] if chant else (None, None)
    # without --chant no line is chanted, not even one before any section header (its section is None too)
    chanted = lambda l: chant and l['section'] == chant_sec
    C = [(li, wi, norm(w)) for li, l in enumerate(lines) if not chanted(l) for wi, w in enumerate(l['words'])]
    sm = difflib.SequenceMatcher(a=[c[2] for c in C], b=[norm(w['w']) for w in W], autojunk=False)
    T, matched = [None] * len(C), set()
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == 'equal':
            for k in range(i2 - i1): T[i1 + k] = (W[j1 + k]['s'], W[j1 + k]['e']); matched.add(i1 + k)
        elif tag == 'replace':
            # spread over at most as many transcript words as lyric words: when the supplied lyrics cover only part of
            # the song, the tail of the transcript is not theirs (it once stretched a last word to the song's end)
            n = i2 - i1; s, e = W[j1]['s'], W[min(j2, j1 + n) - 1]['e']
            for k in range(n): T[i1 + k] = (s + (e - s) * k / n, s + (e - s) * (k + 1) / n)
    for i in range(len(C)):
        if T[i] is None:
            p = next((T[j] for j in range(i - 1, -1, -1) if T[j]), (0, 0)); T[i] = (p[1], p[1] + 0.25)
    for i, (li, wi, _) in enumerate(C):
        s, e = T[i]
        if len(vo):
            j = np.argmin(abs(vo - s))
            if abs(vo[j] - s) < 0.08: s = float(vo[j])
        lines[li].setdefault('_w', []).append({'w': lines[li]['words'][wi], 's': round(s, 3), 'e': round(max(e, s + 0.06), 3)})
    unmatched = {(li, wi) for i, (li, wi, _) in enumerate(C) if i not in matched}
    out, guessed = [], []
    for li, l in enumerate(lines):
        if chanted(l): continue
        ws, row = l.pop('_w'), l.pop('_row')
        for i in range(len(ws) - 1):  # short first word pulled early by the previous held note
            if ws[i + 1]['s'] - ws[i]['s'] > 0.9 and len(ws[i]['w'].strip(',.?!')) <= 4 and ws[i]['w'].strip(',.?!') not in no_fix:
                c = vo[(vo > ws[i + 1]['s'] - 0.55) & (vo < ws[i + 1]['s'] - 0.1)]
                ws[i]['s'] = round(float(c[0]) if len(c) else ws[i + 1]['s'] - 0.28, 3)
        for i, w in enumerate(ws):
            if i + 1 < len(ws): w['e'] = round(min(max(w['e'], w['s'] + 0.12), ws[i + 1]['s']), 3)
            w['e'] = round(min(w['e'], w['s'] + 2.0), 3)  # no sung word holds past 2 s
        l['words'] = ws; l['s'] = ws[0]['s']; l['e'] = ws[-1]['e']; out.append(l)
        guessed += [(w['s'], row, w['w']) for wi, w in enumerate(ws) if (li, wi) in unmatched]
    if chant_sec:  # repeated chant: one word per vocal-envelope peak between the lines around the chant section
        from scipy.signal import find_peaks
        env = np.array(A['env']['vocal']); fps = A['env_fps']; t = np.arange(len(env)) / fps
        at = sec_at.get(chant_sec, len(lines))  # a section missing from lyrics.txt chants after the last line
        before = sum(1 for li, l in enumerate(lines) if li < at and not chanted(l))
        t0 = out[before - 1]['e'] if before else 0
        t1 = out[before]['s'] if before < len(out) else np.inf
        m = (t > t0) & (t < t1)  # contiguous: dropping silent samples would pull peaks together and the distance rule then drops words
        pk, _ = find_peaks(env[m], height=0.3, distance=int(0.17 * fps), prominence=0.15)
        gos = [round(float(t[m][p]) - 0.06, 3) for p in pk]
        n = sum(len(l['words']) for l in lines if chanted(l))
        if n: gos = gos[:n]
        if gos: out.insert(before, {'section': chant_sec, 'text': (chant_word + ' ') * len(gos), 'words': [{'w': chant_word, 's': g, 'e': round(g + 0.18, 3)} for g in gos], 's': gos[0], 'e': gos[-1] + 0.3})
    os.makedirs('engine/data', exist_ok=True); save_json({'lines': out}, 'engine/data/lyrics.json', indent=1)
    for l in out: print(f"{l['s']:7.2f}-{l['e']:7.2f} {l['section'] or '':8s} {l['text'][:70]}")
    if guessed:  # their onsets come from a misheard word's slot, are interpolated, or follow the previous word
        print(f'{len(guessed)} lyric word(s) had no exact transcript match; check their onsets in plot_lyrics.py:', file=sys.stderr)
        for s, row, w in guessed: print(f'  {s:8.3f} s  line {row}  "{w}"', file=sys.stderr)

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('cmd'); ap.add_argument('lyrics', nargs='?'); ap.add_argument('--prompt', default='')
    ap.add_argument('--chant'); ap.add_argument('--no-fix', default='', help='comma list of short words that are legitimately long (acronyms)')
    a = ap.parse_args()
    if a.cmd == 'transcribe': transcribe(a.prompt)
    else: align(a.lyrics, a.chant, tuple(x for x in a.no_fix.split(',') if x))
