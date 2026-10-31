import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cac } from "cac";
import { checkManifest } from "./check/index";
import { resolveTargets } from "./check/targets";
import { CompatDB } from "./compat/bcd";
import {
  formatManifest,
  manifestKeys,
  parseManifest
} from "./manifest";
import {
  formatCheckJson,
  printCheckReport,
  printScanReport
} from "./report/report";
import { scan } from "./scan/index";
import type { ManifestFormat } from "./types";
import { VERSION } from "./version";

interface ScanCliOptions {
  out?: string;
  format?: string;
  include?: string[] | string;
  exclude?: string[] | string;
  maxUsages?: string | number;
  verbose?: boolean;
  quiet?: boolean;
}

interface CheckCliOptions {
  browser?: string[] | string;
  json?: boolean;
  fail?: boolean;
  quiet?: boolean;
  listBrowsers?: boolean;
}

function stringArray(value: string[] | string | undefined): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  return typeof value === "string" ? [value] : [];
}

function parseMaxUsages(value: string | number | undefined): number {
  if (value === undefined) {
    return 50;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("--max-usages must be a non-negative number");
  }
  return Math.floor(parsed);
}

async function runScan(
  rootArg: string | undefined,
  options: ScanCliOptions
): Promise<void> {
  const format = (options.format ?? "json") as ManifestFormat;
  if (format !== "json" && format !== "lines") {
    throw new Error('--format must be "json" or "lines"');
  }

  const started = Date.now();
  const result = await scan(rootArg ?? ".", {
    include: stringArray(options.include),
    exclude: stringArray(options.exclude),
    maxUsages: parseMaxUsages(options.maxUsages)
  });
  const keys = manifestKeys(result);
  const output = formatManifest(keys, format);
  const out = options.out;

  if (out && out !== "-") {
    const target = path.resolve(out);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, output, "utf8");
  } else {
    process.stdout.write(output);
  }

  printScanReport(result, keys, {
    verbose: options.verbose,
    quiet: options.quiet,
    out: out && out !== "-" ? out : undefined,
    durationMs: Date.now() - started
  });
}

async function runCheck(
  manifestFile: string | undefined,
  options: CheckCliOptions
): Promise<void> {
  const compat = new CompatDB();

  if (options.listBrowsers) {
    const lines = compat.browserIds().map((browser) => {
      const latest = compat.latestVersion(browser);
      return `${browser.padEnd(28)} ${compat.browserName(browser).padEnd(30)} ${
        latest ?? ""
      }`;
    });
    process.stdout.write(`${lines.join("\n")}\n`);
    return;
  }

  if (!manifestFile) {
    throw new Error("missing manifest file");
  }

  const source = await readFile(manifestFile, "utf8");
  const keys = parseManifest(source);
  const targets = resolveTargets(stringArray(options.browser), compat);
  const result = checkManifest(keys, targets, compat);

  if (options.json) {
    process.stdout.write(formatCheckJson(result));
  } else if (!options.quiet) {
    printCheckReport(result);
  }

  if (options.fail && result.targets.some((target) => target.unsupported.length > 0)) {
    process.exitCode = 2;
  }
}

export async function main(argv = process.argv): Promise<void> {
  const cli = cac("featurescan");

  cli.help();
  cli.version(VERSION);
  cli.option("--no-color", "Disable colored output");

  cli
    .command("scan [root]", "Scan a built site and emit a feature key manifest")
    .option("-o, --out <file>", "write the manifest to a file (default: stdout)")
    .option("--format <format>", 'manifest format: "json" or "lines"', {
      default: "json"
    })
    .option("--include <glob>", "include glob (repeatable)", {
      type: [String]
    })
    .option("--exclude <glob>", "exclude glob (repeatable)", {
      type: [String]
    })
    .option("--max-usages <count>", "maximum usage locations per feature", {
      default: 50
    })
    .option("-v, --verbose", "show usage locations in the report")
    .option("-q, --quiet", "suppress the human-readable report")
    .action(runScan);

  cli
    .command(
      "check [manifest]",
      "Check a manifest against target browsers using MDN compatibility data"
    )
    .option("--browser <spec>", "browser@version target (repeatable)", {
      type: [String]
    })
    .option("--json", "print machine-readable JSON")
    .option("--fail", "exit with code 2 when unsupported features are found")
    .option("-q, --quiet", "suppress the human-readable report")
    .option("--list-browsers", "list known browser identifiers and latest versions")
    .action(runCheck);

  cli.parse(argv, { run: false });

  const informational = argv.some((argument) =>
    ["--help", "-h", "--version", "-v"].includes(argument)
  );
  if (!cli.matchedCommand) {
    if (!informational) {
      cli.outputHelp();
      process.exitCode = 1;
    }
    return;
  }

  await cli.runMatchedCommand();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`featurescan: ${message}\n`);
  process.exitCode = 1;
});
