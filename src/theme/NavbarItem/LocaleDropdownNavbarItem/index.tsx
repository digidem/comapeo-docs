import React, { type ReactNode } from "react";
import { useLocation } from "@docusaurus/router";
import {
  useActiveDocContext,
  useActivePluginAndVersion,
} from "@docusaurus/plugin-content-docs/client";
import { translate } from "@docusaurus/Translate";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import type { I18nLocaleConfig } from "@docusaurus/types";
import { useAlternatePageUtils } from "@docusaurus/theme-common/internal";
import {
  mergeSearchStrings,
  useHistorySelector,
} from "@docusaurus/theme-common";
import DropdownNavbarItem from "@theme/NavbarItem/DropdownNavbarItem";
import type { LinkLikeNavbarItemProps } from "@theme/NavbarItem";
import type { Props } from "@theme/NavbarItem/LocaleDropdownNavbarItem";
import IconLanguage from "@theme/Icon/Language";
import styles from "./styles.module.css";

type LocalizedDocKeysByLocale = Record<string, string[]>;

function useLocaleDropdownUtils() {
  const {
    siteConfig,
    i18n: { currentLocale, defaultLocale, localeConfigs },
  } = useDocusaurusContext();
  const alternatePageUtils = useAlternatePageUtils();
  const { activeDoc } = useActiveDocContext(undefined);
  const activePluginAndVersion = useActivePluginAndVersion();
  const { pathname } = useLocation();
  const search = useHistorySelector((history) => history.location.search);
  const hash = useHistorySelector((history) => history.location.hash);
  const activeVersion = activePluginAndVersion?.activeVersion;
  const defaultDocsPage =
    (siteConfig.customFields?.defaultDocsPage as string | undefined) ??
    "introduction";
  const localizedDocKeysByLocale =
    (siteConfig.customFields?.localizedDocKeysByLocale as
      | LocalizedDocKeysByLocale
      | undefined) ?? {};

  const getLocaleConfig = (locale: string): I18nLocaleConfig => {
    const localeConfig = localeConfigs[locale];
    if (!localeConfig) {
      throw new Error(
        `Docusaurus bug, no locale config found for locale=${locale}`
      );
    }
    return localeConfig;
  };

  const normalizeDocKey = (key: string): string =>
    key.replace(/(^\/|\/$)/g, "");

  const getDocPathKey = (path: string | undefined): string | undefined => {
    if (!path || !activeVersion) {
      return undefined;
    }

    const normalizedVersionPath = normalizeDocKey(activeVersion.path);
    const normalizedPath = normalizeDocKey(path);

    if (!normalizedVersionPath) {
      return normalizedPath;
    }

    if (!normalizedPath.startsWith(`${normalizedVersionPath}/`)) {
      return normalizedPath;
    }

    return normalizedPath.slice(normalizedVersionPath.length + 1);
  };

  const getBaseURLForLocale = (locale: string) => {
    const localeConfig = getLocaleConfig(locale);
    const isSameDomain = localeConfig.url === siteConfig.url;
    if (isSameDomain) {
      return `pathname://${alternatePageUtils.createUrl({
        locale,
        fullyQualified: false,
      })}`;
    }
    return alternatePageUtils.createUrl({
      locale,
      fullyQualified: true,
    });
  };

  const hasLocalizedDocKey = (locale: string, key: string): boolean => {
    return (
      localizedDocKeysByLocale[locale]?.includes(normalizeDocKey(key)) ?? false
    );
  };

  const getCurrentDocKeys = (): string[] =>
    Array.from(
      new Set(
        [
          activeDoc?.id,
          getDocPathKey(activeDoc?.path),
          getDocPathKey(pathname),
        ].filter((value): value is string => Boolean(value))
      )
    );

  const hasLocalizedRoute = (locale: string): boolean => {
    if (locale === defaultLocale) {
      return true;
    }

    const currentDocKeys = getCurrentDocKeys();
    if (currentDocKeys.length === 0) {
      return false;
    }

    // Auto-generated category index pages (e.g. /docs/category/foo) always
    // exist in every locale because Docusaurus generates them from whatever
    // docs are present. Use the alternate-page URL directly for these.
    if (currentDocKeys.some((key) => key.startsWith("category/"))) {
      return true;
    }

    return currentDocKeys.some((key) => hasLocalizedDocKey(locale, key));
  };

  const getDefaultDocsPagePathKey = (): string => {
    const normalizedDefaultDocsPage = normalizeDocKey(defaultDocsPage);

    const resolvedDefaultDocPath = activeVersion?.docs.find((doc) => {
      const pathKey = getDocPathKey(doc.path);

      return (
        normalizeDocKey(doc.id) === normalizedDefaultDocsPage ||
        pathKey === normalizedDefaultDocsPage
      );
    })?.path;

    return getDocPathKey(resolvedDefaultDocPath) ?? normalizedDefaultDocsPage;
  };

  const getLocalizedDocsLandingPage = (locale: string) => {
    const localeConfig = getLocaleConfig(locale);
    const docsBasePath = activeVersion?.path.split("/").pop() || "docs";
    const defaultDocsPagePathKey = getDefaultDocsPagePathKey();
    const hasLocalizedDefaultDocsPage = hasLocalizedDocKey(
      locale,
      defaultDocsPagePathKey
    );

    if (!hasLocalizedDefaultDocsPage) {
      return `pathname://${localeConfig.baseUrl}`;
    }

    const localizedPath =
      `${localeConfig.baseUrl}${docsBasePath}/${defaultDocsPagePathKey}`
        .replace(/\/{2,}/g, "/")
        .replace(/\/$/, "");

    return `pathname://${localizedPath}`;
  };

  return {
    getURL: (locale: string, options: { queryString: string | undefined }) => {
      const shouldFallbackToLocalizedHome =
        locale !== currentLocale &&
        Boolean(activeVersion) &&
        !hasLocalizedRoute(locale);
      const finalSearch = mergeSearchStrings(
        [
          shouldFallbackToLocalizedHome ? undefined : search,
          options.queryString,
        ],
        "append"
      );
      const finalHash = shouldFallbackToLocalizedHome ? "" : hash;
      const baseURL = shouldFallbackToLocalizedHome
        ? getLocalizedDocsLandingPage(locale)
        : getBaseURLForLocale(locale);

      return `${baseURL}${finalSearch}${finalHash}`;
    },
    getLabel: (locale: string) => getLocaleConfig(locale).label,
    getLang: (locale: string) => getLocaleConfig(locale).htmlLang,
  };
}

