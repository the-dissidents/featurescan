import type { CheckIssue, CheckResult } from "../check/index";
import type { Detection, ScanResult } from "../types";
import { VERSION } from "../version";
import { createColors, type Colors } from "./colors";
import { describeKey, kindForKey } from "./describe";

export interface ScanReportOptions {
  verbose?: boolean;
  quiet?: boolean;
  out?: string;
  durationMs?: number;
  stream?: NodeJS.WriteStream;
}

export interface CheckReportOptions {
  stream?: NodeJS.WriteStream;
}

const GROUP_TITLES: Record<string, string> = {
  html: "HTML",
  css: "CSS",
  js: "JS"
};

function usageLines(
  feature: Detection,
  limit: number,
  colors: Colors
): string[] {
  const usages = feature.usages.slice(0, limit);
  const lines = usages.map((usage) => {
    const snippet = usage.snippet ? `  ${colors.dim(usage.snippet)}` : "";
    const source = usage.source
      ? ` ${colors.cyan(
          `-> ${usage.source.file}:${usage.source.line}:${usage.source.column}${
            usage.source.name ? ` (${usage.source.name})` : ""
          }`
        )}`
      : "";
    return `    ${usage.file}:${usage.line}:${usage.column}${source}${snippet}`;
  });
  const remaining = feature.usages.length - usages.length;
  if (remaining > 0) {
    lines.push(`    ${colors.dim(`... and ${remaining} more`)}`);
  }
  return lines;
}

export function printScanReport(
  result: ScanResult,
  keys: string[],
  options: ScanReportOptions = {}
): void {
  if (options.quiet) {
    return;
  }

  const stream = options.stream ?? process.stderr;
  const colors = createColors(stream);
  const lines: string[] = [];
  lines.push(colors.bold(`featurescan ${VERSION}`));
  const duration =
    options.durationMs === undefined ? "" : ` in ${options.durationMs} ms`;
  lines.push(
    `Scanned ${result.files.length} file${
      result.files.length === 1 ? "" : "s"
    }${duration}`
  );

  if (keys.length === 0) {
    lines.push("Found no features.");
    if (options.out) {
      lines.push(`Manifest written to ${options.out}`);
    }
    stream.write(`${lines.join("\n")}\n`);
    return;
  }

  const groups: Record<string, Detection[]> = { html: [], css: [], js: [] };
  for (const feature of result.features) {
    groups[kindForKey(feature.key)]?.push(feature);
  }

  lines.push(
    `Found ${keys.length} feature${keys.length === 1 ? "" : "s"}: ` +
      (["html", "css", "js"] as const)
        .map((group) => `${groups[group]?.length ?? 0} ${GROUP_TITLES[group]}`)
        .join(", ")
  );

  for (const group of ["html", "css", "js"] as const) {
    const features = groups[group] ?? [];
    if (features.length === 0) {
      continue;
    }
    lines.push("");
    lines.push(colors.bold(`${GROUP_TITLES[group]} (${features.length})`));
    for (const feature of features) {
      lines.push(`  ${colors.cyan(describeKey(feature.key))}`);
      if (options.verbose) {
        lines.push(...usageLines(feature, 3, colors));
      }
    }
  }

  if (result.diagnostics.length > 0) {
    lines.push("");
    lines.push(colors.yellow(`Warnings (${result.diagnostics.length}):`));
    for (const diagnostic of result.diagnostics.slice(0, 20)) {
      const location = diagnostic.file ? `${diagnostic.file}: ` : "";
      lines.push(`  ${location}${diagnostic.message}`);
    }
    if (result.diagnostics.length > 20) {
      lines.push(`  ... and ${result.diagnostics.length - 20} more`);
    }
  }

  if (options.out) {
    lines.push("");
    lines.push(`Manifest written to ${options.out}`);
  }

  stream.write(`${lines.join("\n")}\n`);
}

function issueSources(issue: CheckIssue, colors: Colors): string {
  const sources = issue.sourcePaths;
  if (!sources || sources.length === 0) {
    return "";
  }
  const shown = sources.slice(0, 3).join(", ");
  const remaining = sources.length - 3;
  return colors.dim(
    ` [${shown}${remaining > 0 ? `, +${remaining}` : ""}]`
  );
}

function issueMarker(issue: CheckIssue, colors: Colors): string {
  switch (issue.state) {
    case "unsupported":
      return colors.red("x");
    case "unknown":
      return colors.yellow("?");
    default:
      return colors.yellow("!");
  }
}

