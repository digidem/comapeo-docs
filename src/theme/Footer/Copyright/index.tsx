import React, { type ReactNode } from "react";
import Copyright from "@theme-original/Footer/Copyright";
import type CopyrightType from "@theme/Footer/Copyright";
import type { WrapperProps } from "@docusaurus/types";
import { formatCopyright } from "./formatCopyright";

type Props = WrapperProps<typeof CopyrightType>;

export default function CopyrightWrapper(props: Props): ReactNode {
  return <Copyright {...props} copyright={formatCopyright(props.copyright)} />;
}
