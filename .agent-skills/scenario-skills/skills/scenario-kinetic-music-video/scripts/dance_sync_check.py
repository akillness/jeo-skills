"""Motion-onset vs beat correlation for dance clips. usage: python tools/dance_sync_check.py clip.mp4 slot_start"""
import sys, json, numpy as np, cv2


def load_json(path):
    with open(path) as f:
        return json.load(f)


def save_json(obj, path, **kw):
    with open(path, 'w') as f:
        json.dump(obj, f, **kw)


if len(sys.argv) < 3: sys.exit(__doc__)
vid, slot = sys.argv[1], float(sys.argv[2])
cap = cv2.VideoCapture(vid); fps = cap.get(cv2.CAP_PROP_FPS); prev=None; D=[]
while True:
    ok, f = cap.read()
    if not ok: break
    g = cv2.cvtColor(cv2.resize(f,(160,90)), cv2.COLOR_BGR2GRAY).astype(np.float32)
    D.append(0 if prev is None else np.abs(g-prev).mean()); prev=g
D=np.array(D); t=np.arange(len(D))/fps
A=load_json('engine/data/audio.json')
# accent train: kicks+snares near beats within slot
ev=[x-slot for x in A['kicks']+A['snares'] if slot<=x<slot+len(D)/fps]
train=np.zeros(len(D));
for e in ev:
    i=int(round(e*fps));
    if 0<=i<len(D): train[i]=1
k=np.exp(-np.arange(0,6)/2.0); train=np.convolve(train,k)[:len(D)]
# motion "acceleration" onsets = positive derivative of motion energy
m=np.maximum(0,np.diff(D,prepend=D[0]))
z=lambda x:(x-x.mean())/(x.std()+1e-9)
lags=range(-8,9); cs=[np.corrcoef(np.roll(z(m),-L),z(train))[0,1] for L in lags]
b=list(lags)[int(np.argmax(cs))]
# null: shuffled/shifted baseline
null=[np.corrcoef(np.roll(z(m),s),z(train))[0,1] for s in range(15,len(D)-15,7)]
print(f"fps={fps} corr@0={cs[8]:.3f} best_lag={b/fps*1000:+.0f}ms corr@best={max(cs):.3f} null_mean={np.mean(null):.3f} null_std={np.std(null):.3f}")
