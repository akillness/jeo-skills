# Colibri Technical Reference

## Project structure

```
colibri/
  c/
    glm.c              # Main inference engine (~2,400 lines)
    glm.h              # Core data structures and API
    quantize.c         # Int4/int8 quantization helpers
    ggml.h             # (optional) tensor library interface
    setup.sh           # Build script (gcc, OpenMP, tests)
  convert/
    convert.py         # Download GLM-5.2-FP8, quantize to int4
    quantize.py        # Per-layer quantization (with MTP int8 head)
  models/
    (user-provided directory, not in repo)
  README.md            # Setup, quick start, model download
  LICENSE              # Apache 2.0
```

## Data structures

### Model state

```c
struct colibri_model {
  uint32_t n_layers;     // 80 layers (GLM-5.2)
  uint32_t n_experts;    // 256 experts per MoE layer
  uint32_t n_moe_layers; // 75 MoE layers (5 dense at start)
  
  // Dense resident (RAM, int4)
  float *token_emb;      // (vocab_size, 4096) embeddings
  float *attention;      // Dense attention layers (5 + non-MoE parts)
  float *shared_expert;  // Shared expert (all layers)
  
  // Routed experts (disk, int4)
  int32_t *expert_ptrs;  // File offsets for each expert
  uint8_t *expert_data;  // Mmap'd expert disk buffer
  
  // MTP head (int8, for speculative decoding)
  int8_t *mtp_head;      // Layer 78 multi-token predictor
  
  // KV-cache (compressed, float16/int8)
  float *kv_cache;       // Interleaved KV for all 64 heads, 576 floats/token
};
```

### Inference context

```c
struct colibri_context {
  colibri_model *model;
  
  // Input & output
  uint32_t *token_ids;   // Input token sequence
  float *logits;         // Output logits (vocab_size)
  
  // Intermediate activations (layer-by-layer)
  float *hidden;         // Current token representation
  float *router_logits;  // Expert routing scores (before softmax)
  
  // Cache stats
  uint32_t cache_hits;   // Expert LRU cache hits
  uint32_t cache_misses; // Expert disk reads
  uint64_t tokens_generated;
};
```

### Expert routing (MoE)

```c
// Per token, per MoE layer:
struct expert_selection {
  uint32_t top_k;           // Typically 2 experts routed per token
  uint32_t expert_ids[2];   // Which experts to activate
  float gates[2];           // Gating weights (sum ≈ 1.0)
  uint32_t auxiliary_loss;  // For training (inference: unused)
};

// Router: DeepSeek-V3-style sigmoid gate
// logits = (query @ W_router)
// top_k = argsort(sigmoid(logits), k=2)
// gates = softmax(logits[top_k])
```

## Inference pipeline (forward pass)

### Single-token mode

```
1. Tokenize input (BPE)
2. Embed tokens (token_emb)
3. For each of 80 layers:
   a. Self-attention (dense, uses KV-cache)
   b. If MoE layer (75 of 80):
      - Route query to top-2 experts (router logits)
      - Load routed experts from disk/cache (int4 → float)
      - Expert forward (FFN)
      - Aggregate via gating
   c. If dense layer (5 of 80):
      - Shared expert FFN
4. Normalize & project to logits (lm_head)
5. Sample next token (temperature, top-p)
6. Append to KV-cache, repeat
```

### Multi-token mode (MTP speculative decoding)

```
1. Main forward pass (as above)
2. **Parallel**: MTP head (layer 78, int8) also generates N draft tokens
3. **Verify batch**: Resample drafts in one batched forward
   - Input: [last_real_token] + [N draft_tokens]
   - Main model verifies in one forward (amortizes head cost)
4. **Accept/reject**: Greedy or rejection-sample
   - Accept: use drafts that match main model's top-1
   - Reject: discard mismatches, re-sample from main logits
5. Effective output: ~2.2–2.8 tokens per forward (on warm cache)
```

**Caveat**: On cold expert cache, verification may route extra experts (~660 → ~1100 per token), negating speedup until cache warms.

## Storage & caching

### Hierarchy

