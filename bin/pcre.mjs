#!/usr/bin/env node
// The engine's command line, installed: pcre <group> <verb> [arguments] [--flags].
import { runTs } from "./run-ts.mjs";

runTs("cli/pcre.ts");
