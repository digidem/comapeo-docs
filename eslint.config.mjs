import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import docusaurusPlugin from "@docusaurus/eslint-plugin";
import importPlugin from "eslint-plugin-import";
import promisePlugin from "eslint-plugin-promise";
import securityPlugin from "eslint-plugin-security";
import prettierPlugin from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";

/** @type {import('eslint').Linter.FlatConfig[]} */
const eslintConfig = [
  // Global configurations for all files
  {
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      ...prettierConfig.rules,
      "prettier/prettier": "warn",
    },
  },

  // Docusaurus specific configurations
  {
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    ignores: ["scripts/**", "api-server/**"], // Ignore scripts and api-server directories for docusaurus rules
    plugins: {
      "@docusaurus": docusaurusPlugin,
      react: pluginReact,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      ...pluginReact.configs.flat.recommended.rules,
      ...docusaurusPlugin.configs.recommended.rules,
      "@docusaurus/no-untranslated-text": [
        "warn",
        { ignoredStrings: ["·", "—", "×"] },
      ],
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
    },
  },

  // TypeScript configurations
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  // Scripts and API server specific configurations
  {
    files: ["scripts/**/*.{js,mjs,cjs,ts}", "api-server/**/*.{js,mjs,cjs,ts}"],
    plugins: {
      import: importPlugin,
      promise: promisePlugin,
      security: securityPlugin,
    },
    settings: {
      "import/resolver": {
        typescript: true,
        node: true,
      },
    },
    rules: {
      ...importPlugin.configs.recommended.rules,
      ...promisePlugin.configs.recommended.rules,
      ...securityPlugin.configs.recommended.rules,
      // Test utilities intentionally use dynamic file paths
      "security/detect-non-literal-fs-filename": "off",
    },
  },

  // Notion API scripts use controlled dynamic property access (not user input)
  {
    files: ["scripts/notion-fetch/generateBlocks.ts"],
    rules: {
      "security/detect-object-injection": "off",
    },
  },
];

export default eslintConfig;
