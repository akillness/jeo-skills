# Content Patterns Reference (kepano/obsidian-skills)

Patterns from the [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills) collection.

## Obsidian Markdown

### Links & Embeds
```markdown
[[Note Name]]              # wikilink
[[Note Name|Display text]] # aliased wikilink
[[Note Name#Heading]]      # heading anchor
![[Note Name]]             # embed note
![[image.png]]             # embed image
![[image.png|300]]         # embed with width
![[note.md#^blockid]]      # embed block reference
```

### Callouts
```markdown
> [!NOTE] Optional title
> Content here

> [!WARNING]
> This is a warning

> [!TIP] Collapsible tip
> Content here
```

Available types: `note`, `abstract`, `info`, `tip`, `success`, `question`,
`warning`, `failure`, `danger`, `bug`, `example`, `quote`

### Frontmatter
```yaml
---
title: My Note
tags: [project, active]
date: 2026-01-01
aliases: [alternate name]
cssclasses: [wide-page]
---
```

### Block References
```markdown
This is a paragraph with a block ID. ^my-block-id

![[Note Name#^my-block-id]]   # embed that specific block
[[Note Name#^my-block-id]]    # link to that block
```

## Obsidian Bases

Bases lets you query notes like a database using a code block:

```base
from: "Projects"
filter: status = "active"
sort: modified desc
group: priority
```

Common operators:
- `from: "folder"` — filter by folder path
- `filter: property = value` — filter by frontmatter property
- `filter: tag = "#tag"` — filter by tag
- `sort: property asc|desc` — sort results
- `group: property` — group results
- `limit: 10` — limit number of results

## JSON Canvas

JSON Canvas is an open format for visual knowledge graphs.

Structure:
```json
{
  "nodes": [
    {
      "id": "node1",
      "type": "text",
      "text": "My idea",
      "x": 0, "y": 0, "width": 200, "height": 100
    },
    {
      "id": "node2",
      "type": "file",
      "file": "Projects/Roadmap.md",
      "x": 300, "y": 0, "width": 200, "height": 100
    }
  ],
  "edges": [
    {
      "id": "edge1",
      "fromNode": "node1",
      "toNode": "node2",
      "label": "leads to"
    }
  ]
}
```

Node types: `text`, `file`, `link`, `group`

## Defuddle (Content Extraction)

Defuddle is a library for extracting clean content from web pages, used in Obsidian's web clipper.

```javascript
import Defuddle from 'defuddle';
const result = new Defuddle(document).parse();
// result.content — cleaned HTML
// result.title — page title
// result.author — author if found
// result.published — publication date
```
