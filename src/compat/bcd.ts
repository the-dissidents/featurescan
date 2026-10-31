import { createRequire } from "node:module";
import { compareStrings } from "../util";
import type {
  BcdData,
  BcdNode,
  CompatStatement
} from "./types";

const require = createRequire(import.meta.url);

export type Namespace = "html" | "svg" | "mathml";

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const MEDIA_GENERIC_KEYS = new Set([
  "media_features",
  "media_query_values",
  "nested-queries",
  "or_syntax",
  "range_syntax"
]);

interface Indexes {
  apiGlobals: Map<string, string>;
  builtinGlobals: Map<string, string>;
  tags: Record<Namespace, Map<string, string>>;
  attrs: Record<Namespace, Map<string, Map<string, string>>>;
  globalAttrs: Record<Namespace, Map<string, string>>;
  cssProperties: Map<string, string>;
  cssValues: Map<string, string>;
  cssAtRules: Map<string, string>;
  cssSelectors: Map<string, string>;
  cssFunctions: Map<string, string>;
  mediaFeatures: Map<string, string>;
}

export function loadBcd(): BcdData {
  return require("@mdn/browser-compat-data") as BcdData;
}

function asNode(value: unknown): BcdNode | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as BcdNode)
    : undefined;
}

function collectCompatChildren(
  node: BcdNode | undefined,
  prefix: string,
  target: Map<string, string>,
  normalize: (name: string) => string = (name) => name
): void {
  if (!node) {
    return;
  }
  for (const [name, value] of Object.entries(node)) {
    if (name === "__compat") {
      continue;
    }
    const child = asNode(value);
    if (child?.__compat) {
      target.set(normalize(name), `${prefix}.${name}`);
    }
  }
}

function collectFunctions(
  node: BcdNode,
  path: string[],
  target: Map<string, string>
): void {
  if (node.__compat) {
    const name = path[path.length - 1];
    if (name) {
      target.set(name.toLowerCase(), path.join("."));
      if (name.endsWith("-function") && name.length > "-function".length) {
        const alias = name.slice(0, -"-function".length);
        target.set(alias.toLowerCase(), path.join("."));
      }
    }
  }

  for (const [name, value] of Object.entries(node)) {
    if (name === "__compat") {
      continue;
    }
    const child = asNode(value);
    if (child) {
      collectFunctions(child, [...path, name], target);
    }
  }
}

function normalizeValueKey(name: string): string {
  return name.toLowerCase();
}

export class CompatDB {
  readonly data: BcdData;
  readonly version: string;
  readonly #compatCache = new Map<string, CompatStatement | null>();
  #indexes: Indexes | undefined;

  constructor(data: BcdData = loadBcd()) {
    this.data = data;
    this.version = data.__meta?.version ?? "unknown";
  }

  getCompat(key: string): CompatStatement | undefined {
    const cached = this.#compatCache.get(key);
    if (cached !== undefined) {
      return cached ?? undefined;
    }

    let current: unknown = this.data;
    for (const segment of key.split(".")) {
      const node = asNode(current);
      if (!node || !(segment in node)) {
        this.#compatCache.set(key, null);
        return undefined;
      }
      current = node[segment];
    }

    const compat = asNode(current)?.__compat;
    this.#compatCache.set(key, compat ?? null);
    return compat;
  }

  has(key: string): boolean {
    return this.getCompat(key) !== undefined;
  }

  browserIds(): string[] {
    return Object.keys(this.data.browsers).sort(compareStrings);
  }

  browserName(id: string): string {
    return this.data.browsers[id]?.name ?? id;
  }

  latestVersion(browser: string): string | undefined {
    const releases = this.data.browsers[browser]?.releases;
    if (!releases) {
      return undefined;
    }

    const entries = Object.entries(releases);
    const current = entries.filter(
      ([, release]) =>
        release.status === "current" || release.status === "esr"
    );
    const pool = current.length > 0 ? current : entries;
    pool.sort(([, a], [, b]) => (b.index ?? -1) - (a.index ?? -1));
    return pool[0]?.[0];
  }

  apiGlobal(name: string): string | undefined {
    return this.#getIndexes().apiGlobals.get(name);
  }

  builtinGlobal(name: string): string | undefined {
    return this.#getIndexes().builtinGlobals.get(name);
  }

  builtinStatic(owner: string, property: string): string | undefined {
    const key = `javascript.builtins.${owner}.${property}`;
    return this.has(key) ? key : undefined;
  }

  hasInterface(interfaceName: string): boolean {
    return this.has(`api.${interfaceName}`);
  }

