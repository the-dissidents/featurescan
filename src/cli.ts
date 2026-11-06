import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cac } from "cac";
import { checkFeatures } from "./check/index";
import { resolveTargets } from "./check/targets";
import { CompatDB } from "./compat/bcd";
import {
  loadFeaturescanConfig,
  resolveCheckConfig,
  resolveScanConfig,
  type CheckCliOverrides,
  type ScanCliOverrides
} from "./config";
import {
  formatDetailedManifest,
  formatManifest,
  manifestKeys,
  parseManifestData
} from "./manifest";
import { ProgressBar } from "./report/progress";
import {
  formatCheckJson,
  printCheckReport,
  printScanReport
} from "./report/report";
import { scan } from "./scan/index";
import { VERSION } from "./version";

interface ScanCliOptions extends ScanCliOverrides {
  config?: string;
}

interface CheckCliOptions extends CheckCliOverrides {
  config?: string;
  listBrowsers?: boolean;
}

function parseMaxUsages(value: string | number | undefined): number {
  if (value === undefined) {
    return 10;
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
  const loaded = await loadFeaturescanConfig({
    configFile: options.config
  });
  const settings = resolveScanConfig(options, loaded.config.scan ?? {});
  const format = settings.format;

  const started = Date.now();
  const out = settings.out;
  const writeToFile = Boolean(out && out !== "-");
  const reportStream = writeToFile ? process.stdout : process.stderr;
  const showProgress =
    !settings.quiet &&
    settings.progress &&
    process.env.TERM !== "dumb";
  const progress = new ProgressBar(process.stderr, showProgress);
  const maxUsages = parseMaxUsages(settings.maxUsages);

  const result = await (async () => {
    try {
      return await scan(rootArg ?? ".", {
        include: settings.include,
        exclude: settings.exclude,
        maxUsages,
        onProgress: showProgress
          ? (state) => progress.update(state)
          : undefined
      });
    } finally {
      progress.stop();
    }
  })();

  const keys = manifestKeys(result);
  const output =
    format === "detailed"
      ? formatDetailedManifest(result)
      : formatManifest(keys, format);

  if (writeToFile && out) {
    const target = path.resolve(out);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, output, "utf8");
  } else {
    process.stdout.write(output);
  }

  printScanReport(result, keys, {
    verbose: settings.verbose,
    quiet: settings.quiet,
    out: writeToFile ? out : undefined,
    durationMs: Date.now() - started,
    stream: reportStream
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

  const loaded = await loadFeaturescanConfig({
    configFile: options.config
  });
  const settings = resolveCheckConfig(options, loaded.config.check ?? {});
  const source = await readFile(manifestFile, "utf8");
  const manifest = parseManifestData(source);

  if (
    !manifest.detailed &&
    (settings.includeSource.length > 0 ||
      settings.excludeSource.length > 0 ||
      settings.includePackage.length > 0 ||
      settings.excludePackage.length > 0)
  ) {
    throw new Error(
      "source and package filters require a detailed manifest; use scan --format detailed"
    );
  }

  const targets = resolveTargets(settings.browsers, compat);
  const result = checkFeatures(manifest.features, targets, compat, {
    includeSource: settings.includeSource,
    excludeSource: settings.excludeSource,
    includePackage: settings.includePackage,
    excludePackage: settings.excludePackage,
    showDependencyPaths: settings.showDependencyPaths
  });

  if (settings.json) {
    process.stdout.write(formatCheckJson(result));
  } else if (!settings.quiet) {
    printCheckReport(result, { groupByKind: settings.groupByKind });
  }

  if (
    settings.fail &&
    result.targets.some((target) => target.unsupported.length > 0)
  ) {
    process.exitCode = 2;
  }
}

export async function main(argv = process.argv): Promise<void> {
  const cli = cac("featurescan");

  cli.help();
  cli.version(VERSION);
  cli.option("--no-color", "Disable colored output");
  cli.option("--config <path>", "load configuration from this file");

  cli
    .command("scan [root]", "Scan a built site and emit a feature key manifest")
    .option(
      "-o, --out <file>",
      "write the manifest to a file and print the report to stdout"
    )
    .option(
      "--format <format>",
      'manifest format: "json", "lines", or "detailed" (default: json)'
    )
    .option("--include <glob>", "include glob (repeatable)", {
      type: [String]
    })
    .option("--exclude <glob>", "exclude glob (repeatable)", {
      type: [String]
    })
    .option(
      "--max-usages <count>",
      "maximum usage locations per feature per package (default: 10; 0 = unlimited)"
    )
    .option("-v, --verbose", "show usage locations in the report")
    .option("-q, --quiet", "suppress the report and progress bar")
    .option("--progress", "show the progress bar (use --no-progress to disable)")
    .action(runScan);

  cli
    .command(
      "check [manifest]",
      "Check a manifest against target browsers using MDN compatibility data"
    )
    .option("--browser <spec>", "browser@version target (repeatable)", {
      type: [String]
    })
    .option(
      "--include-source <glob>",
      "include usages whose source path matches this glob (repeatable)",
      { type: [String] }
    )
    .option(
      "--exclude-source <glob>",
      "exclude usages whose source path matches this glob (repeatable)",
      { type: [String] }
    )
    .option(
      "--include-package <pattern>",
      "include usages from matching packages, optionally package@version (repeatable)",
      { type: [String] }
    )
    .option(
      "--exclude-package <pattern>",
      "exclude usages from matching packages, optionally package@version (repeatable)",
      { type: [String] }
    )
    .option(
      "--show-dependency-paths",
      "include subpaths when displaying dependency packages"
    )
    .option("--group-by-kind", "group issues under HTML, CSS, and JS")
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
