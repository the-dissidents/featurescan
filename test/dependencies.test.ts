import { describe, expect, it } from "vitest";
import {
  formatDependency,
  normalizeSourcePath,
  parseDependencyPath
} from "../src/dependencies";

describe("source path normalization", () => {
  it("trims parent traversal and normalizes separators", () => {
    expect(normalizeSourcePath("../../../node_modules/foo/index.js")).toBe(
      "node_modules/foo/index.js"
    );
    expect(normalizeSourcePath("src\\..\\src\\app.ts")).toBe("src/app.ts");
  });
});

describe("dependency path parsing", () => {
  it("parses pnpm scoped packages with peer suffixes", () => {
    expect(
      parseDependencyPath(
        "../../../../../../../../node_modules/.pnpm/@the_dissidents+svelte-ui@0.0.28_colorjs.io@0.6.1_svelte@5.57.1/node_modules/@the_dissidents/svelte-ui/dist/Popup.svelte"
      )
    ).toEqual({
      name: "@the_dissidents/svelte-ui",
      version: "0.0.28",
      subpath: "dist/Popup.svelte"
    });
  });

  it("parses pnpm unscoped packages", () => {
    expect(
      parseDependencyPath(
        "../../node_modules/.pnpm/colorjs.io@0.7.1/node_modules/colorjs.io/src/ColorSpace.js"
      )
    ).toEqual({
      name: "colorjs.io",
      version: "0.7.1",
      subpath: "src/ColorSpace.js"
    });

    expect(
      parseDependencyPath(
        "../../node_modules/.pnpm/bits-ui@2.19.3_@internationalized+date@3.12.4_svelte@5.57.1_@typescript-eslint+types@8.70.1_/node_modules/bits-ui/dist/internal/body-scroll-lock.svelte.js"
      )
    ).toEqual({
      name: "bits-ui",
      version: "2.19.3",
      subpath: "dist/internal/body-scroll-lock.svelte.js"
    });
  });

  it("parses vanilla nested node_modules paths", () => {
    expect(
      parseDependencyPath(
        "../../../node_modules/foo/node_modules/bar/node_modules/baz/dist/example.js"
      )
    ).toEqual({
      name: "baz",
      subpath: "dist/example.js"
    });
  });

  it("parses scoped vanilla packages", () => {
    expect(
      parseDependencyPath("node_modules/@scope/pkg/dist/index.js")
    ).toEqual({
      name: "@scope/pkg",
      subpath: "dist/index.js"
    });
  });

  it("returns undefined for non-dependency paths", () => {
    expect(parseDependencyPath("src/components/App.svelte")).toBeUndefined();
  });
});

describe("dependency formatting", () => {
  it("shows package name and version by default", () => {
    expect(
      formatDependency(
        { name: "@scope/pkg", version: "1.2.3", subpath: "dist/index.js" },
        false
      )
    ).toBe("@scope/pkg 1.2.3");
  });

  it("can include the subpath", () => {
    expect(
      formatDependency(
        { name: "baz", subpath: "dist/example.js" },
        true
      )
    ).toBe("baz (dist/example.js)");
  });
});
