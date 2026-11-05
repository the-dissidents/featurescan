import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadFeaturescanConfig,
  resolveCheckConfig,
  resolveScanConfig,
  type FeaturescanConfig
} from "../src/config";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const base = path.join(process.cwd(), "tmp");
  await mkdir(base, { recursive: true });
  const dir = await mkdtemp(path.join(base, "config-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("config loading", () => {
  it("loads and validates featurescan.config.json", async () => {
    const dir = await makeTempDir();
    const config: FeaturescanConfig = {
      $schema: "./node_modules/featurescan/featurescan.config.schema.json",
      scan: {
        format: "detailed",
        maxUsages: 0,
        verbose: true,
        progress: false,
        quiet: true,
        out: "features.json"
      },
      check: {
        browsers: ["safari@15.6"],
        includeSource: ["src/**"],
        excludeSource: ["legacy/**"],
        includePackage: ["@codemirror/*"],
        excludePackage: ["@scope/pkg@1.2.3"],
        showDependencyPaths: false,
        groupByKind: true,
        fail: true,
        json: true,
        quiet: true
      }
    };
    await writeFile(
      path.join(dir, "featurescan.config.json"),
      JSON.stringify(config)
    );

    const loaded = await loadFeaturescanConfig({ cwd: dir });
    expect(loaded.config).toEqual(config);
    expect(loaded.configFile).toBe(
      path.join(dir, "featurescan.config.json")
    );
  });

  it("loads an explicit config file", async () => {
    const dir = await makeTempDir();
    const configFile = path.join(dir, "custom.json");
    await writeFile(configFile, JSON.stringify({ scan: { format: "lines" } }));

    const loaded = await loadFeaturescanConfig({
      cwd: process.cwd(),
      configFile
    });
    expect(loaded.config.scan?.format).toBe("lines");
    expect(loaded.configFile).toBe(configFile);
  });

  it("rejects invalid configs", async () => {
    const dir = await makeTempDir();
    await writeFile(
      path.join(dir, "featurescan.config.json"),
      JSON.stringify({ scan: { format: "yaml" } })
    );
    await expect(loadFeaturescanConfig({ cwd: dir })).rejects.toThrow(
      /invalid featurescan config/
    );

    await writeFile(
      path.join(dir, "featurescan.config.json"),
      JSON.stringify({ scan: { unknown: true } })
    );
    await expect(loadFeaturescanConfig({ cwd: dir })).rejects.toThrow(
      /invalid featurescan config/
    );
  });

  it("rejects a missing explicit config file", async () => {
    const dir = await makeTempDir();
    await expect(
      loadFeaturescanConfig({
        cwd: dir,
        configFile: path.join(dir, "missing.json")
      })
    ).rejects.toThrow();
  });
});

describe("config resolution", () => {
  it("applies defaults when nothing is configured", () => {
    expect(resolveScanConfig({})).toEqual({
      include: undefined,
      exclude: undefined,
      format: "json",
      maxUsages: undefined,
      out: undefined,
      verbose: false,
      quiet: false,
      progress: true
    });
    expect(resolveCheckConfig({})).toEqual({
      browsers: [],
      includeSource: [],
      excludeSource: [],
      includePackage: [],
      excludePackage: [],
      showDependencyPaths: false,
      groupByKind: false,
      fail: false,
      json: false,
      quiet: false
    });
  });

  it("lets CLI values override config values", () => {
    const scan = resolveScanConfig(
      {
        include: [],
        format: "json",
        maxUsages: 5,
        out: "-",
        verbose: false,
        quiet: false,
        progress: false
      },
      {
        include: ["src/**/*.html"],
        format: "detailed",
        maxUsages: 100,
        out: "features.json",
        verbose: true,
        quiet: true,
        progress: true
      }
    );
    expect(scan).toEqual({
      include: [],
      exclude: undefined,
      format: "json",
      maxUsages: 5,
      out: "-",
      verbose: false,
      quiet: false,
      progress: false
    });

    const check = resolveCheckConfig(
      {
        browser: ["chrome@120"],
        includeSource: ["src/**"],
        excludeSource: ["vendor/**"],
        includePackage: ["@codemirror/*"],
        excludePackage: ["@scope/pkg@1.2.3"],
        showDependencyPaths: true,
        groupByKind: false,
        fail: false,
        json: false,
        quiet: false
      },
      {
        browsers: ["safari@15.6"],
        includeSource: ["app/**"],
        excludeSource: ["legacy/**"],
        includePackage: ["bits-ui"],
        excludePackage: ["colorjs.io"],
        showDependencyPaths: false,
        groupByKind: true,
        fail: true,
        json: true,
        quiet: true
      }
    );
    expect(check).toEqual({
      browsers: ["chrome@120"],
      includeSource: ["src/**"],
      excludeSource: ["vendor/**"],
      includePackage: ["@codemirror/*"],
      excludePackage: ["@scope/pkg@1.2.3"],
      showDependencyPaths: true,
      groupByKind: false,
      fail: false,
      json: false,
      quiet: false
    });
  });
});
