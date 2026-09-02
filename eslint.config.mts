import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import prettierPlugin from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";
import { defineConfig } from "eslint/config";

export default defineConfig([
    { ignores: ["node_modules/**", "dist/**"] },
    {
        files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
        plugins: { js },
        extends: ["js/recommended"],
        languageOptions: {
            globals: { ...globals.node, ...globals.jest },
        },
    },
    tseslint.configs.recommended,
    prettierConfig,
    {
        files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
        plugins: { prettier: prettierPlugin },
        rules: {
            "prettier/prettier": "error",
            "no-unused-vars": "off",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    varsIgnorePattern: "^_",
                    argsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                },
            ],
        },
    },
]);
