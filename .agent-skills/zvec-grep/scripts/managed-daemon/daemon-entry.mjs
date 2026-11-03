// Internal entry: the public launcher applies the OS profile before starting this process.
import { parse, runCommand } from "./main.mjs";

try {
  const args = process.argv.slice(2);
  if (args.at(-2) !== "--boundary-canary" || !args.at(-1)) throw new Error("internal entry requires boundary canary");
  const boundaryCanary = args.pop();
  args.pop();
  const { command, options } = parse(args);
  options.boundaryCanary = boundaryCanary;
  if (command !== "run") throw new Error("internal entry only supports run");
  await runCommand(options, true);
} catch (error) {
  console.error(`${error.code ?? "ERROR"}: ${error.message}`);
  process.exit(error.code === "OS_EGRESS_BOUNDARY_UNAVAILABLE" ? 78 : 70);
}
