import { describe, expect, it } from "vitest";
import { Catalog } from "../src/scan/catalog";
import type { Usage } from "../src/types";

function usage(file: string, line: number): Usage {
  return { file, line, column: 1 };
}

function sourceUsage(source: string, line: number): Usage {
  return {
    file: "dist/app.js",
    line,
    column: 1,
    source: { file: source, line: 1, column: 1 }
  };
}

describe("Catalog", () => {
  it("caps usages per feature per package", () => {
    const catalog = new Catalog(2, Infinity);
    const project = [
      usage("src/app.js", 1),
      usage("src/app.js", 2),
      usage("src/app.js", 3)
    ];
    const packageV1 = [
      sourceUsage(
        "node_modules/.pnpm/pkg@1.0.0/node_modules/pkg/dist/a.js",
        1
      ),
      sourceUsage(
        "node_modules/.pnpm/pkg@1.0.0/node_modules/pkg/dist/b.js",
        2
      ),
      sourceUsage(
        "node_modules/.pnpm/pkg@1.0.0/node_modules/pkg/dist/c.js",
        3
      )
    ];
    const packageV2 = [
      sourceUsage(
        "node_modules/.pnpm/pkg@2.0.0/node_modules/pkg/dist/a.js",
        4
      ),
      sourceUsage(
        "node_modules/.pnpm/pkg@2.0.0/node_modules/pkg/dist/b.js",
        5
      ),
      sourceUsage(
        "node_modules/.pnpm/pkg@2.0.0/node_modules/pkg/dist/c.js",
        6
      )
    ];
    const vanilla = [
      sourceUsage("node_modules/other/dist/a.js", 7),
      sourceUsage("node_modules/other/dist/b.js", 8),
      sourceUsage("node_modules/other/dist/c.js", 9)
    ];

    for (const entry of [...project, ...packageV1, ...packageV2, ...vanilla]) {
      catalog.add("api.fetch", "js", entry);
    }

    expect(catalog.results()[0]?.usages).toHaveLength(8);
  });

  it("does not count duplicate locations toward the cap", () => {
    const catalog = new Catalog(2, Infinity);
    const first = usage("src/app.js", 1);
    const second = usage("src/app.js", 2);
    catalog.add("api.fetch", "js", first);
    catalog.add("api.fetch", "js", first);
    catalog.add("api.fetch", "js", first);
    catalog.add("api.fetch", "js", second);
    catalog.add("api.fetch", "js", usage("src/app.js", 3));

    expect(catalog.results()[0]?.usages).toEqual([first, second]);
  });

  it("defaults to 1 usage per feature per file", () => {
    const catalog = new Catalog();
    catalog.add("api.fetch", "js", usage("src/app.js", 1));
    catalog.add("api.fetch", "js", usage("src/app.js", 2));
    catalog.add("api.fetch", "js", usage("src/other.js", 3));

    expect(catalog.results()[0]?.usages).toEqual([
      usage("src/app.js", 1),
      usage("src/other.js", 3)
    ]);
  });

  it("defaults to 10 usages per project bucket", () => {
    const catalog = new Catalog();
    for (let index = 1; index <= 12; index += 1) {
      catalog.add("api.fetch", "js", usage(`src/file${index}.js`, index));
    }
    expect(catalog.results()[0]?.usages).toHaveLength(10);
  });

  it("reports whether another usage would be retained", () => {
    const catalog = new Catalog(10, 1);
    expect(catalog.canAdd("api.fetch", "src/app.js")).toBe(true);
    catalog.add("api.fetch", "js", usage("src/app.js", 1));
    expect(catalog.canAdd("api.fetch", "src/app.js")).toBe(false);
    expect(catalog.canAdd("api.fetch", "src/other.js")).toBe(true);
  });

  it("treats zero limits as unlimited", () => {
    const catalog = new Catalog(0, 0);
    for (let index = 1; index <= 20; index += 1) {
      catalog.add("api.fetch", "js", usage("src/app.js", index));
    }
    expect(catalog.results()[0]?.usages).toHaveLength(20);
  });
});
