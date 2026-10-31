import type { ScanProgress } from "../types";

function truncate(value: string, maxLength: number): string {
  if (maxLength <= 0) {
    return "";
  }
  if (value.length <= maxLength) {
    return value;
  }
  if (maxLength <= 3) {
    return value.slice(0, maxLength);
  }
  return `...${value.slice(value.length - maxLength + 3)}`;
}

export class ProgressBar {
  readonly #stream: NodeJS.WriteStream;
  readonly #enabled: boolean;
  #lastRender = 0;
  #stopped = false;

  constructor(stream: NodeJS.WriteStream, enabled: boolean) {
    this.#stream = stream;
    this.#enabled = enabled && Boolean(stream.isTTY);
  }

  update(progress: ScanProgress): void {
    if (!this.#enabled || this.#stopped) {
      return;
    }

    if (progress.phase === "discover") {
      this.#render("Collecting files...");
      return;
    }

    if (progress.phase === "done") {
      this.stop();
      return;
    }

    const now = Date.now();
    if (now - this.#lastRender < 50 && progress.processed < progress.total) {
      return;
    }
    this.#lastRender = now;

    const columns =
      this.#stream.columns && this.#stream.columns > 0
        ? this.#stream.columns
        : 80;
    const barWidth = Math.max(12, Math.min(36, columns - 36));
    const total = Math.max(progress.total, 1);
    const ratio = Math.min(1, progress.processed / total);
    const filled = Math.round(barWidth * ratio);
    const bar = `${"#".repeat(filled)}${"-".repeat(barWidth - filled)}`;
    const count =
      progress.total > 0 ? `${progress.processed}/${progress.total}` : "";
    const available = Math.max(0, columns - barWidth - count.length - 8);
    const file = progress.file
      ? ` ${truncate(progress.file, available)}`
      : "";

    this.#render(`[${bar}] ${count}${file}`);
  }

  stop(): void {
    if (!this.#enabled || this.#stopped) {
      return;
    }
    this.#stopped = true;
    this.#stream.write("\r\u001b[2K");
  }

  #render(text: string): void {
    this.#stream.write(`\r\u001b[2K${text}`);
  }
}