function issueDetail(issue: CheckIssue): string {
  switch (issue.state) {
    case "partial":
      return "partial implementation";
    case "flagged": {
      const flags = issue.flags?.join(", ");
      return flags ? `requires a flag: ${flags}` : "requires a flag";
    }
    case "prefixed":
      return issue.prefix ? `requires prefix ${issue.prefix}` : "requires a prefix";
    case "alternative":
      return issue.alternativeName
        ? `alternative name: ${issue.alternativeName}`
        : "only available under another name";
    case "unsupported": {
      if (issue.removed === true) {
        return "removed";
      }
      if (typeof issue.removed === "string") {
        return `removed in ${issue.removed}`;
      }
      if (typeof issue.added === "string") {
        return `requires ${issue.added}`;
      }
      return "not supported";
    }
    case "unknown":
      return issue.reason ?? "unknown compatibility";
    default:
      return issue.state;
  }
}

export function printCheckReport(
  result: CheckResult,
  options: CheckReportOptions = {}
): void {
  const stream = options.stream ?? process.stdout;
  const colors = createColors(stream);
  const lines: string[] = [];

  for (const target of result.targets) {
    const dependencyText =
      target.dependencies.length > 0
        ? `, ${target.dependencies.length} dependencies`
        : "";
    const ignoredText =
      target.ignored.length > 0 ? `, ${target.ignored.length} ignored` : "";
    lines.push(
      colors.bold(`${target.browserName} ${target.version}`) +
        colors.dim(
          `  ${target.supported} supported, ${target.unsupported.length} unsupported, ${target.warnings.length} warnings${dependencyText}${ignoredText}`
        )
    );

    if (target.unsupported.length > 0) {
      lines.push(colors.red(`  Unsupported (${target.unsupported.length})`));
      for (const issue of target.unsupported) {
        lines.push(
          `    ${colors.red("x")} ${describeKey(issue.key)} ${colors.dim(
            `(${issueDetail(issue)})`
          )}${issueSources(issue, colors)}`
        );
      }
    }

    if (target.warnings.length > 0) {
      lines.push(colors.yellow(`  Warnings (${target.warnings.length})`));
      for (const issue of target.warnings) {
        lines.push(
          `    ${colors.yellow("!")} ${describeKey(issue.key)} ${colors.dim(
            `(${issueDetail(issue)})`
          )}${issueSources(issue, colors)}`
        );
      }
    }

    if (target.unknown.length > 0) {
      lines.push(colors.yellow(`  Unknown (${target.unknown.length})`));
      for (const issue of target.unknown) {
        lines.push(
          `    ${colors.yellow("?")} ${describeKey(issue.key)} ${colors.dim(
            `(${issueDetail(issue)})`
          )}${issueSources(issue, colors)}`
        );
      }
    }

    if (target.dependencies.length > 0) {
      lines.push(colors.yellow(`  Dependencies (${target.dependencies.length})`));
      for (const issue of target.dependencies) {
        lines.push(
          `    ${issueMarker(issue, colors)} ${describeKey(issue.key)} ${colors.dim(
            `(${issueDetail(issue)})`
          )}${issueSources(issue, colors)}`
        );
      }
    }

    if (target.ignored.length > 0) {
      lines.push(colors.dim(`  Ignored (${target.ignored.length})`));
      for (const issue of target.ignored) {
        lines.push(
          `    ${colors.dim("-")} ${describeKey(issue.key)} ${colors.dim(
            `(${issueDetail(issue)})`
          )}${issueSources(issue, colors)}`
        );
      }
    }

    if (
      target.unsupported.length === 0 &&
      target.warnings.length === 0 &&
      target.unknown.length === 0
    ) {
      lines.push(
        colors.green(
          target.dependencies.length > 0
            ? "  All first-party features supported."
            : target.ignored.length > 0
              ? "  All non-ignored features supported."
              : "  All features supported."
        )
      );
    }

    lines.push("");
  }

  if (result.unknownKeys.length > 0) {
    lines.push(
      colors.yellow(`Unknown feature keys (${result.unknownKeys.length}):`)
    );
    for (const key of result.unknownKeys) {
      lines.push(`  ${key}`);
    }
    lines.push("");
  }

  stream.write(`${lines.join("\n").trimEnd()}\n`);
}

export function formatCheckJson(result: CheckResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}
