import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import prettier from "prettier";

const isWindows = process.platform === "win32";
const command = isWindows ? process.env.ComSpec || "cmd.exe" : "pnpm";
const args = isWindows
  ? [
      "/d",
      "/s",
      "/c",
      "pnpm exec supabase gen types typescript --local --schema public",
    ]
  : [
      "exec",
      "supabase",
      "gen",
      "types",
      "typescript",
      "--local",
      "--schema",
      "public",
    ];

const result = spawnSync(command, args, {
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024,
});

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  process.exit(result.status ?? 1);
}

if (!result.stdout.includes("export type Database =")) {
  throw new Error("La CLI Supabase n’a pas généré de type Database valide.");
}

const outputPath = fileURLToPath(
  new URL("../src/types/database.ts", import.meta.url),
);
const prettierOptions = await prettier.resolveConfig(outputPath);
const formattedOutput = await prettier.format(result.stdout, {
  ...prettierOptions,
  filepath: outputPath,
});

await writeFile(outputPath, formattedOutput, "utf8");
process.stdout.write(`Types Supabase générés dans ${outputPath}\n`);
