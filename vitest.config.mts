import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    // Half the machine's cores, not all of them: with every file running at once a busy
    // laptop pushed a few tests past the 5 s limit, a failure that was only load (D232).
    maxWorkers: "50%",
    // The connector logs one line per tool call (CH08); the tests make hundreds of calls, so
    // those lines stay out of the test output. __tests__/call-log.test.ts reads them itself.
    onConsoleLog: (log) => (log.startsWith('{"event":"tool_call"') ? false : undefined),
  },
});
