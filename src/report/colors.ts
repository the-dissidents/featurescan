export type Formatter = (
  value: string | number | null | undefined
) => string;

export interface Colors {
  enabled: boolean;
  bold: Formatter;
  dim: Formatter;
  red: Formatter;
  green: Formatter;
  yellow: Formatter;
  cyan: Formatter;
}

function supportsColor(stream: NodeJS.WriteStream): boolean {
  if ("NO_COLOR" in process.env) {
    return false;
  }
  if (process.argv.includes("--no-color")) {
    return false;
  }
  if (process.env.FORCE_COLOR === "0") {
    return false;
  }
  if (process.env.FORCE_COLOR) {
    return true;
  }
  return Boolean(stream.isTTY) && process.env.TERM !== "dumb";
}

export function createColors(stream: NodeJS.WriteStream): Colors {
  const enabled = supportsColor(stream);
  const wrap = (open: number, close: number): Formatter => (value) =>
    enabled ? `\u001b[${open}m${String(value)}\u001b[${close}m` : String(value);

  return {
    enabled,
    bold: wrap(1, 22),
    dim: wrap(2, 22),
    red: wrap(31, 39),
    green: wrap(32, 39),
    yellow: wrap(33, 39),
    cyan: wrap(36, 39)
  };
}
