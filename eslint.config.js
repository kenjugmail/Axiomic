import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.vite/**",
      "**/drizzle/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/*.db",
      "**/*.db-*",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        fetch: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        Request: "readonly",
        Response: "readonly",
        Headers: "readonly",
        ReadableStream: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        crypto: "readonly",
        AbortController: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-console": "off",
    },
  },
  {
    files: ["apps/web/**/*.tsx", "apps/web/**/*.ts", "packages/viz/**/*.tsx", "packages/viz/**/*.ts"],
    plugins: {
      react,
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    languageOptions: {
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        HTMLElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLTextAreaElement: "readonly",
        HTMLDivElement: "readonly",
        SVGSVGElement: "readonly",
        EventSource: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: "detect" },
    },
    // Sprint 66c shipped a 7-rule "warn" subset of jsx-a11y. Sprint 68c
    // extends that to the plugin's full `flatConfigs.recommended` rule
    // set so additional checks (label-has-associated-control,
    // click-events-have-key-events, no-static-element-interactions,
    // tab-index, etc.) catch violations at lint time before they ship.
    rules: {
      ...(jsxA11y.flatConfigs?.recommended?.rules ?? {}),
      "react/jsx-uses-react": "off",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Keep the recommended set at "warn" rather than "error" so the
      // baseline can land alongside ongoing development; tighten to
      // "error" once each rule's existing violations are triaged.
      "jsx-a11y/alt-text": "warn",
      "jsx-a11y/anchor-is-valid": "warn",
      "jsx-a11y/aria-props": "warn",
      "jsx-a11y/aria-proptypes": "warn",
      "jsx-a11y/aria-unsupported-elements": "warn",
      "jsx-a11y/role-has-required-aria-props": "warn",
      "jsx-a11y/role-supports-aria-props": "warn",
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/label-has-associated-control": "warn",
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
      "jsx-a11y/interactive-supports-focus": "warn",
      // Override remaining recommended-default-error rules to "warn"
      // pending triage. autoFocus is widely used for legitimate UX
      // (modal-on-open, single-input dialogs); media-has-caption needs
      // real captions; no-redundant-roles is one-line edits.
      "jsx-a11y/no-autofocus": "warn",
      "jsx-a11y/no-redundant-roles": "warn",
      "jsx-a11y/media-has-caption": "warn",
    },
  },
];
