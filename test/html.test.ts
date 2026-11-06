import { describe, expect, it } from "vitest";
import { scanHtml } from "../src/scan/html";
import { createTestContext } from "./helpers";

describe("HTML scanner", () => {
  it("detects elements, attributes, inline CSS and inline JS", () => {
    const { context, catalog } = createTestContext({
      maxUsagesPerFile: Infinity
    });
    const source = `<!doctype html>
<html lang="en">
  <head>
    <style>.card { display: grid; }</style>
  </head>
  <body>
    <dialog popover>Hello</dialog>
    <input type="date">
    <link rel="preload" href="/font.woff2">
    <div style="display: flex; gap: 1rem" onclick="navigator.share?.({ title: 'x' })"></div>
    <template><details><summary>More</summary></details></template>
    <script type="module">
      navigator.share();
      const value = window.foo ?? 1;
      el?.showModal?.();
    </script>
    <iframe sandbox="allow-scripts allow-same-origin"></iframe>
  </body>
</html>
`;

    scanHtml({ file: "index.html", source, context });
    const keys = catalog.keys();

    expect(keys).toContain("html.elements.dialog");
    expect(keys).toContain("html.global_attributes.popover");
    expect(keys).toContain("html.elements.input.type_date");
    expect(keys).toContain("html.elements.link.rel.preload");
    expect(keys).toContain("html.elements.script.type.module");
    expect(keys).toContain("html.elements.iframe.sandbox.allow-scripts");
    expect(keys).toContain("html.elements.template");
    expect(keys).toContain("html.elements.details");
    expect(keys).toContain("html.global_attributes.lang");
    expect(keys).toContain("css.properties.display.grid");
    expect(keys).toContain("css.properties.display.flex");
    expect(keys).toContain("css.properties.gap");
    expect(keys).toContain("api.Navigator.share");
    expect(keys).toContain("javascript.operators.nullish_coalescing");
    expect(keys).toContain("javascript.operators.optional_chaining");
    expect(keys).toContain("api.HTMLDialogElement.showModal");

    const share = catalog
      .results()
      .find((feature) => feature.key === "api.Navigator.share");
    expect(share?.usages.some((usage) => usage.line === 13)).toBe(true);
  });

  it("keeps inline script locations relative to the parent document", () => {
    const { context, catalog } = createTestContext();
    const source = `<script>
const x = a ?? b;
</script>`;
    scanHtml({ file: "inline.html", source, context });

    const feature = catalog
      .results()
      .find(
        (entry) => entry.key === "javascript.operators.nullish_coalescing"
      );
    expect(feature?.usages[0]).toMatchObject({
      file: "inline.html",
      line: 2
    });
  });
});
