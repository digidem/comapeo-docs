# Changelog - PR 170

## ✨ New Features

- **Slug Normalization**: Accented slugs are now normalized and locale-prefixed link references are supported.

## 🐛 Fixes

- **Doc Paths**: Flattened nested document paths.
- **Link Normalization**: Links inside code blocks and indented code fences are now properly skipped during link normalization.
- **Heading IDs**: Explicit heading IDs and empty filenames are handled correctly to prevent heading ID collisions.
- **Slug Generation**: Preserved CJK and Unicode letters in slug generation.
- **Code Fences**: Aligned code-fence regex with CommonMark standard.

## 🧪 Testing

- **Normalization**: Aligned tests with new normalization expectations.
