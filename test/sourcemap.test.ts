import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { SourceMapGenerator } from "source-map";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatDetailedManifest,
  parseManifestData
} from "../src/manifest";
import { scan } from "../src/scan/index";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const base = path.join(process.cwd(), "tmp");
  await mkdir(base, { recursive: true });
  const dir = await mkdtemp(path.join(base, "sourcemap-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("source maps", () => {
  it("maps usage locations through sourceMappingURL", async () => {
    const dir = await makeTempDir();
    const code = `const observer = new IntersectionObserver(() => {});\n//# sourceMappingURL=app.js.map\n`;
    const generatedColumn = code.indexOf("IntersectionObserver");
    const generator = new SourceMapGenerator({ file: "app.js" });
    generator.addMapping({
      generated: { line: 1, column: generatedColumn },
      original: { line: 42, column: 4 },
      source: "src/observer.ts",
      name: "IntersectionObserver"
    });

    await writeFile(path.join(dir, "app.js"), code);
    await writeFile(path.join(dir, "app.js.map"), generator.toString());

    const result = await scan(dir);
    const feature = result.features.find(
      (entry) => entry.key === "api.IntersectionObserver"
    );
    const usage = feature?.usages.find((entry) => entry.source);

    expect(usage?.source).toEqual({
      file: "src/observer.ts",
      line: 42,
      column: 5,
      name: "IntersectionObserver"
    });

    const detailed = parseManifestData(formatDetailedManifest(result));
    expect(detailed.detailed).toBe(true);
    const detailedFeature = detailed.features.find(
      (entry) => entry.key === "api.IntersectionObserver"
    );
    expect(
      detailedFeature?.usages?.some(
        (entry) => entry.source?.file === "src/observer.ts"
      )
    ).toBe(true);
  });

  it("maps member usages at the property location", async () => {
    const dir = await makeTempDir();
    const code = `const list = [3, 1, 2].toSorted();\n//# sourceMappingURL=app.js.map\n`;
    const generatedColumn = code.indexOf("toSorted");
    const generator = new SourceMapGenerator({ file: "app.js" });
    generator.addMapping({
      generated: { line: 1, column: generatedColumn },
      original: { line: 7, column: 10 },
      source: "vendor/lib.ts",
      name: "toSorted"
    });

    await writeFile(path.join(dir, "app.js"), code);
    await writeFile(path.join(dir, "app.js.map"), generator.toString());

    const result = await scan(dir);
    const feature = result.features.find(
      (entry) => entry.key === "javascript.builtins.Array.toSorted"
    );
    expect(feature?.usages[0]?.source).toEqual({
      file: "vendor/lib.ts",
      line: 7,
      column: 11,
      name: "toSorted"
    });
  });

  it("warns when a source map cannot be loaded", async () => {
    const dir = await makeTempDir();
    await writeFile(
      path.join(dir, "app.js"),
      "const x = window.foo;\n//# sourceMappingURL=missing.js.map\n"
    );

    const result = await scan(dir);
    expect(result.diagnostics.some((entry) => /missing\.js\.map/.test(entry.message))).toBe(
      true
    );
  });
});
