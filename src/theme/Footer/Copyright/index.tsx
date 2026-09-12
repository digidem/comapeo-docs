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
    const updateYear = () => {
      const currentYear = new Date().getFullYear().toString();
      setYear((prev) => (prev !== currentYear ? currentYear : prev));
    };

    updateYear();
    // Re-check periodically (hourly) so tabs left open across midnight roll over
    const interval = setInterval(updateYear, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Copyright {...props} copyright={formatCopyright(props.copyright, year)} />
  );
}
