import type { ReactNode } from "react";
import { Redirect } from "@docusaurus/router";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import useBaseUrl from "@docusaurus/useBaseUrl";

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  const defaultDocsPage =
    (siteConfig.customFields?.defaultDocsPage as string) || "introduction";
  const docsUrl = useBaseUrl(`/docs/${defaultDocsPage}`);

  return <Redirect to={docsUrl} />;
}
