import { createMcpHandler } from "mcp-handler";
import { callScope, INSTRUCTIONS, logCall, registerTools, SERVER_INFO } from "@/lib/mcp/server";

// The MCP endpoint: streamable HTTP, read-only, no sign-in, stateless.
// It never receives a firm file. It logs one line per tool call, the tool and its outcome
// (lib/mcp/server.ts), and never a tool's arguments.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const handler = createMcpHandler((server) => registerTools(server), {
  serverInfo: SERVER_INFO,
  instructions: INSTRUCTIONS,
  verboseLogs: false,
  // no subscription streams; every request stands alone
  maxSubscriptions: 0,
});

// The tool a request calls, read from the method and the tool's name only, never its arguments.
async function calledTool(request: Request): Promise<string | null> {
  try {
    const body = (await request.clone().json()) as { method?: unknown; params?: { name?: unknown } };
    return body?.method === "tools/call" && typeof body.params?.name === "string" ? body.params.name : null;
  } catch {
    return null;
  }
}

// A POST answers one request and holds no stream open, so its reply is read in full before it
// goes back. Then a tool call whose handler never ran, because the protocol layer refused its
// input, still gets its one line, as an error (CH08).
async function POST(request: Request): Promise<Response> {
  const tool = await calledTool(request);
  const scope = { logged: false };
  const reply = await callScope.run(scope, async () => {
    const res = await handler(request);
    return new Response(await res.arrayBuffer(), { status: res.status, statusText: res.statusText, headers: res.headers });
  });
  if (tool && !scope.logged) logCall({ event: "tool_call", tool, outcome: "error" });
  return reply;
}

export { handler as DELETE, handler as GET, POST };