| Tier | Capacity | Latency | Notes |
|------|----------|---------|-------|
| L1 (LRU in-memory cache) | ~1–4 GB (configurable per layer) | <1 ms | Kept resident; fills/drains on expert access |
| L2 (OS page cache) | ~8–16 GB (system-wide) | 1–5 ms | Automatic; free layer managed by kernel |
| L3 (NVMe/SSD) | ~370 GB | 10–50 ms | Experts streamed on demand |
| L4 (HDD) | Optional slow tier | 100–200 ms | Thermal risk; not recommended for continuous inference |

### Expert streaming

**Per expert (int4 quantized):**
- Parameters: ~19 MB/expert (GLM-5.2 expert architecture)
- Load on-demand: triggered by router sending token to that expert
- LRU evict: oldest-unused expert leaves memory to make room

**Pinning (optional GPU):**
- Subset of frequently-routed experts can be pinned to GPU vRAM
- Reduces disk I/O for hot experts
- Trade-off: vRAM budget vs I/O savings

## Quantization

### Int4 (dense layers + experts)

```
Algorithm: Symmetric int4 (per-channel)
  1. Normalize weights to [-1, 1] range
  2. Scale to [-8, 7] (int4 range)
  3. Dequant on load: x_float = x_int4 * scale

Footprint: 4× smaller than FP32
Accuracy: <0.1% loss on greedy decoding (token-exact oracle validation)
```

### Int8 (MTP head only)

```
Why not int4 for MTP?
  - Draft acceptance collapses to 0–4% at int4
  - At int8: 39–59% acceptance, still lossless under sampling
  
Conversion: done by convert.py automatically
  - Detects MTP head (layer 78 only)
  - Quantizes to int8; saves separately
```

## API

### C API (glm.h)

```c
// Load model from directory
colibri_model *colibri_load(const char *model_dir, 
                             uint32_t ram_mb,
                             uint32_t cache_mb_per_layer,
                             int use_gpu);

// Create inference context
colibri_context *colibri_create_context(colibri_model *model, 
                                        uint32_t seq_len);

// Single forward
void colibri_forward(colibri_context *ctx, 
                     const uint32_t *tokens, uint32_t n_tokens);

// Decode next token
uint32_t colibri_sample(float *logits, uint32_t vocab_size,
                        float temperature, float top_p);

// Free resources
void colibri_free(colibri_context *ctx);
void colibri_free_model(colibri_model *model);

// Metadata
const char *colibri_version();
void colibri_print_stats(colibri_context *ctx);  // Cache hits/misses
```

### CLI (coli binary)

```bash
./coli chat                        # Interactive chat
./coli chat --prompt "Hello"       # One-shot
./coli convert --model /path/to/model
./coli plan                        # Show storage hierarchy
./coli plan --gpu 0,1 --ram 64 --vram 24 --json
```

### Environment variables

```bash
COLI_MODEL=/path/to/model         # Required for chat/plan
COLI_CACHE_SIZE_MB=2048           # Per-layer LRU cache (default: auto)
COLI_MTP=1                        # Enable MTP (default: auto-detect)
COLI_TEMPERATURE=0.9              # Sampling temperature
COLI_TOP_P=0.9                    # Nucleus sampling
COLI_GPU_DEVICE=0                 # CUDA device (if GPU build)
```

## Building & compiling

### Prerequisites

```bash
# Linux/macOS
sudo apt-get install build-essential libomp-dev  # Ubuntu/Debian
brew install llvm                                 # macOS

# Windows (WSL2 recommended)
# Use Ubuntu/Debian inside WSL; same as Linux
```

### Build steps

```bash
cd colibri/c
./setup.sh              # Runs: gcc -O3 -fopenmp glm.c -o coli

# Or manual
gcc -O3 -fopenmp -march=native glm.c -o coli -lm
```

### With GPU (CUDA)

```bash
# Requires CUDA Toolkit 11.8+
cd colibri/c
gcc -O3 -fopenmp glm.c -o coli -lm -L/usr/local/cuda/lib64 -lcuda
```

## Model download & conversion

### Option 1: Automatic (recommended)

```bash
./coli convert --model /nvme/glm52_i4
# Fetches GLM-5.2-FP8 shard by shard, converts to int4
# Converts MTP head to int8
# Total time: ~30–60 min
# Disk space needed: ~400 GB free during conversion
```

### Option 2: Pre-converted (faster)

