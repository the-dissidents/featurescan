import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SourceMapConsumer,
  type RawSourceMap
} from "source-map";

export interface LoadedSourceMap {
  consumer?: SourceMapConsumer;
  warning?: string;
}

const SOURCE_MAPPING_URL =
  /(?:\/\/[#@]\s*sourceMappingURL=([^\s'"]+)|\/\*[#@]\s*sourceMappingURL=([^*]+?)\s*\*\/)/g;
const REMOTE_URL = /^(?:https?:)?\/\//;

function findSourceMappingURL(source: string): string | undefined {
  let match: RegExpExecArray | null;
  let url: string | undefined;
  SOURCE_MAPPING_URL.lastIndex = 0;
  while ((match = SOURCE_MAPPING_URL.exec(source))) {
    const candidate = match[1] ?? match[2];
    if (candidate) {
      url = candidate.trim().replace(/^["']|["']$/g, "");
    }
  }
  return url;
}

function parseDataUrl(url: string): RawSourceMap {
  const comma = url.indexOf(",");
  if (comma === -1) {
    throw new Error("invalid source map data URL");
  }
  const metadata = url.slice("data:".length, comma);
  const payload = url.slice(comma + 1);
  const json = metadata.includes(";base64")
    ? Buffer.from(payload, "base64").toString("utf8")
    : decodeURIComponent(payload);
  return JSON.parse(json) as RawSourceMap;
}

async function readSourceMap(
  filePath: string,
  url: string
): Promise<RawSourceMap | undefined> {
  if (url.startsWith("data:")) {
    return parseDataUrl(url);
  }
  if (REMOTE_URL.test(url)) {
    return undefined;
  }

  const withoutFragment = url.split("#")[0] ?? url;
  const cleanUrl = withoutFragment.split("?")[0] ?? withoutFragment;
  const mapPath = cleanUrl.startsWith("file:")
    ? fileURLToPath(cleanUrl)
    : path.resolve(path.dirname(filePath), decodeURIComponent(cleanUrl));
  const raw = await readFile(mapPath, "utf8");
  return JSON.parse(raw) as RawSourceMap;
}

export async function loadSourceMap(
  filePath: string,
  source: string
): Promise<LoadedSourceMap> {
  const url = findSourceMappingURL(source);
  if (!url) {
    return {};
  }

  try {
    const raw = await readSourceMap(filePath, url);
    if (!raw) {
      return {};
    }
    return { consumer: await new SourceMapConsumer(raw) };
  } catch (error) {
    const displayUrl = url.startsWith("data:") ? "data: source map" : url;
    return {
      warning: `failed to load ${displayUrl}: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    };
  }
}

export function normalizeOriginalSource(source: string): string {
  return source
    .replaceAll("\\", "/")
    .replace(/^webpack:\/\/[^/]*\//, "")
    .replace(/^webpack:\/\//, "")
    .replace(/^file:\/\//, "")
    .replace(/^\.\//, "");
}
