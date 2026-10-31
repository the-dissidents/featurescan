import { describe, expect, it } from "vitest";
import { checkManifest } from "../src/check/index";
import { resolveTargets, DEFAULT_BROWSERS } from "../src/check/targets";
import { CompatDB } from "../src/compat/bcd";

const compat = new CompatDB();

describe("checkManifest", () => {
  it("finds unsupported features for a target browser", () => {
    const result = checkManifest(
      [
        "api.IntersectionObserver",
        "css.properties.container-type",
        "javascript.builtins.Array.toSorted",
        "html.elements.dialog",
        "not.a.real.key"
      ],
      [
        { browser: "safari", version: "15.6" },
        { browser: "chrome", version: "120" }
      ],
      compat
    );

    const safari = result.targets[0];
    const chrome = result.targets[1];

    expect(safari?.unsupported.map((issue) => issue.key)).toContain(
      "css.properties.container-type"
    );
    expect(safari?.unsupported.map((issue) => issue.key)).toContain(
      "javascript.builtins.Array.toSorted"
    );
    expect(safari?.unsupported.map((issue) => issue.key)).not.toContain(
      "html.elements.dialog"
    );
    expect(chrome?.unsupported).toEqual([]);
    expect(result.unknownKeys).toEqual(["not.a.real.key"]);
  });
});

describe("resolveTargets", () => {
  it("uses mainstream latest versions by default", () => {
    const targets = resolveTargets([], compat);
    expect(targets.map((target) => target.browser)).toEqual(DEFAULT_BROWSERS);
    for (const target of targets) {
      expect(target.version).toBe(compat.latestVersion(target.browser));
    }
  });

  it("resolves aliases and comma separated specs", () => {
    const targets = resolveTargets(
      ["ios@15.6", "chrome@120,safari@15.6"],
      compat
    );
    expect(targets).toEqual([
      { browser: "safari_ios", version: "15.6" },
      { browser: "chrome", version: "120" },
      { browser: "safari", version: "15.6" }
    ]);
  });

  it("rejects unknown browsers", () => {
    expect(() => resolveTargets(["not-a-browser"], compat)).toThrow(
      /unknown browser/
    );
  });
});
