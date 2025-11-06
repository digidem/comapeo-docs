#!/bin/bash
# Script to create GitHub labels for PR content generation strategy
# Run this once to set up the labels in the repository

set -e

echo "Creating GitHub labels for PR content generation..."

# Create fetch-all-pages label
gh label create "fetch-all-pages" \
  --color "0052CC" \
  --description "Fetch all pages from Notion for complete preview testing" \
  2>&1 || echo "✓ Label 'fetch-all-pages' already exists"

# Create fetch-10-pages label
gh label create "fetch-10-pages" \
  --color "0E8A16" \
  --description "Fetch 10 pages from Notion for broader preview testing" \
  2>&1 || echo "✓ Label 'fetch-10-pages' already exists"

# Create fetch-5-pages label
gh label create "fetch-5-pages" \
  --color "1D76DB" \
  --description "Fetch 5 pages from Notion for moderate preview testing" \
  2>&1 || echo "✓ Label 'fetch-5-pages' already exists"

echo ""
echo "✅ Label creation complete!"
echo ""
echo "Labels created:"
echo "  - fetch-all-pages (blue) - Fetch all pages (~8min)"
echo "  - fetch-10-pages (green) - Fetch 10 pages (~2min)"
echo "  - fetch-5-pages (blue) - Fetch 5 pages (~90s)"
echo ""
echo "Usage:"
echo "  gh pr edit <PR#> --add-label \"fetch-10-pages\""
