# Colibri Practical Examples

## Example 1: Basic setup and first chat

**Goal**: Download GLM-5.2, convert to int4, run first inference

```bash
# Prerequisites
cd colibri/c
./setup.sh        # Build and run self-tests
cd ..

# Download & convert (one-time, ~45 min on 100 Mbps internet + SSD)
./c/coli convert --model /nvme/glm52_i4
# Output:
# Downloading GLM-5.2-FP8 shard 1/24... [████████░░] 87%
# Converting to int4 container...
# Converting MTP head to int8 (lossless speculative decoding)...
# ✓ Ready. Size: 376 GB

# Start interactive chat
export COLI_MODEL=/nvme/glm52_i4
./c/coli chat

# Interaction
🐦 colibrì v1.0 — GLM-5.2 · 744B MoE · int4 · streaming CPU
✓ ready in 32s · resident 9.9 GB
› Why is the sky blue?
◆ The sky appears blue because of Rayleigh scattering...
```

## Example 2: Measure performance on your hardware

**Goal**: Profile tokens/second, cache hit ratio, expert-load patterns

```bash
# View storage hierarchy before running
export COLI_MODEL=/nvme/glm52_i4
./c/coli plan
# Output:
# Storage Plan (25.1 GB RAM available):
#   Dense layers:    resident in RAM (~9.9 GB at int4)
#   Per-layer cache: 2048 MB LRU (adjustable)
#   Routed experts:  disk-streamed (~370 GB on /nvme)
#   Estimated I/O:   ~660 expert-loads/token (cold cache)
#               →    ~50 expert-loads/token (warm cache)

# Run with detailed stats
./c/coli chat --prompt "Explain machine learning" \
  --benchmark
# Typical output:
# Tokens generated: 87
# Time elapsed: 39.2s
# Throughput: 2.22 tok/s (MTP enabled, warm cache)
# Expert cache: 2145 hits, 523 disk-reads (80% hit rate)
# Memory: resident 9.9 GB, cache 2.1 GB

# Compare with MTP disabled (single-token mode)
export COLI_MTP=0
./c/coli chat --prompt "Explain machine learning"
# Typical output:
# Tokens generated: 87
# Time elapsed: 73.1s
# Throughput: 1.19 tok/s (no speculation)
```

## Example 3: Configure for limited RAM (20 GB)

**Goal**: Run on a tighter budget by reducing cache and using CPU-only

```bash
# Minimal RAM profile
export COLI_MODEL=/nvme/glm52_i4
export COLI_CACHE_SIZE_MB=512   # Reduce from 2048 to 512 MB per layer

./c/coli plan --ram 20
# Output:
# ⚠ WARNING: only 20 GB available, dense layers need 9.9 GB
# Remaining: 10.1 GB
# - Per-layer LRU cache: 512 MB × 75 MoE layers = 37.5 GB physical
#   (but LRU evicts; resident typically ~2–3 GB)
# - Estimated throughput: 1.1–1.5 tok/s (more disk thrashing)

./c/coli chat
# Works, but slower due to more expert cache misses
```

## Example 4: GPU-accelerated inference (CUDA)

**Goal**: Pin frequently-used experts to GPU vRAM for speedup

**Prerequisite**: Build with CUDA
```bash
# In colibri/c/
gcc -O3 -fopenmp glm.c -o coli -lm -L/usr/local/cuda/lib64 -lcuda
```

**Run with GPU pinning**:
```bash
export COLI_MODEL=/nvme/glm52_i4
./c/coli chat \
  --gpu 0 \
  --vram 8        # Pin ~400 experts to 8 GB GPU vRAM

# Monitor GPU memory
watch -n 1 nvidia-smi
# Output (during inference):
# GPU 0: 8.1 GB used (pinned experts), CUDA compute 0% (inference on CPU)
```

**Performance impact**:
- Without GPU: 2.2 tok/s (CPU only, MTP warm cache)
- With GPU pinning: 2.8 tok/s (~27% faster due to reduced disk I/O)

## Example 5: Batch inference script

**Goal**: Process multiple prompts in one session to amortize model load time

```bash
#!/bin/bash
# batch_inference.sh

export COLI_MODEL=/nvme/glm52_i4
export COLI_TEMPERATURE=0.7
export COLI_TOP_P=0.9

# Array of prompts
prompts=(
  "What is photosynthesis?"
  "Explain quantum computing"
  "Write a haiku about summer"
  "How does DNA encode proteins?"
)

echo "🐦 Batch Inference Start ($(date))"

for prompt in "${prompts[@]}"; do
  echo ""
  echo "▶ Prompt: $prompt"
  echo "---"
  
  # One-shot inference (no interactive loop)
  ./c/coli chat --prompt "$prompt" 2>/dev/null | tail -1
  
  echo "---"
done

echo ""
echo "✓ Batch complete ($(date))"
```

