# Upstream Provenance: `AI-FanGe/A-MicroRobot-that-can-Rollerskate`

- **Repository**: <https://github.com/AI-FanGe/A-MicroRobot-that-can-Rollerskate>
- **Pinned Commit**: `f4de92baffe394cd82d5d7140f3a48c4ed7282d4` (`2026-11-27`)
- **License**: `GPL-3.0 (software) / CC-BY-SA-4.0 (hardware)`
- **Primary Interface**: `cli`

## Installation & Setup Channels

- Simulation setup: `pip install mujoco mjlab`
- Model inspection: load `hardware/` 3D STL/STEP and `mjlab_xiaoxiaobai/` MJCF files
- Policy runner: `python -m mjlab_xiaoxiaobai.eval --policy rollerskate`

## Key Architecture & Concepts

- **20-DOF Desktop Biped**: 30cm humanoid robot design equipped with high-precision micro-servos and skate-bearing feet.
- **MuJoCo Reinforcement Learning**: Train robust locomotion and dynamic rollerskating policies in simulated physics prior to zero-shot real-world transfer.
- **Physical AI Agent Loop**: Bridges edge-compute audio sensory input with LLM dialogue agents and motor actuation control.

## Boundaries & Cross-Routing

- Simulates physical robotics dynamics; real-world actuation requires hardware fabrication from the BOM.
- Route out: Pure software browser game agents -> `opengame`.
