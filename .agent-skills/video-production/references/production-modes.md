# Production modes

Use this decision table before returning a packet.

| Mode | Choose when | Typical tools / stack | Main risk |
|------|-------------|-----------------------|-----------|
| Code-first programmable video | User explicitly wants Remotion, React-based composition, dynamic data injection, or product/app-integrated rendering | Remotion, React/TypeScript, render workers, componentized scenes | Over-engineering a one-off ask |
| Template/API automation | User needs speed, bulk output, localization, or personalized variants without owning a full rendering codebase | Shotstack, Creatomate, Bannerbear, CMS/automation integrations | Underestimating template or vendor constraints |
| Hybrid clip / repurposing pipeline | Source material is long-form media and the main task is extracting, captioning, resizing, and packaging clips at volume | Transcript/clip tools + template/render layer + social variants | Assuming clip selection and captions can be fully trusted without QA |
| Manual-finish hybrid | Automation is useful, but taste-heavy pacing, caption polish, or final approval still need a human pass | Generator + editor + QA/publish handoff | Pretending the last 20% can be ignored |

## Selection rules
1. Pick the mode that defines the **next artifact** most clearly.
2. If the stack is explicitly named, honor it unless it obviously conflicts with the goal.
3. If the request is broad and messy, prefer the mode that reduces ambiguity fastest.
4. If the scale is recurring or personalized, bias toward programmable/template workflows over manual-only flows.
5. If the user only needs polish, this skill may not be the right entry point.
