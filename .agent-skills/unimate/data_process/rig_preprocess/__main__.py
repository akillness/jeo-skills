"""``python -m data_process.rig_preprocess`` -> :mod:`data_process.rig_preprocess.cli`."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from data_process.rig_preprocess.cli import main  # noqa: E402

sys.exit(main())
