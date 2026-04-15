# Platform Map: presentation-builder modernization

## Settings
| Concern | Google Slides | PowerPoint | HTML-slide systems | Common Layer |
|---------|---------------|------------|--------------------|--------------|
| Template / theme | Themes and layouts | Templates and Slide Master | Theme packages, CSS, frontmatter, config | `theme/template` |
| Layout options | Browser layouts, notes, page setup | Master layouts, theme variants, notes | Layout components, frontmatter, reusable sections | `layout` |
| Export target | Slides, PDF, PPTX export/import | PPTX, PDF, video, sharing | HTML, PDF, sometimes PPTX | `export_target` |
| Collaboration target | Browser comments and sharing | Enterprise review / office workflows | Git / preview / browser demo sharing | `editability_target` |
| Content metadata | Speaker notes, comments, Drive metadata | Notes, comments, file metadata | Frontmatter, source files, structured content blocks | `deck_metadata` |

## Rules
| Concern | Google Slides / browser workflows | PowerPoint / office workflows | HTML / markdown workflows | Common Layer |
|---------|-----------------------------------|-------------------------------|---------------------------|--------------|
| Brand consistency | Soft constraints via themes/layouts | Stronger via templates/master slides | Strong via theme packages and generator logic | `brand_rules` |
| Slide density | Usually manual review | Usually manual review | Can be encoded in generators/checks | `composition_rules` |
| Required sections | Manual template discipline | Manual template discipline | Template/generator enforcement possible | `structure_rules` |
| Approval state | Comments and version history | Comments, coauthoring, share/review | Git review + preview approval | `approval_rules` |
| Accessibility / formatting | Mostly reviewer discipline | Mostly reviewer discipline | Can be linted or templated | `quality_rules` |

## Hooks
| Lifecycle | Google Slides | PowerPoint | HTML-slide systems | Common Layer |
|-----------|---------------|------------|--------------------|--------------|
| Pre-generation | Import outline/assets, template selection | Template/open existing deck | Load source files, theme, assets | `load_outline`, `load_assets`, `load_theme` |
| Generation | Manual or API-assisted creation | Manual or automation-assisted creation | Deterministic source-to-slide generation | `build_slides` |
| Review | Share comments and live browser edits | Share review comments / office edits | Browser preview / git review / live editor | `request_review`, `visual_review` |
| Export | PDF / PPTX / link sharing | PDF / PPTX / video | HTML / PDF / PPTX | `export_artifact` |
| Post-run | Store in Drive / share link | SharePoint / file handoff | Commit source / publish static viewer | `publish`, `archive`, `handoff` |

## Platform Gaps
- There is no clean round-trip path that preserves deterministic source structure after unrestricted human edits in office tools.
- Brand packs and templates are not portable between Slides, PowerPoint, and HTML/CSS slide systems.
- Review comments usually live in office/browser ecosystems while reproducible source often lives in Markdown/HTML.
- A neutral deck schema plus explicit settings/rules/hooks is the cleanest abstraction layer for the skill.
