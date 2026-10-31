import { describe, expect, it } from "vitest";
import {
  formatManifest,
  manifestKeys,
  parseManifest
} from "../src/manifest";
import { scan } from "../src/scan/index";

describe("scan pipeline", () => {
  it("scans a fixture site and emits a deterministic key list", async () => {
    const result = await scan("test/fixtures/site");
    const keys = manifestKeys(result);

    expect(result.files).toEqual(["app.css", "app.js", "index.html"]);
    expect(keys.length).toBeGreaterThan(30);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual([...keys].sort());
    expect(keys).toContain("css.properties.backdrop-filter");
    expect(keys).toContain("css.at-rules.container");
    expect(keys).toContain("html.elements.dialog");
    expect(keys).toContain("html.elements.input.type_date");
    expect(keys).toContain("api.IntersectionObserver");
    expect(keys).toContain("api.Navigator.share");
    expect(keys).toContain("javascript.builtins.Object.hasOwn");
    expect(keys).toContain("javascript.builtins.Promise.withResolvers");
    expect(keys).toContain("javascript.classes.private_class_fields");
    expect(keys).toContain("javascript.operators.await.top_level");
    expect(result.diagnostics).toEqual([]);
  });

  it("formats and parses JSON and line manifests", async () => {
    const result = await scan("test/fixtures/site");
    const keys = manifestKeys(result);

    expect(parseManifest(formatManifest(keys, "json"))).toEqual(keys);
    expect(parseManifest(formatManifest(keys, "lines"))).toEqual(keys);
    expect(parseManifest("# comment\n\n" + keys.join("\n"))).toEqual(keys);
  });

  it("supports a single file as input", async () => {
    const result = await scan("test/fixtures/site/app.js");
    expect(result.files).toEqual(["app.js"]);
    expect(manifestKeys(result)).toContain(
      "javascript.builtins.Promise.withResolvers"
    );
  });
});
