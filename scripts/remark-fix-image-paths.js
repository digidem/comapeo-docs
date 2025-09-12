// Minimal remark plugin to rewrite markdown image URLs
// from `images/...` (relative to doc) to `/images/...` (served from static)
// Also rewrites HTML <img src="images/..."> occurrences.

export default function remarkFixImagePaths() {
  function transformNode(node) {
    if (!node || typeof node !== 'object') return;

    // MDX/Markdown image nodes
    if (node.type === 'image' && typeof node.url === 'string') {
      if (node.url.startsWith('images/')) {
        node.url = `/${node.url}`;
      }
    }

    // Raw HTML nodes possibly containing <img>
    if (node.type === 'html' && typeof node.value === 'string') {
      node.value = node.value.replace(/src=(['"])images\//g, 'src=$1/images/');
    }

    // Recurse into children
    if (Array.isArray(node.children)) {
      for (const child of node.children) transformNode(child);
    }
  }

  return (tree) => {
    transformNode(tree);
  };
}

