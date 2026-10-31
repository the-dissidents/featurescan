import { describe, expect, it } from "vitest";
import type { CheckResult } from "../src/check/index";
import { printCheckReport, printScanReport } from "../src/report/report";
import type { ScanResult } from "../src/types";

class FakeStream {
  isTTY = false;
  columns = 80;
  output = "";

  write(chunk: string): boolean {
    this.output += chunk;
    return true;
  }
}

describe("scan report", () => {
  it("shows source-map origins and writes to the chosen stream", () => {
    const result: ScanResult = {
      root: ".",
      files: ["app.js"],
      features: [
        {
          key: "api.IntersectionObserver",
          kind: "js",
          confidence: "high",
          usages: [
            {
              file: "dist/app.js",
              line: 1,
              column: 20,
              source: {
                file: "src/observer.ts",
                line: 10,
                column: 5,
                name: "IntersectionObserver"
              }
            }
          ]
        }
      ],
      diagnostics: []
    };

    const stream = new FakeStream();
    printScanReport(result, ["api.IntersectionObserver"], {
      verbose: true,
      stream: stream as unknown as NodeJS.WriteStream
    });

    expect(stream.output).toContain("dist/app.js:1:20");
    expect(stream.output).toContain("-> src/observer.ts:10:5");
    expect(stream.output).toContain("(IntersectionObserver)");
  });
});

describe("check report", () => {
  it("shows dependency issues in their own category", () => {
    const result: CheckResult = {
      targets: [
        {
          browser: "safari",
          version: "15.6",
          browserName: "Safari",
          supported: 0,
          unsupported: [],
          warnings: [],
          unknown: [],
          ignored: [],
          dependencies: [
            {
              key: "css.properties.container-type",
              state: "unsupported",
              added: "16",
              sourcePaths: ["node_modules/pkg/index.css"],
              usages: [
                {
                  file: "dist/app.css",
                  line: 1,
                  column: 1,
                  source: {
                    file: "node_modules/pkg/index.css",
                    line: 2,
                    column: 3
                  }
                }
              ]
            }
          ]
        }
      ],
      unknownKeys: []
    };

    const stream = new FakeStream();
    printCheckReport(result, {
      stream: stream as unknown as NodeJS.WriteStream
    });

    expect(stream.output).toContain("Dependencies (1)");
    expect(stream.output).toContain("node_modules/pkg/index.css");
    expect(stream.output).toContain("All first-party features supported.");
  });

  it("groups issue categories under HTML, CSS, and JS", () => {
    const result: CheckResult = {
      targets: [
        {
          browser: "safari",
          version: "15.6",
          browserName: "Safari",
          supported: 0,
          unsupported: [
            {
              key: "html.elements.dialog",
              state: "unsupported",
              added: "37"
            }
          ],
          warnings: [
            {
              key: "css.properties.backdrop-filter",
              state: "prefixed",
              prefix: "-webkit-"
            }
          ],
          unknown: [],
          ignored: [
            {
              key: "html.elements.template",
              state: "unsupported"
            }
          ],
          dependencies: [
            {
              key: "javascript.builtins.Array.toSorted",
              state: "unsupported",
              added: "16",
              sourcePaths: ["node_modules/pkg/index.js"]
            }
          ]
        }
      ],
      unknownKeys: []
    };

    const stream = new FakeStream();
    printCheckReport(result, {
      stream: stream as unknown as NodeJS.WriteStream,
      groupByKind: true
    });

    const output = stream.output;
    expect(output).toContain("Unsupported (1)");
    expect(output).toContain("Warnings (1)");
    expect(output).toContain("Dependencies (1)");
    expect(output).toContain("Ignored (1)");
    expect(output.indexOf("HTML")).toBeLessThan(output.indexOf("Unsupported"));
    expect(output.indexOf("Unsupported")).toBeLessThan(output.indexOf("CSS"));
    expect(output.indexOf("CSS")).toBeLessThan(output.indexOf("Warnings"));
    expect(output.indexOf("Warnings")).toBeLessThan(output.indexOf("JS"));
    expect(output.indexOf("JS")).toBeLessThan(output.indexOf("Dependencies"));
  });
});
