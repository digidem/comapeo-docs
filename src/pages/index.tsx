import type { ReactNode } from "react";
import { Redirect } from "@docusaurus/router";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  const defaultDocsPage =
    (siteConfig.customFields?.defaultDocsPage as string) || "introduction";

  return <Redirect to={`/docs/${defaultDocsPage}`} />;
}
