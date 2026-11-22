"""Strict Mustache rendering for overlay payloads.

chevron substitutes an empty string for a missing key; overlay text must be
verbatim, so a template whose top-level {{var}} references an undefined
variable is an error, not silent blank output. The template is pre-scanned
and MissingVariableError raised before chevron sees it. Names inside a
section ({{#x}}...{{/x}}) are not pre-checked: they resolve against the
section's own context per Mustache scoping, and a name missing there still
renders empty.

{{var}} HTML-escapes its value; {{{var}}} inserts it raw.

Requires chevron (pip install chevron).
"""

import re

import chevron


class MissingVariableError(ValueError):
    """Raised when a {{var}} reference has no matching key in the variables."""


# Captures Mustache tags. Group 1 is the sigil (#, ^, /, !, >, &, =, or
# empty), group 2 is the tag body. Tags with sigil in {"", "&"} (or "{")
# are variable references; everything else is structural and skipped.
_TAG_RE = re.compile(r"\{\{\{?\s*([#^/!>&=]?)\s*([^}]*?)\s*\}?\}\}")


def _referenced_variable_names(template):
    """Return the top-level variable names the template depends on.

    Sections (#, ^, /), comments (!), partials (>), and set-delimiter (=)
    tags are structural. Variables inside a section resolve against the
    section's own context, so only names outside any section count, and a
    dotted path contributes its root name (stats.atk -> stats).
    """
    names = set()
    section_depth = 0
    for sigil, raw_body in _TAG_RE.findall(template):
        tag_body = raw_body.strip()
        if sigil in {"#", "^"}:
            section_depth += 1
            continue
        if sigil == "/":
            section_depth = max(0, section_depth - 1)
            continue
        if sigil in {"!", ">", "="}:
            continue
        if not tag_body:
            continue
        if section_depth == 0:
            names.add(tag_body.split(".", 1)[0])
    return names


def variables_to_dict(variables):
    """Collapse [{"key": ..., "value": ...}, ...] into a dict.

    Raises ValueError when two entries share the same key: silently keeping
    either value would render the wrong text.
    """
    out = {}
    for entry in variables:
        key = entry["key"]
        if key in out:
            raise ValueError(f"duplicate variable key: {key!r}")
        out[key] = entry["value"]
    return out


def render_strict(template, variables):
    """Render the template, raising on any missing variable.

    Sections may bind to lists of dicts (chevron handles iteration).
    """
    referenced = _referenced_variable_names(template)
    missing = sorted(name for name in referenced if name not in variables)
    if missing:
        raise MissingVariableError(
            f"template references undefined variable(s): {', '.join(missing)}"
        )
    return chevron.render(template, variables)
