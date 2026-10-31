import { describe, expect, it } from "vitest";
import {
  compareVersions,
  evaluateSupport,
  parseVersion
} from "../src/compat/support";
import type { CompatStatement } from "../src/compat/types";

function compat(
  support: CompatStatement["support"]
): CompatStatement {
  return { support };
}

describe("parseVersion", () => {
  it("parses numeric and special versions", () => {
    expect(parseVersion("15.6")?.parts).toEqual([15, 6]);
    expect(parseVersion("≤37")?.parts).toEqual([37]);
    expect(parseVersion("TP")?.special).toBe(1);
    expect(parseVersion("all")?.parts).toEqual([0]);
    expect(parseVersion("unknown")).toBeUndefined();
  });

  it("compares versions", () => {
    expect(compareVersions("15.6", "15.6.1")).toBeLessThan(0);
    expect(compareVersions("16", "15.6")).toBeGreaterThan(0);
    expect(compareVersions("≤37", "38")).toBeLessThan(0);
  });
});

describe("evaluateSupport", () => {
  it("returns unknown for missing data", () => {
    expect(evaluateSupport(undefined, "chrome", "120").state).toBe("unknown");
    expect(
      evaluateSupport(compat({ firefox: { version_added: "1" } }), "chrome", "120")
        .state
    ).toBe("unknown");
  });

  it("handles added and removed versions", () => {
    const statement = compat({ chrome: { version_added: "100" } });
    expect(evaluateSupport(statement, "chrome", "99").state).toBe("unsupported");
    expect(evaluateSupport(statement, "chrome", "100").state).toBe("supported");

    const removed = compat({
      chrome: { version_added: "50", version_removed: "100" }
    });
    expect(evaluateSupport(removed, "chrome", "99").state).toBe("supported");
    expect(evaluateSupport(removed, "chrome", "100").state).toBe("unsupported");
  });

  it("handles multiple support ranges", () => {
    const statement = compat({
      chrome: [
        { version_added: "50", version_removed: "60" },
        { version_added: "70" }
      ]
    });
    expect(evaluateSupport(statement, "chrome", "55").state).toBe("supported");
    expect(evaluateSupport(statement, "chrome", "65").state).toBe("unsupported");
    expect(evaluateSupport(statement, "chrome", "70").state).toBe("supported");
  });

  it("collects all qualifying prefixes", () => {
    const evaluation = evaluateSupport(
      compat({
        chrome: [
          { version_added: "1", prefix: "-webkit-" },
          { version_added: "2", prefix: "-moz-" }
        ]
      }),
      "chrome",
      "120"
    );
    expect(evaluation.state).toBe("prefixed");
    expect(evaluation.prefixes).toEqual(["-moz-", "-webkit-"]);
  });

  it("reports warnings for partial, flagged, prefixed and alternative support", () => {
    expect(
      evaluateSupport(
        compat({
          chrome: { version_added: "100", partial_implementation: true }
        }),
        "chrome",
        "120"
      ).state
    ).toBe("partial");
    expect(
      evaluateSupport(
        compat({
          chrome: {
            version_added: "100",
            flags: [{ type: "preference", name: "experimental" }]
          }
        }),
        "chrome",
        "120"
      ).state
    ).toBe("flagged");
    expect(
      evaluateSupport(
        compat({ chrome: { version_added: "100", prefix: "-webkit-" } }),
        "chrome",
        "120"
      ).state
    ).toBe("prefixed");
    expect(
      evaluateSupport(
        compat({ chrome: { version_added: "100", alternative_name: "foo" } }),
        "chrome",
        "120"
      ).state
    ).toBe("alternative");
  });

  it("treats boolean version_added values", () => {
    expect(
      evaluateSupport(compat({ chrome: { version_added: true } }), "chrome", "1")
        .state
    ).toBe("supported");
    const never = evaluateSupport(
      compat({ chrome: { version_added: false } }),
      "chrome",
      "120"
    );
    expect(never.state).toBe("unsupported");
    expect(never.added).toBeUndefined();
  });
});
