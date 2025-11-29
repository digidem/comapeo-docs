import React from "react";
import TOC from "@theme-original/TOC";
import type TOCType from "@theme/TOC";
import type { WrapperProps } from "@docusaurus/types";
import { translate } from "@docusaurus/Translate";

type Props = WrapperProps<typeof TOCType>;

export default function TOCWrapper(props: Props): JSX.Element {
  return (
    <div className="toc-wrapper">
      <h2 className="toc-heading">
        {translate({
          id: "theme.TOC.title",
          message: "On this page",
          description: "Title for the table of contents section",
        })}
      </h2>
      <TOC {...props} />
    </div>
  );
}
