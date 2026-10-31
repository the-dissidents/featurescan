import { describe, expect, it } from "vitest";
import { createColors } from "../src/report/colors";
import { ProgressBar } from "../src/report/progress";

class FakeStream {
  isTTY = true;
  columns = 80;
  output = "";

  write(chunk: string): boolean {
    this.output += chunk;
    return true;
  }
}

describe("ProgressBar", () => {
  it("renders and clears a progress bar", () => {
    const stream = new FakeStream();
    const bar = new ProgressBar(stream as unknown as NodeJS.WriteStream, true);

    bar.update({ phase: "discover", processed: 0, total: 0 });
    bar.update({ phase: "scan", processed: 1, total: 2, file: "app.js" });
    bar.update({ phase: "done", processed: 2, total: 2 });

    expect(stream.output).toContain("Collecting files...");
    expect(stream.output).toContain("1/2");
    expect(stream.output).toContain("app.js");
    expect(stream.output).toContain("\r\u001b[2K");
  });

  it("does nothing when disabled or not a TTY", () => {
    const disabledStream = new FakeStream();
    new ProgressBar(disabledStream as unknown as NodeJS.WriteStream, false).update(
      { phase: "scan", processed: 1, total: 2 }
    );
    expect(disabledStream.output).toBe("");

    const nonTty = new FakeStream();
    nonTty.isTTY = false;
    new ProgressBar(nonTty as unknown as NodeJS.WriteStream, true).update({
      phase: "scan",
      processed: 1,
      total: 2
    });
    expect(nonTty.output).toBe("");
  });
});

describe("createColors", () => {
  it("colors output based on the destination stream", () => {
    const previousNoColor = process.env.NO_COLOR;
    const previousForceColor = process.env.FORCE_COLOR;
    const previousTerm = process.env.TERM;
    delete process.env.NO_COLOR;
    delete process.env.FORCE_COLOR;
    process.env.TERM = "xterm";

    try {
      const tty = new FakeStream();
      const colors = createColors(tty as unknown as NodeJS.WriteStream);
      expect(colors.enabled).toBe(true);
      expect(colors.bold("x")).toBe("\u001b[1mx\u001b[22m");

      const nonTty = new FakeStream();
      nonTty.isTTY = false;
      const plain = createColors(nonTty as unknown as NodeJS.WriteStream);
      expect(plain.enabled).toBe(false);
      expect(plain.bold("x")).toBe("x");
    } finally {
      if (previousNoColor === undefined) {
        delete process.env.NO_COLOR;
      } else {
        process.env.NO_COLOR = previousNoColor;
      }
      if (previousForceColor === undefined) {
        delete process.env.FORCE_COLOR;
      } else {
        process.env.FORCE_COLOR = previousForceColor;
      }
      if (previousTerm === undefined) {
        delete process.env.TERM;
      } else {
        process.env.TERM = previousTerm;
      }
    }
  });
});
