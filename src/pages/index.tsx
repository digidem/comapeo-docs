import type { ReactNode } from "react";
import clsx from "clsx";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import HomepageFeatures from "../components/HomepageFeatures";
import Heading from "@theme/Heading";
import { translate } from "@docusaurus/Translate";
import styles from "./index.module.css";

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  const defaultDocsPage =
    (siteConfig.customFields?.defaultDocsPage as string) || "introduction";

  return (
    <header className={clsx("hero hero--primary", styles.heroBanner)}>
      <div className="container">
        <img src="img/comapeo_logo.png" alt="CoMapeo Logo" />
        <Heading as="h1" className="hero__title">
          {translate({
            message: "Documentation",
            description: "Site title",
          })}
        </Heading>
        <p className="hero__subtitle">
          {translate({
            message: "Learn how to use the CoMapeo platform",
            description: "Text for the tagline of the webpage",
          })}
        </p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to={`/docs/${defaultDocsPage}`}
          >
            {translate({
              message: "Explore Documentation",
              description: "Button text for documentation link",
            })}
          </Link>
          <Link
            className="button button--success button--lg"
            href="https://wa.me/yourphonenumber"
            target="_blank"
            rel="noopener noreferrer"
          >
            {/* <i className="fa fa-whatsapp" style={{marginRight: '8px'}}></i> */}
            {translate({
              message: "WhatsApp Assistant",
              description: "Button text for WhatsApp support link",
            })}
          </Link>
          <Link
            className="button button--info button--lg"
            href="https://t.me/yourusername"
            target="_blank"
            rel="noopener noreferrer"
          >
            {/* <i className="fa fa-telegram" style={{marginRight: '8px'}}></i> */}
            {translate({
              message: "Telegram Assistant",
              description: "Button text for Telegram support link",
            })}
          </Link>
        </div>
      </div>
    </header>
  );
}
export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title}`}
      description="Description will go into a meta tag in <head />"
    >
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
