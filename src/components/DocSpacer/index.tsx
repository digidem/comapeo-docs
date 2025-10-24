import React from "react";

type DocSpacerSize = "sm" | "md" | "lg";

const SIZE_TO_REM: Record<DocSpacerSize, string> = {
  sm: "0.5rem",
  md: "1rem",
  lg: "1.5rem",
};

export interface DocSpacerProps {
  size?: DocSpacerSize;
}

export default function DocSpacer({ size = "md" }: DocSpacerProps) {
  const height = SIZE_TO_REM[size] ?? SIZE_TO_REM.md;

  return (
    <div
      aria-hidden="true"
      role="presentation"
      style={{
        height,
        width: "100%",
        margin: 0,
      }}
    />
  );
}
