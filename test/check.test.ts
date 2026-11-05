import { describe, expect, it } from "vitest";
import { checkFeatures, checkManifest } from "../src/check/index";
import { resolveTargets, DEFAULT_BROWSERS } from "../src/check/targets";
import { CompatDB } from "../src/compat/bcd";

const compat = new CompatDB();

describe("checkManifest", () => {
  it("moves node_modules issues into the dependencies category by default", () => {
    const target = [{ browser: "safari", version: "15.6" }];
    const dependencyFeature = {
      key: "css.properties.container-type",
      usages: [
        {
          file: "dist/app.css",
          line: 1,
          column: 1,
          source: {
            file: "../../../../../../../../node_modules/.pnpm/@codemirror+view@6.43.13/node_modules/@codemirror/view/dist/index.css",
            line: 2,
            column: 3
          }
        }
      ]
    };

    const result = checkFeatures([dependencyFeature], target, compat);
    expect(result.targets[0]?.unsupported).toEqual([]);
    expect(result.targets[0]?.warnings).toEqual([]);
    expect(result.targets[0]?.dependencies.map((issue) => issue.key)).toEqual([
      "css.properties.container-type"
    ]);
    expect(result.targets[0]?.dependencies[0]?.sourcePaths).toEqual([
      "node_modules/.pnpm/@codemirror+view@6.43.13/node_modules/@codemirror/view/dist/index.css"
    ]);
    expect(result.targets[0]?.dependencies[0]?.displaySources).toEqual([
      "@codemirror/view 6.43.13"
    ]);

    const mixed = checkFeatures(
      [
        {
          ...dependencyFeature,
          usages: [
            ...dependencyFeature.usages,
            {
              file: "dist/app.css",
              line: 10,
              column: 1,
              source: { file: "src/app.css", line: 20, column: 3 }
            }
          ]
        }
      ],
      target,
      compat
    );
    expect(mixed.targets[0]?.dependencies).toEqual([]);
    expect(mixed.targets[0]?.unsupported[0]?.key).toBe(
      "css.properties.container-type"
    );
    expect(mixed.targets[0]?.unsupported[0]?.sourcePaths).toEqual([
      "src/app.css"
    ]);
    expect(mixed.targets[0]?.unsupported[0]?.displaySources).toEqual([
      "src/app.css"
    ]);
  });

  it("includes only matching sources and packages", () => {
    const feature = {
      key: "css.properties.container-type",
      usages: [
        {
          file: "dist/app.css",
          line: 1,
          column: 1,
          source: { file: "src/app.css", line: 2, column: 3 }
        },
        {
          file: "dist/app.css",
          line: 10,
          column: 1,
          source: {
            file: "../../node_modules/.pnpm/@codemirror+view@6.43.13/node_modules/@codemirror/view/dist/index.css",
            line: 20,
            column: 3
          }
        }
      ]
    };
    const target = [{ browser: "safari", version: "15.6" }];

    const sourceOnly = checkFeatures([feature], target, compat, {
      includeSource: ["src/**"]
    });
    expect(sourceOnly.targets[0]?.unsupported[0]?.displaySources).toEqual([
      "src/app.css"
    ]);
    expect(sourceOnly.targets[0]?.dependencies).toEqual([]);

    const packageOnly = checkFeatures([feature], target, compat, {
      includePackage: ["@codemirror/*"]
    });
    expect(packageOnly.targets[0]?.unsupported).toEqual([]);
    expect(packageOnly.targets[0]?.dependencies[0]?.displaySources).toEqual([
      "@codemirror/view 6.43.13"
    ]);

    const versionedPackage = checkFeatures([feature], target, compat, {
      includePackage: ["@codemirror/view@6.*"]
    });
    expect(versionedPackage.targets[0]?.dependencies).toHaveLength(1);

    const noMatch = checkFeatures([feature], target, compat, {
      includePackage: ["@codemirror/view@9.0.0"]
    });
    expect(noMatch.targets[0]?.ignored).toHaveLength(1);

    const both = checkFeatures([feature], target, compat, {
      includeSource: ["src/**"],
      includePackage: ["@codemirror/*"]
    });
    expect(both.targets[0]?.unsupported[0]?.displaySources).toEqual([
      "src/app.css"
    ]);
  });

  it("lets excludes take precedence over includes", () => {
    const feature = {
      key: "css.properties.container-type",
      usages: [
        {
          file: "dist/app.css",
          line: 1,
          column: 1,
          source: { file: "src/app.css", line: 2, column: 3 }
        },
        {
          file: "dist/app.css",
          line: 10,
          column: 1,
          source: {
            file: "../../node_modules/.pnpm/@codemirror+view@6.43.13/node_modules/@codemirror/view/dist/index.css",
            line: 20,
            column: 3
          }
        }
      ]
    };
    const target = [{ browser: "safari", version: "15.6" }];

    const excludedSource = checkFeatures([feature], target, compat, {
      includeSource: ["src/**"],
      excludeSource: ["src/**"]
    });
    expect(excludedSource.targets[0]?.ignored).toHaveLength(1);
    expect(excludedSource.targets[0]?.unsupported).toEqual([]);
    expect(excludedSource.targets[0]?.dependencies).toEqual([]);

    const excludedPackage = checkFeatures([feature], target, compat, {
      excludePackage: ["@codemirror/view@6.43.13"]
    });
    expect(excludedPackage.targets[0]?.unsupported[0]?.displaySources).toEqual([
      "src/app.css"
    ]);

    const excludedEverything = checkFeatures([feature], target, compat, {
      excludeSource: ["src/**"],
      excludePackage: ["@codemirror/*"]
    });
    expect(excludedEverything.targets[0]?.ignored).toHaveLength(1);
    expect(excludedEverything.targets[0]?.unsupported).toEqual([]);
    expect(excludedEverything.targets[0]?.dependencies).toEqual([]);
  });

  it("optionally shows dependency subpaths", () => {
    const feature = {
      key: "css.properties.container-type",
      usages: [
        {
          file: "dist/app.css",
          line: 1,
          column: 1,
          source: {
            file: "../../../../node_modules/.pnpm/@scope+pkg@1.2.3/node_modules/@scope/pkg/dist/index.css",
            line: 2,
            column: 3
          }
        }
      ]
    };
    const target = [{ browser: "safari", version: "15.6" }];

    const withoutPaths = checkFeatures([feature], target, compat);
    expect(withoutPaths.targets[0]?.dependencies[0]?.displaySources).toEqual([
      "@scope/pkg 1.2.3"
    ]);

    const withPaths = checkFeatures([feature], target, compat, {
      showDependencyPaths: true
    });
    expect(withPaths.targets[0]?.dependencies[0]?.displaySources).toEqual([
      "@scope/pkg 1.2.3 (dist/index.css)"
    ]);
  });

  it("ignores issues from matching source files", () => {
    const feature = {
      key: "css.properties.container-type",
      usages: [
        {
          file: "dist/app.css",
          line: 1,
          column: 1,
          source: {
            file: "../../../../../../../../node_modules/.pnpm/@codemirror+view@6.43.13/node_modules/@codemirror/view/dist/index.css",
            line: 2,
            column: 3
          }
        }
      ]
    };
    const target = [{ browser: "safari", version: "15.6" }];
    const ignored = checkFeatures([feature], target, compat, {
      excludeSource: ["**/node_modules/**"]
    });
    expect(ignored.targets[0]?.unsupported).toEqual([]);
    expect(ignored.targets[0]?.dependencies).toEqual([]);
    expect(ignored.targets[0]?.ignored.map((issue) => issue.key)).toEqual([
      "css.properties.container-type"
    ]);
  });

  it("puts features with no support at all first", () => {
    const result = checkManifest(
      [
        "css.at-rules.container",
        "css.at-rules.scope",
        "css.at-rules.document"
      ],
      [{ browser: "safari", version: "15.6" }],
      compat
    );

    expect(result.targets[0]?.unsupported.map((issue) => issue.key)).toEqual([
      "css.at-rules.document",
      "css.at-rules.scope",
      "css.at-rules.container"
    ]);
  });

  it("sorts unsupported features by support version, newest first", () => {
    const result = checkManifest(
      [
        "css.properties.container-type",
        "css.at-rules.scope",
        "css.properties.text-wrap.balance",
        "css.at-rules.media.range_syntax"
      ],
      [{ browser: "safari", version: "15.6" }],
      compat
    );

    expect(result.targets[0]?.unsupported.map((issue) => issue.key)).toEqual([
      "css.at-rules.scope",
      "css.properties.text-wrap.balance",
      "css.at-rules.media.range_syntax",
      "css.properties.container-type"
    ]);
  });

  it("suppresses prefix warnings when a matching prefixed fallback is present", () => {
    const target = [{ browser: "safari", version: "15.6" }];

    const withFallback = checkManifest(
      ["css.properties.user-select", "css.properties.-webkit-user-select"],
      target,
      compat
    );
    expect(withFallback.targets[0]?.warnings).toEqual([]);
    expect(withFallback.targets[0]?.unsupported).toEqual([]);
    expect(withFallback.targets[0]?.supported).toBe(1);
    expect(withFallback.unknownKeys).toEqual([]);

    const withoutFallback = checkManifest(
      ["css.properties.user-select"],
      target,
      compat
    );
    expect(withoutFallback.targets[0]?.warnings.map((issue) => issue.key)).toContain(
      "css.properties.user-select"
    );
  });

  it("suppresses any qualifying prefix fallback", () => {
    const result = checkManifest(
      ["css.properties.user-select", "css.properties.-moz-user-select"],
      [{ browser: "firefox", version: "60" }],
      compat
    );
    expect(result.targets[0]?.warnings).toEqual([]);
    expect(result.targets[0]?.supported).toBe(1);
  });

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
