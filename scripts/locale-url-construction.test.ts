/**
 * Unit tests for locale URL construction logic in LocaleDropdownNavbarItem
 * Tests the manual URL construction that replaced useAlternatePageUtils
 */

import { describe, it, expect } from "vitest";

type LocaleConfig = {
  baseUrl: string;
  url: string;
};

type SiteConfig = {
  url: string;
};

/**
 * Extracted URL construction logic from getBaseURLForLocale
 * This is the core logic we're testing
 */
function constructLocaleURL(
  pathname: string,
  currentLocale: string,
  targetLocale: string,
  localeConfigs: Record<string, LocaleConfig>,
  siteConfig: SiteConfig
): string {
  // eslint-disable-next-line security/detect-object-injection
  const currentLocaleConfig = localeConfigs[currentLocale];
  // eslint-disable-next-line security/detect-object-injection
  const targetLocaleConfig = localeConfigs[targetLocale];
  const isSameDomain = targetLocaleConfig.url === siteConfig.url;

  // Strip the current locale's baseUrl from pathname to get the raw path suffix
  const currentLocaleBaseUrl = currentLocaleConfig.baseUrl;
  const pathSuffix = pathname.startsWith(currentLocaleBaseUrl)
    ? pathname.slice(currentLocaleBaseUrl.length)
    : pathname.replace(/^\//, "");

  if (isSameDomain) {
    const fullPath = `${targetLocaleConfig.baseUrl}${pathSuffix}`.replace(
      /\/{2,}/g,
      "/"
    );
    return `pathname://${fullPath}`;
  }
  const fullPath =
    `${targetLocaleConfig.url}${targetLocaleConfig.baseUrl}${pathSuffix}`.replace(
      /\/{2,}/g,
      "/"
    );
  return fullPath;
}

describe("LocaleDropdownNavbarItem URL Construction", () => {
  const localeConfigs: Record<string, LocaleConfig> = {
    en: {
      baseUrl: "/",
      url: "https://docs.comapeo.app",
    },
    pt: {
      baseUrl: "/pt/",
      url: "https://docs.comapeo.app",
    },
    es: {
      baseUrl: "/es/",
      url: "https://docs.comapeo.app",
    },
  };

  const siteConfig: SiteConfig = {
    url: "https://docs.comapeo.app",
  };

  describe("from English (default locale)", () => {
    it("should construct correct URL to Portuguese", () => {
      const result = constructLocaleURL(
        "/docs/introduction",
        "en",
        "pt",
        localeConfigs,
        siteConfig
      );
      expect(result).toBe("pathname:///pt/docs/introduction");
    });

    it("should construct correct URL to Spanish", () => {
      const result = constructLocaleURL(
        "/docs/introduction",
        "en",
        "es",
        localeConfigs,
        siteConfig
      );
      expect(result).toBe("pathname:///es/docs/introduction");
    });

    it("should handle home page", () => {
      const result = constructLocaleURL(
        "/",
        "en",
        "pt",
        localeConfigs,
        siteConfig
      );
      expect(result).toBe("pathname:///pt/");
    });

    it("should handle category pages", () => {
      const result = constructLocaleURL(
        "/docs/category/getting-started",
        "en",
        "pt",
        localeConfigs,
        siteConfig
      );
      expect(result).toBe("pathname:///pt/docs/category/getting-started");
    });
  });

  describe("from Portuguese locale", () => {
    it("should construct correct URL to Spanish", () => {
      const result = constructLocaleURL(
        "/pt/docs/introduction",
        "pt",
        "es",
        localeConfigs,
        siteConfig
      );
      expect(result).toBe("pathname:///es/docs/introduction");
    });

    it("should construct correct URL back to English", () => {
      const result = constructLocaleURL(
        "/pt/docs/introduction",
        "pt",
        "en",
        localeConfigs,
        siteConfig
      );
      expect(result).toBe("pathname:///docs/introduction");
    });

    it("should handle Portuguese home page", () => {
      const result = constructLocaleURL(
        "/pt/",
        "pt",
        "es",
        localeConfigs,
        siteConfig
      );
      expect(result).toBe("pathname:///es/");
    });

    it("should handle Portuguese category pages", () => {
      const result = constructLocaleURL(
        "/pt/docs/category/getting-started",
        "pt",
        "es",
        localeConfigs,
        siteConfig
      );
      expect(result).toBe("pathname:///es/docs/category/getting-started");
    });
  });

  describe("from Spanish locale", () => {
    it("should construct correct URL to Portuguese", () => {
      const result = constructLocaleURL(
        "/es/docs/introduction",
        "es",
        "pt",
        localeConfigs,
        siteConfig
      );
      expect(result).toBe("pathname:///pt/docs/introduction");
    });

    it("should construct correct URL back to English", () => {
      const result = constructLocaleURL(
        "/es/docs/introduction",
        "es",
        "en",
        localeConfigs,
        siteConfig
      );
      expect(result).toBe("pathname:///docs/introduction");
    });

    it("should handle Spanish home page", () => {
      const result = constructLocaleURL(
        "/es/",
        "es",
        "en",
        localeConfigs,
        siteConfig
      );
      expect(result).toBe("pathname:///");
    });
  });

  describe("edge cases", () => {
    it("should handle pathname without current locale prefix (fallback)", () => {
      // If pathname doesn't start with currentLocaleBaseUrl, strip leading slash
      const result = constructLocaleURL(
        "/unexpected-path",
        "es",
        "pt",
        localeConfigs,
        siteConfig
      );
      // Falls back to: pathSuffix = "unexpected-path"
      expect(result).toBe("pathname:///pt/unexpected-path");
    });

    it("should deduplicate multiple slashes", () => {
      // Even if there's a double-slash bug in input, it should be cleaned
      const result = constructLocaleURL(
        "/pt//docs/introduction",
        "pt",
        "es",
        localeConfigs,
        siteConfig
      );
      // pathSuffix = "/docs/introduction", fullPath = "/es//docs/introduction" → cleaned to "/es/docs/introduction"
      expect(result).toBe("pathname:///es/docs/introduction");
    });

    it("should handle trailing slashes", () => {
      const result = constructLocaleURL(
        "/pt/docs/introduction/",
        "pt",
        "es",
        localeConfigs,
        siteConfig
      );
      expect(result).toBe("pathname:///es/docs/introduction/");
    });
  });

  describe("staging environment (BASE_URL=/preview/)", () => {
    const stagingLocaleConfigs: Record<string, LocaleConfig> = {
      en: {
        baseUrl: "/preview/",
        url: "https://staging.comapeo.app",
      },
      pt: {
        baseUrl: "/preview/pt/",
        url: "https://staging.comapeo.app",
      },
      es: {
        baseUrl: "/preview/es/",
        url: "https://staging.comapeo.app",
      },
    };

    const stagingSiteConfig: SiteConfig = {
      url: "https://staging.comapeo.app",
    };

    it("should handle BASE_URL prefix in production-like staging", () => {
      const result = constructLocaleURL(
        "/preview/es/docs/introduction",
        "es",
        "pt",
        stagingLocaleConfigs,
        stagingSiteConfig
      );
      expect(result).toBe("pathname:///preview/pt/docs/introduction");
    });

    it("should handle staging English to Portuguese", () => {
      const result = constructLocaleURL(
        "/preview/docs/introduction",
        "en",
        "pt",
        stagingLocaleConfigs,
        stagingSiteConfig
      );
      expect(result).toBe("pathname:///preview/pt/docs/introduction");
    });
  });
});
