import { fileURLToPath, URL } from "url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "@",
        replacement: fileURLToPath(new URL("./src", import.meta.url)),
      },
    ],
  },
  test: {
    setupFiles: ["./src/test/setup.ts"],
    // The sandbox's CPU detection can produce conflicting minThreads/maxThreads
    // bounds for the default forks pool ("options.minThreads and
    // options.maxThreads must not conflict"). Run a single fork so the suite
    // executes regardless of the reported core count.
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
