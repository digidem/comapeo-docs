import React, { type ReactNode, useEffect, useState } from "react";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Copyright from "@theme-original/Footer/Copyright";
import type CopyrightType from "@theme/Footer/Copyright";
import type { WrapperProps } from "@docusaurus/types";
import { formatCopyright } from "./formatCopyright";

type Props = WrapperProps<typeof CopyrightType>;

export default function CopyrightWrapper(props: Props): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  const buildYear =
    (siteConfig.customFields?.currentYear as string | undefined) ||
    new Date().getFullYear().toString();

  const [year, setYear] = useState(buildYear);

  useEffect(() => {
    const currentYear = new Date().getFullYear().toString();
    if (currentYear !== buildYear) {
      setYear(currentYear);
    }
  }, [buildYear]);

  return (
    <Copyright {...props} copyright={formatCopyright(props.copyright, year)} />
  );
}
