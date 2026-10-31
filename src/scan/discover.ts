import { stat } from "node:fs/promises";
import path from "node:path";
import { glob } from "tinyglobby";
import type { ScanOptions } from "../types";
import { compareStrings } from "../util";

export const DEFAULT_INCLUDE = ["**/*.{html,htm,css,js,mjs,cjs}"];
export const DEFAULT_EXCLUDE = [
  "**/node_modules/**",
  "**/.git/**",
  "**/*.map"
];

export interface DiscoveryResult {
  baseRoot: string;
  files: string[];
  relativeFiles: string[];
}

export async function discover(
  rootInput: string,
  options: ScanOptions = {}
): Promise<DiscoveryResult> {
  const root = path.resolve(rootInput);
  const rootStat = await stat(root);

  if (rootStat.isFile()) {
    return {
      baseRoot: path.dirname(root),
      files: [root],
      relativeFiles: [path.basename(root)]
    };
  }

  if (!rootStat.isDirectory()) {
    throw new Error(`${rootInput} is neither a file nor a directory`);
  }

  const include =
    options.include && options.include.length > 0
      ? options.include
      : DEFAULT_INCLUDE;
  const exclude = [...DEFAULT_EXCLUDE, ...(options.exclude ?? [])];

  const matches = await glob(include, {
    cwd: root,
    absolute: true,
    onlyFiles: true,
    dot: false,
    ignore: exclude
  });

  const files = [...new Set(matches.map((file) => path.resolve(file)))].sort(
    compareStrings
  );

  return {
    baseRoot: root,
    files,
    relativeFiles: files.map((file) =>
      path.relative(root, file).split(path.sep).join("/")
    )
  };
}
