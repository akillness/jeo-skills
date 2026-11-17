# MiniMind Architecture and MoE Engineering Reference

## 1. LMConfig Hyperparameter Schema

MiniMind defines its architecture through a unified `LMConfig` dataclass:

```python
from dataclasses import dataclass

@dataclass
class LMConfig:
    dim: int = 512              # Hidden embedding dimension
    n_layers: int = 8           # Number of Transformer layers
    n_heads: int = 8            # Query attention heads
    n_kv_heads: int = 8         # Key/Value heads (set < n_heads for GQA)
    vocab_size: int = 6400      # Vocabulary size
    hidden_dim: int = None      # Feedforward intermediate dim (defaults to 8/3 * dim)
    multiple_of: int = 64       # Alignment multiple for SwiGLU hidden dim
    norm_eps: float = 1e-5      # RMSNorm epsilon
    max_seq_len: int = 512      # Context length
    dropout: float = 0.0        # Dropout rate
    
    # MoE Parameters
    use_moe: bool = False       # Toggle Mixture of Experts
    num_experts_per_tok: int = 2# Top-k active experts per token
    n_routed_experts: int = 4   # Total pool of candidate experts
    n_shared_experts: int = 1   # Shared experts always active
```

### Standard Model Presets

| Model Preset | Hidden Dim | Layers | Heads | Seq Len | Vocab | Approx Params |
|---|---|---|---|---|---|---|
| **MiniMind-Small (26M)** | 512 | 8 | 8 | 512 | 6,400 | ~26M |
| **MiniMind (104M)** | 768 | 16 | 8 | 1024 | 6,400 | ~104M |
| **MiniMind-MoE (4x26M)** | 512 | 8 | 8 | 512 | 6,400 | ~45M (active: ~26M) |
| **MiniMind-MoE (8x26M)** | 512 | 8 | 8 | 512 | 6,400 | ~85M (active: ~26M) |

---

## 2. Transformer Building Blocks

The core architecture (`model/model.py`) is implemented in under 500 lines of standard PyTorch:

### Pre-Layer Normalization with RMSNorm
Avoids mean calculation overhead by normalizing solely against root-mean-square:
$$\text{RMSNorm}(x) = \frac{x}{\sqrt{\frac{1}{d} \sum_{i=1}^d x_i^2 + \epsilon}} \odot \gamma$$

### Rotary Position Embeddings (RoPE)
Encodes relative distance directly into query and key projections:
- Complex rotation applied to 2D paired feature slices.
- Enables length generalization beyond initial training sequence bounds.

### SwiGLU Feed-Forward Network
Gated activation replacing traditional ReLU or standard GELU:
$$\text{SwiGLU}(x) = (\text{Swish}(x W_1) \otimes x W_2) W_3$$

---

## 3. Mixture of Experts (MoE) Architecture

When `use_moe=True`, standard feed-forward layers are replaced by a gated expert router:

```
                  [Hidden State x]
                     /          \
              [Gating Network]  [Shared Expert]
                     |                  |
           Top-2 Expert Weights         |
                     |                  |
           [Routed Experts (4)]         |
                     \                  /
                    [Weighted Combination]
```

- **Top-k Routing:** For each token, the gating network calculates a softmax distribution over `n_routed_experts` and selects the top $k=2$ experts with normalized probabilities.
- **Shared Experts:** Tokens are concurrently passed through dedicated shared experts, ensuring broad common knowledge is retained across all tokens.
- **Load Balancing Loss:** An auxiliary coefficient (e.g. $\alpha=0.01$) penalizes uneven routing to prevent expert collapse during training.
