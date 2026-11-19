#!/usr/bin/env node
// The engine's local MCP server, installed: pcre-mcp --firm <folder> (or set PCRE_FIRM).
import { runTs } from "./run-ts.mjs";

runTs("cli/mcp.ts");