```bash
# Option A: Hugging Face (jlnsrk, recommended)
wget https://huggingface.co/jlnsrk/GLM-5.2-colibri-int4/...
COLI_MODEL=./GLM-5.2-colibri-int4 ./coli chat

# Option B: Community (matey-0, if jlnsrk MTP is int4)
wget https://huggingface.co/mateogrgic/GLM-5.2-colibri-int4-with-int8-mtp/...
COLI_MODEL=./GLM-5.2-colibri-int4-with-int8-mtp ./coli chat
```

## Performance tuning

### Measure baseline

```bash
COLI_MODEL=/path/to/model ./coli plan
# Shows: estimated tokens/s, expert-load frequency, cache prediction

COLI_MODEL=/path/to/model ./coli chat --prompt "Hello" \
  | tail -5  # Prints timing stats
```

### Optimize LRU cache

```bash
# Default: auto-tuned to available free memory
# To increase (if RAM available):
export COLI_CACHE_SIZE_MB=4096
COLI_MODEL=/path/to/model ./coli chat

# Monitor:
./coli plan --cache 4096  # Predicts hit rate
```

### GPU pinning (if CUDA available)

```bash
# Pin top 64 experts to GPU (requires ~2 GB vRAM)
COLI_MODEL=/path/to/model ./coli chat --gpu 0 --vram 2
```

### Disable MTP (if cold-cache regression)

```bash
# Fall back to single-token mode (1.2 tok/s)
export COLI_MTP=0
COLI_MODEL=/path/to/model ./coli chat
```

## Common issues & debugging

### Expert loading hangs

**Symptom**: Inference starts, then freezes on first routed expert

**Cause**: NVMe/HDD too slow or file permissions

**Fix**:
```bash
# Check disk permissions
ls -l /path/to/model/experts/
# Should be readable by user

# Verify disk speed
dd if=/path/to/model/experts/expert_0.bin of=/dev/null bs=1M count=100
# Should show >100 MB/s for NVMe
```

### Low draft acceptance (<10% with MTP enabled)

**Cause**: MTP head still int4 (not converted to int8)

**Fix**:
```bash
# Rerun conversion
./coli convert --model /path/to/model --force-mtp-int8
# Then check file sizes in model/experts/:
# mtp_head.bin should be ~1.7 GB (int8, not ~2.7 GB int4)
```

### Out-of-memory crashes

**Cause**: RAM budget too small for dense layers

**Fix**:
```bash
# Check minimum requirement
./coli plan
# Shows: "minimum RAM required: 10.2 GB"

# If available, increase swap (temporary)
dd if=/dev/zero of=/swapfile bs=1G count=16
mkswap /swapfile && swapon /swapfile
```

## Testing & validation

### Self-tests (in setup.sh)

```bash
./setup.sh
# Runs: test_quantize, test_forward, test_mtp
# Validates: int4/int8 conversion, token-exact vs transformers oracle
```

### Benchmark (community)

```bash
./coli chat --prompt "test" --benchmark
# Outputs: tokens/s, cache hit%, expert-load count, memory profile
```

### Custom validation (Python)

```python
# Compare Colibri output vs HuggingFace transformers
import colibri_py  # Thin Python bindings (if available)
import torch

model_c = colibri_py.load('/path/to/model')
logits_c = model_c.forward([...tokens...])

# Compare with:
from transformers import AutoModelForCausalLM
model_hf = AutoModelForCausalLM.from_pretrained('THUDM/glm-medium')
logits_hf = model_hf([...same tokens...])

# MSE should be <0.01 for int4 quantization
```

## Security & resource limits

### Sandboxing

- **No network**: Colibri inference is purely local; no home-phoning
- **File I/O**: Only reads model directory; no random file access
- **Memory**: Bounded by RAM + cache settings; set `--ram 16` to cap at 16 GB
- **CPU**: Respects OpenMP thread count (`OMP_NUM_THREADS=4`)

### Disk thermal considerations

- Continuous inference at full disk I/O can heat cheap NVMe to 70–80 °C
- Monitor with `smartctl -a /dev/nvme0n1` (Linux)
- Intermittent inference workloads (chat, API calls) generally stay safe
- HDD strongly discouraged; SSD/NVMe only

### Rate limiting (for APIs)

- Colibri itself does not rate-limit; wrapper application must
- Typical: ~1.2–2.8 tokens/s; budget accordingly for concurrent users
