import { describe, expect, it } from "vitest";
import remarkFixImagePaths from "./remark-fix-image-paths";
import {
  encodeLocaleImagePlaceholderPath,
  encodeRemoteImagePlaceholderPath,
} from "./shared/localeImagePlaceholders";

describe("remarkFixImagePaths", () => {
  it("rewrites markdown image nodes with locale placeholders back to canonical paths", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "image",
              url: encodeLocaleImagePlaceholderPath(
                "/images/screenshots/installing-comapeo.png"
              ),
              alt: "Translated alt",
            },
          ],
        },
      ],
    };

    remarkFixImagePaths()(tree);

    expect(tree.children[0].children[0].url).toBe(
      "/images/screenshots/installing-comapeo.png"
    );
  });

  it("rewrites raw html img src attributes with locale placeholders", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "html",
          value: `<img src="${encodeLocaleImagePlaceholderPath(
            "/images/screenshots/installing-comapeo.png"
          )}" alt="Translated alt" />`,
        },
      ],
    };

    remarkFixImagePaths()(tree);

    expect(tree.children[0].value).toContain(
      'src="/images/screenshots/installing-comapeo.png"'
    );
  });

  it("rewrites remote image placeholders back to original URLs", () => {
    const remoteImageUrl =
      "https://prod-files-secure.s3.us-west-2.amazonaws.com/xxx/image.png";
    const tree = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "image",
              url: encodeRemoteImagePlaceholderPath(remoteImageUrl),
              alt: "Translated alt",
            },
          ],
        },
        {
          type: "html",
          value: `<img src="${encodeRemoteImagePlaceholderPath(
            remoteImageUrl
          )}" alt="Translated alt" />`,
        },
      ],
    };

    remarkFixImagePaths()(tree);

    expect(tree.children[0].children[0].url).toBe(remoteImageUrl);
    expect(tree.children[1].value).toContain(`src="${remoteImageUrl}"`);
  });

  it("keeps legacy doc-relative image paths normalized", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "image",
          url: "images/screenshots/installing-comapeo.png",
        },
      ],
    };

    remarkFixImagePaths()(tree);

    expect(tree.children[0].url).toBe(
      "/images/screenshots/installing-comapeo.png"
    );
  });
});
