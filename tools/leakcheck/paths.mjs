import os from "node:os";
import path from "node:path";

// The denylist and its source config live outside the repo, on the owner's
// machine only. Override with PROMPTEDCRE_DENYLIST / PROMPTEDCRE_DENYLIST_SOURCES.
export const LOCAL_DIR = path.join(os.homedir(), ".finn", "promptedcre");
export const DENYLIST = process.env.PROMPTEDCRE_DENYLIST ?? path.join(LOCAL_DIR, "denylist.txt");
export const SOURCES = process.env.PROMPTEDCRE_DENYLIST_SOURCES ?? path.join(LOCAL_DIR, "denylist-sources.json");
export const ALLOW = new URL("./allow.txt", import.meta.url);
