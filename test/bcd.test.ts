import { describe, expect, it } from "vitest";
import { CompatDB } from "../src/compat/bcd";
import {
  GLOBAL_FUNCTION_KEYS,
  GLOBAL_PATHS,
  INSTANCE_API_METHODS,
  INSTANCE_BUILTIN_METHODS,
  MODERN_BUILTIN_GLOBALS,
  SPECIAL_GLOBAL_KEYS,
  WINDOW_GLOBAL_FUNCTIONS
} from "../src/rules/js";

const compat = new CompatDB();

describe("compat database", () => {
  it("loads a version", () => {
    expect(compat.version).toMatch(/^\d+\./);
  });

  it("resolves HTML, SVG and CSS features", () => {
    expect(compat.resolveTag("html", "dialog")).toBe("html.elements.dialog");
    expect(compat.resolveTag("svg", "circle")).toBe("svg.elements.circle");
    expect(compat.cssProperty("backdrop-filter")).toBe(
      "css.properties.backdrop-filter"
    );
    expect(compat.cssValue("display", "grid")).toBe(
      "css.properties.display.grid"
    );
    expect(compat.cssAtRule("container")).toBe("css.at-rules.container");
    expect(compat.cssSelector("has")).toBe("css.selectors.has");
    expect(compat.cssFunction("color-mix")).toBe(
      "css.types.color.color-mix"
    );
    expect(compat.mediaFeature("prefers-reduced-motion")).toBe(
      "css.at-rules.media.prefers-reduced-motion"
    );
  });

  it("resolves HTML attribute values", () => {
    expect(compat.attributeValueKeys("html", "input", "type", "date")).toContain(
      "html.elements.input.type_date"
    );
    expect(
      compat.attributeValueKeys("html", "link", "rel", "preload")
    ).toContain("html.elements.link.rel.preload");
    expect(
      compat.attributeValueKeys("html", "script", "type", "module")
    ).toContain("html.elements.script.type.module");
    expect(
      compat.attributePresenceKeys("html", "dialog", "popover")
    ).toContain("html.global_attributes.popover");
  });

  it("resolves curated JS rules", () => {
    for (const name of MODERN_BUILTIN_GLOBALS) {
      expect(compat.builtinGlobal(name), name).toBeDefined();
    }

    for (const key of Object.values(SPECIAL_GLOBAL_KEYS)) {
      expect(compat.has(key), key).toBe(true);
    }

    for (const [name, candidate] of Object.entries(GLOBAL_FUNCTION_KEYS)) {
      expect(
        compat.interfaceMember(candidate.interfaceName, candidate.property),
        name
      ).toBeDefined();
    }

    for (const name of WINDOW_GLOBAL_FUNCTIONS) {
      expect(
        compat.interfaceMember("Window", name) ?? compat.apiGlobal(name),
        name
      ).toBeDefined();
    }

    for (const [method, candidates] of Object.entries(INSTANCE_API_METHODS)) {
      for (const candidate of candidates) {
        expect(
          compat.interfaceMember(candidate.interfaceName, candidate.property),
          `${method}: ${candidate.interfaceName}.${candidate.property}`
        ).toBeDefined();
      }
    }

    for (const [method, candidates] of Object.entries(
      INSTANCE_BUILTIN_METHODS
    )) {
      for (const candidate of candidates) {
        expect(
          compat.builtinStatic(candidate.owner, candidate.property),
          `${method}: ${candidate.owner}.${candidate.property}`
        ).toBeDefined();
      }
    }

    for (const [path, interfaceName] of Object.entries(GLOBAL_PATHS)) {
      expect(compat.hasInterface(interfaceName), `${path} -> ${interfaceName}`).toBe(
        true
      );
    }
  });

  it("reports latest browser versions", () => {
    expect(compat.latestVersion("chrome")).toBeDefined();
    expect(compat.latestVersion("safari")).toBeDefined();
    expect(compat.latestVersion("not-a-browser")).toBeUndefined();
  });
});
