# Upstream reference

## Provenance

- Repository: https://github.com/RobThePCGuy/Underworld-Overseer-Save-Mapper
- Inspected commit: `5f83b078682d86624941fa451641b01a632455fb`
- Inspected commit date: 2025-01-29
- Project status in README: beta

## Observed implementation

The repository contains `main.py` and `template.html`. `main.py`:

1. looks for JSON saves under `~/AppData/LocalLow/MyronSoftware/UnderworldOverseer/Saves`;
2. reads the top-level `Map` list;
3. constructs a pandas DataFrame requiring `X`, `Y`, and `DescriptorID`;
4. indexes map cells by `(Y, X)`;
5. renders a grid and descriptor legend into `template.html`;
6. writes `<save-stem>.html` next to the script or executable.

The output includes legend color controls, descriptor search/highlight, zoom/pan, and light/dark themes. The current main loop is interactive. Although it offers a custom-file choice after listing saves, it exits when the default save directory itself does not exist.

## Dependencies

The implementation imports Python 3 standard-library modules plus `pandas` and `matplotlib`. `pathlib` is part of Python; do not install the unrelated PyPI package. The README mentions PyInstaller for executable packaging but it is not required to run from source.

## Data and safety notes

- Treat save files and generated HTML as private gameplay data.
- The mapper is read-only with respect to the selected JSON, but always use a copy.
- Duplicate coordinates are ambiguous because a dictionary lookup retains only one cell for each `(Y, X)` pair.
- Custom colors and labels are constants in `main.py` at the inspected revision.

## License caveat

The README displays an MIT badge and says the project is MIT-licensed, but the inspected commit has no root `LICENSE` file even though the README links to one. This skill contains original guidance and validators rather than copied upstream code. Review the upstream repository's current license state before redistributing its code or binaries.