export default function LocaleDropdownNavbarItem({
  mobile,
  dropdownItemsBefore,
  dropdownItemsAfter,
  queryString,
  ...props
}: Props): ReactNode {
  const utils = useLocaleDropdownUtils();
  const {
    i18n: { currentLocale, locales },
  } = useDocusaurusContext();

  const localeItems = locales.map(
    (locale): LinkLikeNavbarItemProps => ({
      label: utils.getLabel(locale),
      lang: utils.getLang(locale),
      to: utils.getURL(locale, { queryString }),
      target: "_self",
      autoAddBaseUrl: false,
      className:
        locale === currentLocale
          ? mobile
            ? "menu__link--active"
            : "dropdown__link--active"
          : "",
    })
  );

  const items = [...dropdownItemsBefore, ...localeItems, ...dropdownItemsAfter];
  const dropdownLabel = mobile
    ? translate({
        message: "Languages",
        id: "theme.navbar.mobileLanguageDropdown.label",
        description: "The label for the mobile language switcher dropdown",
      })
    : utils.getLabel(currentLocale);

  return (
    <DropdownNavbarItem
      {...props}
      mobile={mobile}
      label={
        <>
          <IconLanguage className={styles.iconLanguage} />
          {dropdownLabel}
        </>
      }
      items={items}
    />
  );
}