**Run**:
```bash
bash batch_inference.sh
# Output:
# 🐦 Batch Inference Start
# ▶ Prompt: What is photosynthesis?
# ---
# Photosynthesis is the process by which plants...
# ---
# ▶ Prompt: Explain quantum computing
# ---
# Quantum computing harnesses quantum mechanics...
# ---
```

**Performance**: ~15–25 tok/s combined (model loads once, benefits from warm cache across prompts)

## Example 6: Integration with a simple HTTP API

**Goal**: Wrap Colibri inference in a REST endpoint

**Python wrapper** (`colibri_server.py`):
```python
#!/usr/bin/env python3
import subprocess
import json
from flask import Flask, request, jsonify

app = Flask(__name__)
COLI_MODEL = '/nvme/glm52_i4'

@app.route('/generate', methods=['POST'])
def generate():
    data = request.json
    prompt = data.get('prompt', '')
    temperature = data.get('temperature', 0.9)
    top_p = data.get('top_p', 0.9)
    
    if not prompt:
        return jsonify({'error': 'Missing prompt'}), 400
    
    try:
        env = {
            'COLI_MODEL': COLI_MODEL,
            'COLI_TEMPERATURE': str(temperature),
            'COLI_TOP_P': str(top_p)
        }
        
        # Run coli chat and capture output
        result = subprocess.run(
            ['./c/coli', 'chat', '--prompt', prompt],
            capture_output=True,
            text=True,
            timeout=300,
            env={**os.environ, **env}
        )
        
        # Parse last line as response
        response_text = result.stdout.strip().split('\n')[-1]
        
        return jsonify({
            'prompt': prompt,
            'response': response_text,
            'temperature': temperature,
            'top_p': top_p
        }), 200
        
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Inference timeout'}), 504
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=False)
```

**Usage**:
```bash
python3 colibri_server.py &
sleep 2

curl -X POST http://localhost:5000/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is AI?", "temperature": 0.8}'

# Response
{
  "prompt": "What is AI?",
  "response": "AI (Artificial Intelligence) is...",
  "temperature": 0.8,
  "top_p": 0.9
}
```

## Example 7: Streaming inference (token-by-token)

**Goal**: Emit tokens as they generate (useful for chat UI)

**Python streaming** (`stream_inference.py`):
```python
#!/usr/bin/env python3
import subprocess
import os
import sys

def stream_inference(prompt, model_path):
    """Stream tokens from Colibri inference."""
    
    env = os.environ.copy()
    env['COLI_MODEL'] = model_path
    
    # Run coli (output includes token-by-token streaming in real time)
    proc = subprocess.Popen(
        ['./c/coli', 'chat', '--prompt', prompt, '--stream'],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        env=env
    )
    
    for line in proc.stdout:
        print(line.rstrip(), flush=True)  # Flush each token immediately
    
    proc.wait()

if __name__ == '__main__':
    prompt = ' '.join(sys.argv[1:]) if len(sys.argv) > 1 else 'Hello'
    stream_inference(prompt, '/nvme/glm52_i4')
```

**Usage**:
```bash
python3 stream_inference.py "Write a short poem about the ocean"
# Output (real-time streaming):
# The ocean vast and deep...
# Waves crashing on the shore...
# Salt spray on weathered rocks...
# (tokens stream as generated)
```

## Example 8: Troubleshoot low tokens/second

**Goal**: Diagnose why throughput is <1 tok/s despite warm cache

**Diagnostic script** (`diagnose.sh`):
```bash
#!/bin/bash

export COLI_MODEL=/nvme/glm52_i4

echo "🔍 Colibri Performance Diagnostics"
echo ""

echo "1. Storage plan:"
./c/coli plan

echo ""
echo "2. Disk speed (should be >300 MB/s for NVMe):"
time dd if=$COLI_MODEL/experts/expert_0.bin of=/dev/null bs=1M count=100

echo ""
echo "3. CPU info:"
lscpu | grep -E '^CPU|^Thread'

echo ""
echo "4. Available RAM:"
free -h | grep Mem

echo ""
echo "5. OpenMP threads (default: all cores):"
echo "OMP_NUM_THREADS=$OMP_NUM_THREADS (unset = use all)"

echo ""
echo "6. Run benchmark:"
time ./c/coli chat --prompt "test" --benchmark

echo ""
echo "Diagnostics complete."
```

**Run & interpret**:
```bash
bash diagnose.sh

# Interpretation:
# If storage plan shows <50 expert-loads on warm cache → OK
# If disk speed <200 MB/s → NVMe too slow; consider SSD upgrade
# If CPU shows <8 cores → consider parallel-workload CPU
# If benchmark shows <1 tok/s + high cache misses → increase COLI_CACHE_SIZE_MB
```

## Example 9: Custom temperature & sampling

**Goal**: Generate varied outputs vs deterministic ones

