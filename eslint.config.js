import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist/", "src-tauri/", "release/", "src/remotion/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    rules: {
      // `any` appears at the Tauri IPC boundary where payloads are untyped;
      // banning it there produces casts, not safety.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      // Baseline for a pre-existing codebase: the opinionated rules new in
      // react-hooks v7 flag established, working patterns here (mount-fetch
      // effects, latest-ref reads). Warnings keep them visible for new code
      // without forcing behavior-risky rewrites; tighten to "error" per rule
      // as the flagged sites get refactored.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
);
