import Ajv from "ajv";
import { loadConfig } from "c12";
import schema from "../featurescan.config.schema.json";
import type { ManifestFormat } from "./types";

export interface ScanConfig {
  include?: string[];
  exclude?: string[];
  format?: ManifestFormat;
  maxUsages?: number;
  maxUsagesPerFile?: number;
  out?: string;
  verbose?: boolean;
  progress?: boolean;
  quiet?: boolean;
}

export interface CheckConfig {
  browsers?: string[];
  includeSource?: string[];
  excludeSource?: string[];
  includePackage?: string[];
  excludePackage?: string[];
  showDependencyPaths?: boolean;
  groupByKind?: boolean;
  fail?: boolean;
  json?: boolean;
  quiet?: boolean;
}

export interface FeaturescanConfig {
  $schema?: string;
  scan?: ScanConfig;
  check?: CheckConfig;
}

export interface LoadFeaturescanConfigOptions {
  cwd?: string;
  configFile?: string;
}

export interface LoadedFeaturescanConfig {
  config: FeaturescanConfig;
  configFile?: string;
}

export interface ScanCliOverrides {
  include?: string[] | string;
  exclude?: string[] | string;
  format?: string;
  maxUsages?: string | number;
  maxUsagesPerFile?: string | number;
  out?: string;
  verbose?: boolean;
  quiet?: boolean;
  progress?: boolean;
}

export interface CheckCliOverrides {
  browser?: string[] | string;
  includeSource?: string[] | string;
  excludeSource?: string[] | string;
  includePackage?: string[] | string;
  excludePackage?: string[] | string;
  showDependencyPaths?: boolean;
  groupByKind?: boolean;
  fail?: boolean;
  json?: boolean;
  quiet?: boolean;
}

export interface ResolvedScanConfig {
  include?: string[];
  exclude?: string[];
  format: ManifestFormat;
  maxUsages?: string | number;
  maxUsagesPerFile?: string | number;
  out?: string;
  verbose: boolean;
  quiet: boolean;
  progress: boolean;
}

export interface ResolvedCheckConfig {
  browsers: string[];
  includeSource: string[];
  excludeSource: string[];
  includePackage: string[];
  excludePackage: string[];
  showDependencyPaths: boolean;
  groupByKind: boolean;
  fail: boolean;
  json: boolean;
  quiet: boolean;
}

const ajv = new Ajv({ allErrors: true, strict: false });
const validateConfig = ajv.compile<FeaturescanConfig>(schema);

function cliStringArray(
  value: string[] | string | undefined
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [value];
}

function isManifestFormat(value: string): value is ManifestFormat {
  return value === "json" || value === "lines" || value === "detailed";
}

export function resolveScanConfig(
  cli: ScanCliOverrides,
  config: ScanConfig = {}
): ResolvedScanConfig {
  const format = cli.format ?? config.format ?? "json";
  if (!isManifestFormat(format)) {
    throw new Error('--format must be "json", "lines", or "detailed"');
  }

  return {
    include: cliStringArray(cli.include) ?? config.include,
    exclude: cliStringArray(cli.exclude) ?? config.exclude,
    format,
    maxUsages: cli.maxUsages ?? config.maxUsages,
    maxUsagesPerFile: cli.maxUsagesPerFile ?? config.maxUsagesPerFile,
    out: cli.out ?? config.out,
    verbose: cli.verbose ?? config.verbose ?? false,
    quiet: cli.quiet ?? config.quiet ?? false,
    progress: cli.progress ?? config.progress ?? true
  };
}

export function resolveCheckConfig(
  cli: CheckCliOverrides,
  config: CheckConfig = {}
): ResolvedCheckConfig {
  return {
    browsers:
      cliStringArray(cli.browser) ?? config.browsers ?? [],
    includeSource:
      cliStringArray(cli.includeSource) ?? config.includeSource ?? [],
    excludeSource:
      cliStringArray(cli.excludeSource) ?? config.excludeSource ?? [],
    includePackage:
      cliStringArray(cli.includePackage) ?? config.includePackage ?? [],
    excludePackage:
      cliStringArray(cli.excludePackage) ?? config.excludePackage ?? [],
    showDependencyPaths:
      cli.showDependencyPaths ?? config.showDependencyPaths ?? false,
    groupByKind: cli.groupByKind ?? config.groupByKind ?? false,
    fail: cli.fail ?? config.fail ?? false,
    json: cli.json ?? config.json ?? false,
    quiet: cli.quiet ?? config.quiet ?? false
  };
}

export async function loadFeaturescanConfig(
  options: LoadFeaturescanConfigOptions = {}
): Promise<LoadedFeaturescanConfig> {
  const resolved = await loadConfig<FeaturescanConfig>({
    name: "featurescan",
    cwd: options.cwd ?? process.cwd(),
    ...(options.configFile
      ? {
          configFile: options.configFile,
          configFileRequired: true
        }
      : {}),
    rcFile: false,
    packageJson: false,
    dotenv: false,
    extend: false,
    envName: false
  });

  const config = resolved.config ?? {};
  if (!validateConfig(config)) {
    const errors = (validateConfig.errors ?? [])
      .map(
        (error) =>
          `${error.instancePath || "/"} ${error.message ?? "is invalid"}`
      )
      .join("; ");
    throw new Error(
      `invalid featurescan config${resolved._configFile ? ` (${resolved._configFile})` : ""}: ${errors}`
    );
  }

  return {
    config,
    configFile: resolved._configFile
  };
}