```bash
# Greedy (deterministic, always best token)
export COLI_TEMPERATURE=0.0
./c/coli chat --prompt "Complete: The answer is"
# Output: The answer is 42 (always same)

# Warm (creative)
export COLI_TEMPERATURE=1.5
export COLI_TOP_P=0.8
./c/coli chat --prompt "Write a creative story start"
# Output: varies each run, more creative

# Balanced (default)
export COLI_TEMPERATURE=0.9
export COLI_TOP_P=0.9
./c/coli chat --prompt "Explain photosynthesis"
# Output: natural, informative, slightly variable
```

**Parameters**:
- **Temperature**: 0 (greedy) → 2 (random). Default 0.95
- **Top-p**: 0–1 (nucleus sampling). Default 0.9

## Example 10: Model conversion troubleshooting

**Goal**: Recover from incomplete or corrupted conversion

**Symptoms**:
- Conversion hung mid-shard
- Chat crashes with "expert file corrupted"
- MTP head still int4 (low draft acceptance)

**Recovery**:
```bash
# 1. Check which shards downloaded
ls -lh /nvme/glm52_i4/raw_shards/ | head -10

# 2. Resume conversion (resumable from where it stopped)
./c/coli convert --model /nvme/glm52_i4 --resume

# 3. Verify MTP head quantization
stat /nvme/glm52_i4/experts/mtp_head.bin
# Should show: ~1.7 GB (int8)
# Not:        ~2.7 GB (int4, needs reconversion)

# 4. If MTP is wrong, force reconversion
./c/coli convert --model /nvme/glm52_i4 --force-mtp-int8

# 5. Validate model integrity
./c/coli plan --validate
# Checks: file sizes, int4 vs int8 quantization, checksums
```

## Example 11: Memory profiling

**Goal**: Understand RAM usage patterns during inference

**Python memory monitor** (`monitor_memory.py`):
```python
#!/usr/bin/env python3
import psutil
import subprocess
import threading
import time

def monitor(proc, interval=0.5):
    """Log memory usage in background."""
    while proc.poll() is None:
        try:
            mem = proc.memory_info()
            rss_gb = mem.rss / (1024**3)
            vms_gb = mem.vms / (1024**3)
            print(f"  [{time.time():.1f}s] RSS: {rss_gb:.1f} GB, VMS: {vms_gb:.1f} GB")
            time.sleep(interval)
        except:
            break

if __name__ == '__main__':
    import os
    env = os.environ.copy()
    env['COLI_MODEL'] = '/nvme/glm52_i4'
    
    proc = subprocess.Popen(
        ['./c/coli', 'chat', '--prompt', 'Long prompt...'],
        env=env
    )
    
    monitor_thread = threading.Thread(target=monitor, args=(proc,), daemon=True)
    monitor_thread.start()
    
    proc.wait()
    print("Done")
```

**Output**:
```
[0.1s] RSS: 9.9 GB, VMS: 10.1 GB
[1.2s] RSS: 11.2 GB, VMS: 11.5 GB  (cache warm, expert loaded)
[2.5s] RSS: 11.1 GB, VMS: 11.4 GB  (stable)
Done
```

## Example 12: Automated deployment script

**Goal**: Deploy Colibri on a new machine with all dependencies & model

**Deployment** (`deploy_colibri.sh`):
```bash
#!/bin/bash
set -e

MODEL_PATH="/data/glm52_i4"
REPO_URL="https://github.com/JustVugg/colibri.git"

echo "📦 Deploying Colibri..."

# 1. Install dependencies
echo "Installing dependencies..."
sudo apt-get update
sudo apt-get install -y build-essential libomp-dev curl

# 2. Clone repo
echo "Cloning Colibri..."
git clone $REPO_URL ~/colibri
cd ~/colibri/c

# 3. Build
echo "Building..."
./setup.sh

# 4. Download model (if disk space available)
required_space=$((400 * 1024 * 1024 * 1024))  # 400 GB
available_space=$(df /data | tail -1 | awk '{print $4 * 1024}')

if [ $available_space -gt $required_space ]; then
    echo "Downloading & converting model..."
    ./coli convert --model $MODEL_PATH
else
    echo "⚠️  Insufficient space for model ($available_space < 400 GB)"
    echo "   Model must be downloaded separately or provided via NFS"
fi

# 5. Verify
echo "Verifying..."
export COLI_MODEL=$MODEL_PATH
./coli plan

echo "✓ Deployment complete"
echo "  Run: export COLI_MODEL=$MODEL_PATH && ./coli chat"
```

**Usage**:
```bash
bash deploy_colibri.sh
# Output:
# 📦 Deploying Colibri...
# Installing dependencies...
# [sudo apt-get messages...]
# Cloning Colibri...
# Cloning into '/root/colibri'...
# Building...
# ✓ All self-tests passed
# Downloading & converting model...
# [conversion progress...]
# ✓ Deployment complete
```
