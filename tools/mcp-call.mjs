// A tiny MCP client on the official SDK, for smoke tests and for agents with no
// MCP support of their own.
//   node tools/mcp-call.mjs <server-url> list
//   node tools/mcp-call.mjs <server-url> call <tool> ['<json arguments>']
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const [url, command, tool, rawArgs] = process.argv.slice(2);
if (!url || !["list", "call"].includes(command ?? "") || (command === "call" && !tool)) {
  console.error("usage: node tools/mcp-call.mjs <server-url> list | call <tool> ['<json arguments>']");
  process.exit(2);
}

const client = new Client({ name: "promptedcre-mcp-call", version: "0.1.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(url)));
try {
  if (command === "list") {
    const info = client.getServerVersion();
    console.log(`server ${info?.name} ${info?.version}`);
    const instructions = client.getInstructions();
    if (instructions) console.log(`instructions: ${instructions}`);
    const { tools } = await client.listTools();
    for (const t of tools) console.log(`\n${t.name}: ${t.description}\n  input: ${JSON.stringify(t.inputSchema)}`);
  } else {
    const result = await client.callTool({ name: tool, arguments: rawArgs ? JSON.parse(rawArgs) : {} });
    if (result.isError) console.error("TOOL ERROR");
    for (const c of result.content ?? []) if (c.type === "text") console.log(c.text);
    process.exitCode = result.isError ? 1 : 0;
  }
} finally {
  await client.close();
}