  interfaceMember(interfaceName: string, property: string): string | undefined {
    const key = `api.${interfaceName}.${property}`;
    if (this.has(key)) {
      return key;
    }
    const staticKey = `api.${interfaceName}.${property}_static`;
    return this.has(staticKey) ? staticKey : undefined;
  }

  webAssemblyStatic(property: string): string | undefined {
    const candidates = [
      `webassembly.api.${property}_static`,
      `webassembly.api.${property}`
    ];
    return candidates.find((key) => this.has(key));
  }

  resolveTag(namespace: Namespace, tag: string): string | undefined {
    return this.#getIndexes().tags[namespace].get(tag.toLowerCase());
  }

  attributePresenceKeys(
    namespace: Namespace,
    tag: string,
    attr: string
  ): string[] {
    const indexes = this.#getIndexes();
    const tagKey = indexes.tags[namespace].get(tag.toLowerCase());
    const attrName = namespace === "html" ? attr.toLowerCase() : attr;
    const keys: string[] = [];

    if (tagKey) {
      const key = indexes.attrs[namespace].get(tag.toLowerCase())?.get(attrName);
      if (key) {
        keys.push(key);
      }
    }

    const globalKey = indexes.globalAttrs[namespace].get(attrName);
    if (globalKey) {
      keys.push(globalKey);
    }

    return keys;
  }

  attributeValueKeys(
    namespace: Namespace,
    tag: string,
    attr: string,
    rawValue: string
  ): string[] {
    const indexes = this.#getIndexes();
    const tagKey = indexes.tags[namespace].get(tag.toLowerCase());
    const attrName = namespace === "html" ? attr.toLowerCase() : attr;
    const value = rawValue.trim().toLowerCase();
    if (!value) {
      return [];
    }

    const candidates: string[] = [];
    if (tagKey) {
      candidates.push(`${tagKey}.${attrName}.${value}`);
      candidates.push(`${tagKey}.${attrName}_${value}`);
    }

    const globalKey = indexes.globalAttrs[namespace].get(attrName);
    if (globalKey) {
      candidates.push(`${globalKey}.${value}`);
      candidates.push(`${globalKey}_${value}`);
    }

    return [...new Set(candidates.filter((key) => this.has(key)))];
  }

  cssProperty(property: string): string | undefined {
    return this.#getIndexes().cssProperties.get(property.toLowerCase());
  }

  cssValue(property: string, value: string): string | undefined {
    const key = `${property.toLowerCase()}\0${value.toLowerCase()}`;
    return this.#getIndexes().cssValues.get(key);
  }

  cssAtRule(name: string): string | undefined {
    return this.#getIndexes().cssAtRules.get(name.toLowerCase());
  }

  cssSelector(name: string): string | undefined {
    return this.#getIndexes().cssSelectors.get(name.toLowerCase());
  }

  cssFunction(name: string): string | undefined {
    return this.#getIndexes().cssFunctions.get(name.toLowerCase());
  }

  mediaFeature(name: string): string | undefined {
    return this.#getIndexes().mediaFeatures.get(name.toLowerCase());
  }

  mediaRangeSyntax(): string | undefined {
    const key = "css.at-rules.media.range_syntax";
    return this.has(key) ? key : undefined;
  }

  #getIndexes(): Indexes {
    if (this.#indexes) {
      return this.#indexes;
    }

    const apiGlobals = new Map<string, string>();
    const builtinGlobals = new Map<string, string>();
    const tags: Record<Namespace, Map<string, string>> = {
      html: new Map(),
      svg: new Map(),
      mathml: new Map()
    };
    const attrs: Record<Namespace, Map<string, Map<string, string>>> = {
      html: new Map(),
      svg: new Map(),
      mathml: new Map()
    };
    const globalAttrs: Record<Namespace, Map<string, string>> = {
      html: new Map(),
      svg: new Map(),
      mathml: new Map()
    };
    const cssProperties = new Map<string, string>();
    const cssValues = new Map<string, string>();
    const cssAtRules = new Map<string, string>();
    const cssSelectors = new Map<string, string>();
    const cssFunctions = new Map<string, string>();
    const mediaFeatures = new Map<string, string>();

    for (const [name, value] of Object.entries(this.data.api ?? {})) {
      if (name === "__compat" || !IDENTIFIER.test(name)) {
        continue;
      }
      if (asNode(value)?.__compat) {
        apiGlobals.set(name, `api.${name}`);
      }
    }

