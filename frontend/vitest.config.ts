import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: "next/image", replacement: fileURLToPath(new URL("./tests/next-image-mock.tsx", import.meta.url)) },
      { find: "next/link", replacement: fileURLToPath(new URL("./tests/next-link-mock.tsx", import.meta.url)) },
      { find: "next/navigation", replacement: fileURLToPath(new URL("./tests/next-navigation-mock.ts", import.meta.url)) },
      { find: "@", replacement: fileURLToPath(new URL("./", import.meta.url)) },
    ],
  },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environment: "jsdom",
    setupFiles: ["./tests/vitest.setup.ts"],
    css: true,
  },
});
