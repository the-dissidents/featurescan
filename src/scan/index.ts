import { readFile } from "node:fs/promises";
import path from "node:path";
import { CompatDB } from "../compat/bcd";
import type { Diagnostic, ScanOptions, ScanResult } from "../types";
import { Catalog } from "./catalog";
import type { ScanContext } from "./context";
import { scanCss } from "./css";
import { discover } from "./discover";
import { scanHtml } from "./html";
import { scanJs } from "./js";
import { loadSourceMap } from "./sourcemap";

export async function scan(
  rootInput: string,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const progress = options.onProgress;
  progress?.({ phase: "discover", processed: 0, total: 0 });

  const { baseRoot, files, relativeFiles } = await discover(
    rootInput,
    options
  );
  const maxUsages =
    options.maxUsages === undefined ? 10 : options.maxUsages;
  const catalog = new Catalog(maxUsages === 0 ? Infinity : maxUsages);
  const diagnostics: Diagnostic[] = [];
  const context: ScanContext = {
    compat: new CompatDB(),
    catalog,
    diagnostics
  };

  progress?.({ phase: "scan", processed: 0, total: files.length });

  let processed = 0;
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const relativeFile = relativeFiles[index];

    try {
      if (!file || !relativeFile) {
        continue;
      }

      let source: string;
      try {
        source = await readFile(file, "utf8");
      } catch (error) {
        diagnostics.push({
          severity: "warning",
          file: relativeFile,
          message:
            error instanceof Error ? error.message : "failed to read file"
        });
        continue;
      }

      const extension = path.extname(file).toLowerCase();
      switch (extension) {
        case ".html":
        case ".htm":
        case ".svg":
          scanHtml({ file: relativeFile, source, context });
          break;
        case ".css":
          scanCss({ file: relativeFile, source, context });
          break;
        case ".js":
        case ".mjs":
        case ".cjs": {
          const sourceType =
            extension === ".mjs"
              ? "module"
              : extension === ".cjs"
                ? "script"
                : "unambiguous";
          const sourceMap = await loadSourceMap(file, source);
          if (sourceMap.warning) {
            diagnostics.push({
              severity: "warning",
              file: relativeFile,
              message: sourceMap.warning
            });
          }
          try {
            scanJs({
              file: relativeFile,
              source,
              context,
              sourceType,
              sourceMap: sourceMap.consumer
            });
          } finally {
            sourceMap.consumer?.destroy();
          }
          break;
        }
        default:
          break;
      }
    } finally {
      processed += 1;
      progress?.({
        phase: "scan",
        processed,
        total: files.length,
        file: relativeFile ?? ""
      });
    }
  }

  progress?.({
    phase: "done",
    processed,
    total: files.length
  });

  return {
    root: baseRoot,
    files: relativeFiles,
    features: catalog.results(),
    diagnostics
  };
}
