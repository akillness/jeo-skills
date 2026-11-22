"""Turn one rigged 3D asset, with or without animation, into a UniMate asset.

An asset directory holds what sampling and mesh driving need about a skeleton:
its stage-4 cond (``cond.npy``), its canonical rest-pose GLB, a preview and a
summary. ``pipeline.preprocess`` (the entry point; CLI in ``cli``) chains
``export`` (stage 1), ``annotate`` (stage 3), stage 4 and the canonical bake
for one asset, reusing the dataset pipeline's own code; ``profiles`` holds the
per-dataset settings, ``verify`` compares an output with the dataset's copy,
``evaluate`` scores rule annotation. User guide: ``README.md``; maintainer
guide: ``AGENTS.md``.
"""
