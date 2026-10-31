import { describe, expect, it } from "vitest";
import { scanJs } from "../src/scan/js";
import { createTestContext } from "./helpers";

describe("JavaScript scanner", () => {
  it("detects syntax, builtins and web APIs", () => {
    const { context, catalog } = createTestContext();
    const source = `
const a = obj?.x ?? 1;
const big = 1_000n;
class A { #x = 1; static { this.ok = true } }
const re = /(?<=a)b/dv;
await import('./x.js');
const s = 'x'.replaceAll('x', 'y');
Object.hasOwn({}, 'x');
Promise.withResolvers();
new WeakRef({});
navigator.share({ title: 'x' });
document.startViewTransition(() => {});
crypto.randomUUID();
CSS.supports('display: grid');
new IntersectionObserver(() => {});
requestAnimationFrame(() => {});
matchMedia('(prefers-reduced-motion: reduce)');
`;

    scanJs({ file: "app.js", source, context, sourceType: "module" });
    const keys = catalog.keys();

    expect(keys).toContain("javascript.operators.optional_chaining");
    expect(keys).toContain("javascript.operators.nullish_coalescing");
    expect(keys).toContain("javascript.builtins.BigInt");
    expect(keys).toContain("javascript.classes.private_class_fields");
    expect(keys).toContain("javascript.classes.static.initialization_blocks");
    expect(keys).toContain("javascript.builtins.RegExp.hasIndices");
    expect(keys).toContain("javascript.builtins.RegExp.unicodeSets");
    expect(keys).toContain("javascript.regular_expressions.lookbehind_assertion");
    expect(keys).toContain("javascript.operators.import");
    expect(keys).toContain("javascript.operators.await.top_level");
    expect(keys).toContain("javascript.builtins.String.replaceAll");
    expect(keys).toContain("javascript.builtins.Object.hasOwn");
    expect(keys).toContain("javascript.builtins.Promise.withResolvers");
    expect(keys).toContain("javascript.builtins.WeakRef");
    expect(keys).toContain("api.Navigator.share");
    expect(keys).toContain("api.Document.startViewTransition");
    expect(keys).toContain("api.Crypto.randomUUID");
    expect(keys).toContain("api.CSS.supports_static");
    expect(keys).toContain("api.IntersectionObserver");
    expect(keys).toContain("api.Window.requestAnimationFrame");
    expect(keys).toContain("api.Window.matchMedia");

    const replaceAll = catalog
      .results()
      .find((feature) => feature.key === "javascript.builtins.String.replaceAll");
    expect(replaceAll?.confidence).toBe("medium");
  });

  it("ignores shadowed globals", () => {
    const { context, catalog } = createTestContext();
    const source = `
function f(Object, navigator) {
  Object.hasOwn({}, 'x');
  navigator.share();
}
`;

    scanJs({ file: "shadow.js", source, context, sourceType: "script" });
    const keys = catalog.keys();

    expect(keys).not.toContain("javascript.builtins.Object.hasOwn");
    expect(keys).not.toContain("api.Navigator.share");
  });

  it("resolves window and global object members", () => {
    const { context, catalog } = createTestContext();
    scanJs({
      file: "members.js",
      source: `
window.fetch('/x');
window.crypto.randomUUID();
localStorage.setItem('x', 'y');
URL.createObjectURL(new Blob([]));
el.showModal();
status.at(0);
`,
      context,
      sourceType: "script"
    });
    const keys = catalog.keys();

    expect(keys).toContain("api.fetch");
    expect(keys).toContain("api.Crypto.randomUUID");
    expect(keys).toContain("api.Storage.setItem");
    expect(keys).toContain("api.URL.createObjectURL_static");
    expect(keys).toContain("api.HTMLDialogElement.showModal");
    expect(keys).toContain("javascript.builtins.Array.at");
    expect(keys).toContain("javascript.builtins.String.at");
  });

  it("does not confuse Object.prototype names with detection rules", () => {
    const { context, catalog } = createTestContext();
    expect(() =>
      scanJs({
        file: "prototype-names.js",
        source:
          "obj.toString(); obj.constructor(); obj.valueOf(); obj.hasOwnProperty('x'); constructor.foo();",
        context,
        sourceType: "script"
      })
    ).not.toThrow();
    expect(catalog.keys()).toEqual([]);
  });

  it("reports parse warnings instead of throwing", () => {
    const { context, catalog, diagnostics } = createTestContext();
    scanJs({
      file: "broken.js",
      source: "const = ;",
      context,
      sourceType: "script"
    });
    expect(catalog.size).toBe(0);
    expect(diagnostics.length).toBeGreaterThan(0);
  });
});
