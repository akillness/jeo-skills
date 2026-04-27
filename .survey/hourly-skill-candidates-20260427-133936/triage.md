# Triage
- Problem: Hourly survey loops can over-promote keyword matches that contain negated intent terms (e.g., repos stating "No CLI") and this weakens recommendation precision.
- Audience: Maintainers of akillness/oh-my-skills who operate unattended survey-to-PR maintenance cycles.
- Why now: Current run found a concrete false-positive pattern in the `cli open source skill` lane while all required lanes executed successfully; tightening the gate now reduces recurring review noise. (provenance: indexed snippet)
