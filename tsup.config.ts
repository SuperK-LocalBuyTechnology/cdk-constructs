import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.ts"],
    dts: true,
    sourcemap: false,
    clean: true,
});
