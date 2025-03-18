import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import docusaurusPlugin from "@docusaurus/eslint-plugin";


/** @type {import('eslint').Linter.Config[]} */
export default [
  {files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"]},
  {languageOptions: { globals: globals.browser }},
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  {
    plugins: {
      '@docusaurus': docusaurusPlugin,
    },
    rules: {
      '@docusaurus/no-untranslated-text': [
        'warn',
        { ignoredStrings: ['·', '—', '×'] },
      ],
      '@docusaurus/string-literal-i18n-messages': 'warn',
      'react/react-in-jsx-scope': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];