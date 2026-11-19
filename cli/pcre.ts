// The PromptedCRE command line:
//
//   npx tsx cli/pcre.ts <group> <verb> [arguments] [--flags]      (or pcre.cmd)
//
// The commands, flags and exit codes are in cli/run.ts. This entry runs from
// any folder: it moves to the repository first, because the catalog is read
// relative to the working folder, then hands the command to runCli.
import path from "node:path";

async function main(): Promise<number> {
  const startCwd = process.cwd();
  const repoRoot = path.resolve(path.dirname(process.argv[1] ?? "."), "..");
  process.chdir(repoRoot);
  // Imported after the move: the catalog's location is fixed when it loads.
  const { runCli } = await import("./run");
  return runCli(process.argv.slice(2), {
    cwd: startCwd,
    env: process.env,
    repoRoot,
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  });
}

void main().then((code) => {
  process.exitCode = code;
});
