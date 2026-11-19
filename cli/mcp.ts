// The local MCP server: every engine action as a tool, for one firm folder,
// over stdio. It runs on the operator's own machine; nothing leaves it.
//
//   npx tsx cli/mcp.ts --firm <folder>          (or set PCRE_FIRM)
//
// Claude Code:  claude mcp add pcre -- npx tsx <this repo>/cli/mcp.ts --firm <folder>
//
// Standard output carries the protocol and nothing else; anything for a person
// goes to standard error.
import path from "node:path";

async function main(): Promise<void> {
  const startCwd = process.cwd();
  const repoRoot = path.resolve(path.dirname(process.argv[1] ?? "."), "..");
  const flag = process.argv.indexOf("--firm");
  const firm = flag > 0 ? process.argv[flag + 1] : process.env.PCRE_FIRM;
  if (!firm) {
    console.error("usage: npx tsx cli/mcp.ts --firm <folder>   (or set PCRE_FIRM)");
    process.exit(2);
  }
  const firmDir = path.resolve(startCwd, firm);
  // The catalog is read relative to the working folder.
  process.chdir(repoRoot);
  const [{ McpServer }, { serveStdio }, local, { getCorpus }] = await Promise.all([
    import("@modelcontextprotocol/server"),
    import("@modelcontextprotocol/server/stdio"),
    import("../lib/engine/local"),
    import("../lib/content/load"),
  ]);
  const env = { firmDir, repoRoot, corpus: getCorpus() };

  serveStdio(
    () => {
      const server = new McpServer(local.LOCAL_SERVER, { instructions: local.LOCAL_INSTRUCTIONS });
      for (const tool of local.localTools()) {
        server.registerTool(
          tool.name,
          {
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: { readOnlyHint: tool.readOnly, destructiveHint: false, idempotentHint: tool.readOnly, openWorldHint: false },
          },
          async (args: unknown) => {
            const out = local.callLocal(env, tool.action, args as Record<string, unknown>);
            return { ...(out.ok ? {} : { isError: true as const }), content: [{ type: "text" as const, text: JSON.stringify(out) }] };
          },
        );
      }
      return server;
    },
    { onerror: (error) => console.error(`promptedcre-local: ${error.message}`) },
  );
}

void main();
