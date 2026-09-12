import React, { type ReactNode } from "react";
import Admonition from "@theme-original/Admonition";
import type AdmonitionType from "@theme/Admonition";
import type { WrapperProps } from "@docusaurus/types";
import { splitLeadingEmoji } from "../../utils/admonitionEmoji";

type Props = WrapperProps<typeof AdmonitionType>;

export default function AdmonitionWrapper(props: Props): ReactNode {
  const { title, ...rest } = props;

  if (typeof title === "string") {
    const { emoji, remainder } = splitLeadingEmoji(title);
    if (emoji) {
      if (remainder) {
        return (
          <Admonition
            {...rest}
            title={remainder}
            icon={<span className="admonition-emoji-icon">{emoji}</span>}
          />
        );
      }
      // Emoji-only title (e.g. :::note 👣): emoji IS the title; suppress default SVG icon
      return <Admonition {...rest} title={emoji} icon={null} />;
    }
  }

  return <Admonition {...props} />;
}
