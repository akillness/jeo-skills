"""Resolve the vocal stem belonging to the approved master, never an older take."""
import json
from pathlib import Path


def vocal_stem():
    with open('engine/data/audio.json') as source:
        master = json.load(source)['master']
    path = Path('stems/htdemucs') / Path(master).stem / 'vocals.wav'
    if not path.is_file():
        raise FileNotFoundError(f'{path}: run audio_analysis.py on the approved master first')
    return str(path)


if __name__ == '__main__':
    print(vocal_stem())
