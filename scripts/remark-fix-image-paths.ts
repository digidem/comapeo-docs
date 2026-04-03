import { rewriteLocaleImagePlaceholderPath } from "./shared/localeImagePlaceholders";

// Remark plugin to rewrite doc-local image references to site-root paths
// and decode locale image placeholders back to canonical English assets.
export default function remarkFixImagePaths() {
  function transformNode(node: any): void {
    if (!node || typeof node !== "object") return;

    if (node.type === "image" && typeof node.url === "string") {
      node.url = rewriteLocaleImagePlaceholderPath(node.url);
    }

    if (node.type === "html" && typeof node.value === "string") {
      node.value = node.value.replace(
        /\bsrc=(["'])([^"']+)\1/g,
        (_full: string, quote: string, src: string) =>
          `src=${quote}${rewriteLocaleImagePlaceholderPath(src)}${quote}`
      );
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) transformNode(child);
    }
  }

  return (tree: any): void => {
    transformNode(tree);
  };
}