    for (const [name, value] of Object.entries(
      this.data.javascript?.builtins ?? {}
    )) {
      if (name === "__compat" || !IDENTIFIER.test(name)) {
        continue;
      }
      if (asNode(value)?.__compat) {
        builtinGlobals.set(name, `javascript.builtins.${name}`);
      }
    }

    const collectNamespace = (namespace: Namespace, node: BcdNode | undefined) => {
      const elementNode = asNode(node?.elements);
      collectCompatChildren(
        elementNode,
        `${namespace}.elements`,
        tags[namespace],
        (n) => n.toLowerCase()
      );
      collectCompatChildren(
        node?.global_attributes as BcdNode | undefined,
        `${namespace}.global_attributes`,
        globalAttrs[namespace],
        namespace === "html" ? (n) => n.toLowerCase() : (n) => n
      );
      collectCompatChildren(
        node?.global_attributes as BcdNode | undefined,
        `${namespace}.global_attributes`,
        globalAttrs[namespace],
        (n) => n.toLowerCase()
      );

      if (!elementNode) {
        return;
      }
      for (const [tagName, tagValue] of Object.entries(elementNode)) {
        if (tagName === "__compat") {
          continue;
        }
        const tagNode = asNode(tagValue);
        if (!tagNode) {
          continue;
        }
        const tagKey = `${namespace}.elements.${tagName}`;
        const attrMap = new Map<string, string>();
        for (const [attrName, attrValue] of Object.entries(tagNode)) {
          if (attrName === "__compat") {
            continue;
          }
          if (asNode(attrValue)?.__compat) {
            attrMap.set(
              namespace === "html" ? attrName.toLowerCase() : attrName,
              `${tagKey}.${attrName}`
            );
            attrMap.set(attrName.toLowerCase(), `${tagKey}.${attrName}`);
          }
        }
        attrs[namespace].set(tagName.toLowerCase(), attrMap);
      }
    };

    collectNamespace("html", this.data.html);
    collectNamespace("svg", this.data.svg);
    collectNamespace("mathml", this.data.mathml);

    collectCompatChildren(
      this.data.css?.properties as BcdNode | undefined,
      "css.properties",
      cssProperties,
      (n) => n.toLowerCase()
    );

    const propertiesNode = asNode(this.data.css?.properties);
    if (propertiesNode) {
      for (const [propertyName, propertyValue] of Object.entries(propertiesNode)) {
        if (propertyName === "__compat") {
          continue;
        }
        const propertyNode = asNode(propertyValue);
        if (!propertyNode) {
          continue;
        }
        for (const [valueName, valueValue] of Object.entries(propertyNode)) {
          if (valueName === "__compat") {
            continue;
          }
          if (!asNode(valueValue)?.__compat) {
            continue;
          }
          const key = `css.properties.${propertyName}.${valueName}`;
          const normalized = normalizeValueKey(valueName);
          cssValues.set(`${propertyName.toLowerCase()}\0${normalized}`, key);
          if (normalized.includes("_")) {
            cssValues.set(
              `${propertyName.toLowerCase()}\0${normalized.replaceAll("_", "-")}`,
              key
            );
          }
        }
      }
    }

    collectCompatChildren(
      this.data.css?.["at-rules"] as BcdNode | undefined,
      "css.at-rules",
      cssAtRules,
      (n) => n.toLowerCase()
    );
    collectCompatChildren(
      this.data.css?.selectors as BcdNode | undefined,
      "css.selectors",
      cssSelectors,
      (n) => n.toLowerCase()
    );

    const typesNode = asNode(this.data.css?.types);
    if (typesNode) {
      for (const [name, value] of Object.entries(typesNode)) {
        if (name === "__compat") {
          continue;
        }
        const child = asNode(value);
        if (child) {
          collectFunctions(child, ["css", "types", name], cssFunctions);
        }
      }
    }

    const mediaNode = asNode(asNode(this.data.css?.["at-rules"])?.media);
    if (mediaNode) {
      for (const [name, value] of Object.entries(mediaNode)) {
        if (name === "__compat" || MEDIA_GENERIC_KEYS.has(name)) {
          continue;
        }
        if (asNode(value)?.__compat) {
          mediaFeatures.set(name.toLowerCase(), `css.at-rules.media.${name}`);
        }
      }
    }

    this.#indexes = {
      apiGlobals,
      builtinGlobals,
      tags,
      attrs,
      globalAttrs,
      cssProperties,
      cssValues,
      cssAtRules,
      cssSelectors,
      cssFunctions,
      mediaFeatures
    };

    return this.#indexes;
  }
}
