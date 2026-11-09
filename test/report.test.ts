import { describe, expect, it } from "vitest";
import type { CheckResult } from "../src/check/index";
import {
  printCheckReport,
  printScanReport,
  printScanSummary
} from "../src/report/report";
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

function scanResult(): ScanResult {
  return {
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
}

describe("scan report", () => {
  it("prints the header, feature counts, and manifest path as a summary", () => {
    const stream = new FakeStream();
    printScanSummary(scanResult(), ["api.IntersectionObserver"], {
      durationMs: 12,
      out: "features.json",
      stream: stream as unknown as NodeJS.WriteStream
    });

    const lines = stream.output.trimEnd().split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("featurescan");
    expect(lines[1]).toBe("Scanned 1 file in 12 ms");
    expect(lines[2]).toBe("Found 1 feature: 0 HTML, 0 CSS, 1 JS");
    expect(lines[3]).toBe("Manifest written to features.json");
    expect(stream.output).not.toContain("IntersectionObserver");
  });

  it("lists features without usage locations in the full report", () => {
    const stream = new FakeStream();
    printScanReport(scanResult(), ["api.IntersectionObserver"], {
      stream: stream as unknown as NodeJS.WriteStream
    });

    expect(stream.output).toContain("Found 1 feature");
    expect(stream.output).toContain("IntersectionObserver");
    expect(stream.output).not.toContain("dist/app.js:1:20");
    expect(stream.output).not.toContain("-> src/observer.ts:10:5");
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
              displaySources: ["@scope/pkg 1.0.0"],
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
    expect(stream.output).toContain("@scope/pkg 1.0.0");
    expect(stream.output).not.toContain("node_modules/pkg/index.css");
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
