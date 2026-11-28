---
name: rollerskate-robot
description: >
  Inspect, simulate, and control AI-FanGe/A-MicroRobot-that-can-Rollerskate (Xiaoxiaobai), an open-source 30cm desktop humanoid robot featuring 20 degrees of freedom, reinforcement learning locomotion/rollerskating policies in MuJoCo, and multimodal LLM voice interactions. Use when training or running locomotion neural network policies, simulating robot dynamics in MuJoCo mjlab, analyzing hardware BOM and 3D printing specs, or programming ESP32 and edge-compute LLM sensory loops. Do not use for purely simulated game agents (route to opengame) or industrial multi-axis robotic arms. Triggers on: rollerskate robot, xiaoxiaobai, micro desktop robot, mujoco locomotion rl, humanoid robot llm, AI-FanGe.
allowed-tools: Read Glob Grep Bash
compatibility: Python 3.10+, MuJoCo simulator (mjlab), ESP32 / Jetson/Pi hardware BOM. Preflight runs offline in Python 3.10+.
license: GPL-3.0 (software) / CC-BY-SA-4.0 (hardware)
metadata:
  version: "1.0.0"
  source: https://github.com/AI-FanGe/A-MicroRobot-that-can-Rollerskate
  upstream_commit: f4de92baffe394cd82d5d7140f3a48c4ed7282d4
  pinned_at: "2026-11-27"
---
# Xiaoxiaobai Rollerskate Robot (`AI-FanGe/A-MicroRobot-that-can-Rollerskate`)

Source-pinned operator guide for `AI-FanGe/A-MicroRobot-that-can-Rollerskate` (GPL-3.0 (software) / CC-BY-SA-4.0 (hardware)), providing verified instructions and offline preflight validation.

## When to use this skill

- Simulate and control Xiaoxiaobai, an open-source 30cm 20-DOF humanoid robot with MuJoCo RL rollerskating policies and LLM interactions.
- For complete trigger patterns: rollerskate-robot, xiaoxiaobai, humanoid-robot, mujoco, reinforcement-learning, esp32, physical-agent.
- Cross-routing boundaries: route out to `agent-frameworks`, `orchestration`, `experimentation` where appropriate.

## Instructions

1. **Run offline preflight first** to confirm tool availability and pinned file integrity:
   ```bash
   python3 scripts/preflight.py --json
   ```

2. **Verify installation channels & environment prerequisites**:
   - Simulation setup: `pip install mujoco mjlab`
   - Model inspection: load `hardware/` 3D STL/STEP and `mjlab_xiaoxiaobai/` MJCF files
   - Policy runner: `python -m mjlab_xiaoxiaobai.eval --policy rollerskate`

3. **Execute verified workflows & operations**:
   - **20-DOF Desktop Biped**: 30cm humanoid robot design equipped with high-precision micro-servos and skate-bearing feet.
   - **MuJoCo Reinforcement Learning**: Train robust locomotion and dynamic rollerskating policies in simulated physics prior to zero-shot real-world transfer.
   - **Physical AI Agent Loop**: Bridges edge-compute audio sensory input with LLM dialogue agents and motor actuation control.

4. **Gate sensitive mutating operations & respect boundaries**:
   - Simulates physical robotics dynamics; real-world actuation requires hardware fabrication from the BOM.
   - Route out: Pure software browser game agents -> `opengame`.

## References

- Pinned upstream summary and concepts: [references/upstream.md](references/upstream.md)
- Pinned source provenance and file digests: [references/source.json](references/source.json)
- Offline manifest preflight helper: [scripts/preflight.py](scripts/preflight.py)
- Eval suite: [evals/evals.json](evals/evals.json)
