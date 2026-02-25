# Notion Block Types Reference

Block types found in the CoMapeo documentation database with usage patterns and structure.

## Content Blocks

### Text Content

- **paragraph** (882, 46.2%) - Primary content blocks with `rich_text` and `color`
- **heading_1** (157, 8.2%) - Main sections with `rich_text`, `is_toggleable`, `color`
- **heading_2** (103, 5.4%) - Subsections with `rich_text`, `is_toggleable`, `color`
- **heading_3** (28, 1.5%) - Minor headings with `rich_text`, `is_toggleable`, `color`

### Lists

- **bulleted_list_item** (175, 9.2%) - Unordered lists, can have children
- **numbered_list_item** (44, 2.3%) - Ordered lists, can have children

### Special Content

- **callout** (53, 2.8%) - Highlighted boxes with `rich_text`, `icon`, `color`
- **quote** (11, 0.6%) - Citations with `rich_text`, `color`

## Structural Blocks

### Organization

- **divider** (182, 9.5%) - Section separators, no properties
- **table_of_contents** (25, 1.3%) - Auto-generated navigation with `color`

### Data

- **table** (26, 1.4%) - Data containers with `table_width`, headers
- **table_row** (83, 4.3%) - Table data with `cells` array

## Media Blocks

- **image** (120, 6.3%) - Screenshots/diagrams with `caption`, `file` URL
- **video** (1, 0.1%) - Video content with `type`, `file`
- **embed** (4, 0.2%) - External content with `url`

## Legacy/Special

- **child_database** (1, 0.1%) - Nested database with `title`
- **unsupported** (9, 0.5%) - Legacy content, no standard properties

## Common Block Structure

All blocks share:

```json
{
  "type": "block_type",
  "hasContent": boolean,
  "contentLength": number,
  "textContent": "extracted text",
  "childrenCount": number,
  "metadata": {
    "id": "block-id",
    "createdTime": "timestamp",
    "lastEditedTime": "timestamp",
    "archived": false
  }
}
```

## Rich Text Structure

Text blocks use rich_text arrays:

```json
{
  "rich_text": [
    {
      "type": "text",
      "text": { "content": "text", "link": null },
      "annotations": {
        "bold": false,
        "italic": false,
        "strikethrough": false,
        "underline": false,
        "code": false,
        "color": "default"
      },
      "plain_text": "text",
      "href": null
    }
  ]
}
```

## Callout Structure (Issue #17)

Callouts have icon and color properties:

```json
{
  "type": "callout",
  "properties": {
    "rich_text": [...],
    "icon": {"type": "emoji", "emoji": "📋"},
    "color": "gray_background"
  }
}
```

Available callout colors:

- `default`, `gray_background`, `brown_background`
- `orange_background`, `yellow_background`, `green_background`
- `blue_background`, `purple_background`, `pink_background`, `red_background`
