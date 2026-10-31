import { describe, expect, it } from "vitest";
import { scanCss } from "../src/scan/css";
import { createTestContext } from "./helpers";

describe("CSS scanner", () => {
  it("detects properties, values, selectors, functions and at-rules", () => {
    const { context, catalog } = createTestContext();
    const source = `@media (width > 600px) {
  .a:has(img) {
    display: grid;
    backdrop-filter: blur(2px);
    color: color-mix(in srgb, red, blue);
    text-wrap: balance;
  }
}
@container card (min-width: 400px) {
  .b { container-type: inline-size; }
}
.a { & .b { overflow: clip; } }
`;

    scanCss({ file: "test.css", source, context });
    const keys = catalog.keys();

    expect(keys).toContain("css.at-rules.media");
    expect(keys).toContain("css.at-rules.media.range_syntax");
    expect(keys).toContain("css.at-rules.media.width");
    expect(keys).toContain("css.at-rules.container");
    expect(keys).toContain("css.selectors.has");
    expect(keys).toContain("css.properties.display");
    expect(keys).toContain("css.properties.display.grid");
    expect(keys).toContain("css.properties.backdrop-filter");
    expect(keys).toContain("css.properties.color");
    expect(keys).toContain("css.types.color.color-mix");
    expect(keys).toContain("css.properties.text-wrap.balance");
    expect(keys).toContain("css.properties.container-type.inline-size");
    expect(keys).toContain("css.selectors.nesting");
    expect(keys).toContain("css.properties.overflow.clip");
    expect(keys).toContain("css.types.filter-function.blur");

    const display = catalog
      .results()
      .find((feature) => feature.key === "css.properties.display.grid");
    expect(display?.usages.some((usage) => usage.line === 3)).toBe(true);
  });

  it("records vendor-prefixed properties alongside their base key", () => {
    const { context, catalog } = createTestContext();
    scanCss({
      file: "prefix.css",
      source: ".a { -webkit-user-select: none; user-select: none; }",
      context
    });
    const keys = catalog.keys();

    expect(keys).toContain("css.properties.user-select");
    expect(keys).toContain("css.properties.-webkit-user-select");
  });

  it("normalizes min/max media features", () => {
    const { context, catalog } = createTestContext();
    scanCss({
      file: "media.css",
      source: "@media (min-width: 300px) { .a { color: red; } }",
      context
    });
    expect(catalog.keys()).toContain("css.at-rules.media.width");
  });

  it("scans declaration lists with a base position", () => {
    const { context, catalog } = createTestContext();
    scanCss({
      file: "index.html",
      source: "display: flex; gap: 1rem",
      context,
      mode: "declarationList",
      base: { offset: 20, line: 4, column: 10 }
    });

    expect(catalog.keys()).toContain("css.properties.display.flex");
    expect(catalog.keys()).toContain("css.properties.gap");
    const display = catalog
      .results()
      .find((feature) => feature.key === "css.properties.display.flex");
    expect(display?.usages[0]).toMatchObject({ file: "index.html", line: 4 });
  });
});
