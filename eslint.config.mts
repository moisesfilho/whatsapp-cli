// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import unicorn from "eslint-plugin-unicorn";
import sonarjs from "eslint-plugin-sonarjs";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.ts"],
  })),
  {
    files: ["**/*.ts", "**/*.mts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      unicorn,
      sonarjs,
    },
    rules: {
      ...unicorn.configs.recommended.rules,
      ...sonarjs.configs.recommended.rules,
      "unicorn/name-replacements": "off",
      "unicorn/consistent-boolean-name": "off",
      "unicorn/prefer-top-level-await": "off",
      "unicorn/switch-case-braces": "off",
      "unicorn/no-null": "off",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/only-throw-error": "off",
    },
  },
]);
