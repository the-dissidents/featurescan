import type { Usage } from "../types";

export function snippetFor(
  source: string,
  line: number,
  column: number
): string | undefined {
  const text = source.split("\n")[line - 1];
  if (!text) {
    return undefined;
  }
  const start = Math.max(0, column - 1);
  const snippet = text.slice(start, start + 120).trim();
  return snippet.length > 0 ? snippet : undefined;
}

export function makeUsage(
  file: string,
  line: number,
  column: number,
  snippetSource: string | undefined,
  snippetLine: number,
  snippetColumn = column
): Usage {
  const snippet = snippetSource
    ? snippetFor(snippetSource, snippetLine, snippetColumn)
    : undefined;
  return snippet ? { file, line, column, snippet } : { file, line, column };
}

export class LineMap {
  readonly #starts: number[];
  readonly #length: number;

  constructor(source: string) {
    const starts = [0];
    for (let index = 0; index < source.length; index += 1) {
      if (source[index] === "\n") {
        starts.push(index + 1);
      }
    }
    this.#starts = starts;
    this.#length = source.length;
  }

  locationAt(offset: number): { line: number; column: number } {
    const clamped = Math.max(0, Math.min(offset, this.#length));
    let low = 0;
    let high = this.#starts.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const start = this.#starts[mid] ?? 0;
      if (start <= clamped) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    const index = Math.max(0, high);
    return {
      line: index + 1,
      column: clamped - (this.#starts[index] ?? 0) + 1
    };
  }
}
