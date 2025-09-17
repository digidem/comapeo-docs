// Lightweight rehype plugin to wrap standalone images in <figure> with an optional <figcaption>
// Applies when a paragraph contains a single <img> element.

function isElement(node: any, tag?: string): boolean {
  return node && node.type === 'element' && (!tag || node.tagName === tag);
}

export default function rehypeImageFigure() {
  return (tree: any) => {
    if (!tree || !('children' in tree)) return;

    const children = (tree as any).children;

    function transform(parent: any) {
      if (!parent.children) return;
      for (let i = 0; i < parent.children.length; i++) {
        const node = parent.children[i];
        if (isElement(node, 'p') && node.children && node.children.length === 1) {
          const only = node.children[0];
          if (isElement(only, 'img')) {
            const alt = (only.properties?.alt as string) || '';
            const figureChildren: any[] = [only];

            if (alt.trim().length > 0) {
              const captionText: any = { type: 'text', value: alt };
              const figcaption: any = {
                type: 'element',
                tagName: 'figcaption',
                properties: {},
                children: [captionText],
              };
              figureChildren.push(figcaption);
            }

            const figure: any = {
              type: 'element',
              tagName: 'figure',
              properties: {},
              children: figureChildren,
            };

            // Replace <p> with <figure>
            parent.children.splice(i, 1, figure);
          }
        }
        // Recurse into element children
        if ((node as any).children && Array.isArray((node as any).children)) {
          transform(node as any);
        }
      }
    }

    transform(tree as any);
  };
}
