import { compareStrings } from "../util";
import type { CompatStatement, SupportStatement } from "./types";

export type SupportState =
  | "supported"
  | "unsupported"
  | "unknown"
  | "partial"
  | "flagged"
  | "prefixed"
  | "alternative";

export interface SupportEvaluation {
  state: SupportState;
  added?: SupportStatement["version_added"];
  removed?: SupportStatement["version_removed"];
  partial?: boolean;
  flags?: string[];
  prefix?: string;
  prefixes?: string[];
  alternativeName?: string;
  reason?: string;
}

interface ParsedVersion {
  parts: number[];
  special: number;
}

const STATE_RANK: Record<SupportState, number> = {
  supported: 0,
  partial: 1,
  flagged: 2,
  prefixed: 3,
  alternative: 4,
  unknown: 5,
  unsupported: 6
};

const SPECIAL_VERSION = Number.MAX_SAFE_INTEGER;

export function parseVersion(value: string): ParsedVersion | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const cleaned = trimmed.replace(/^[≤≥<>=\s]+/, "");
  if (/^(tp|preview|latest)$/i.test(cleaned)) {
    return { parts: [SPECIAL_VERSION], special: 1 };
  }
  if (/^all$/i.test(cleaned)) {
    return { parts: [0], special: 0 };
  }
  if (!/^\d/.test(cleaned)) {
    return undefined;
  }

  const parts = cleaned
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));

  return parts.length > 0 ? { parts, special: 0 } : undefined;
}

export function compareVersions(a: string, b: string): number | undefined {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) {
    return undefined;
  }

  if (left.special !== right.special) {
    return left.special - right.special;
  }

  const length = Math.max(left.parts.length, right.parts.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.parts[index] ?? 0;
    const rightPart = right.parts[index] ?? 0;
    if (leftPart !== rightPart) {
      return leftPart - rightPart;
    }
  }
  return 0;
}

function statementsFor(
  compat: CompatStatement | undefined,
  browser: string
): SupportStatement[] {
  const support = compat?.support?.[browser];
  if (!support) {
    return [];
  }
  return Array.isArray(support) ? support : [support];
}

function normalizeAdded(
  value: SupportStatement["version_added"]
): string | undefined {
  if (value === true) {
    return "0";
  }
  if (value === false || value === null) {
    return undefined;
  }
  return value;
}

function normalizeRemoved(
  value: SupportStatement["version_removed"]
): string | true | undefined {
  if (value === undefined || value === false || value === null) {
    return undefined;
  }
  return value;
}

function evaluateStatement(
  statement: SupportStatement,
  targetVersion: string
): SupportEvaluation | undefined {
  const added = normalizeAdded(statement.version_added);
  if (!added) {
    return undefined;
  }

  const removed = normalizeRemoved(statement.version_removed);
  if (removed) {
    if (removed === true) {
      return undefined;
    }
    const removedComparison = compareVersions(targetVersion, removed);
    if (removedComparison !== undefined && removedComparison >= 0) {
      return undefined;
    }
  }

  const addedComparison = compareVersions(targetVersion, added);
  if (addedComparison === undefined || addedComparison < 0) {
    return undefined;
  }

  const flags = statement.flags?.map((flag) => flag.name);
  let state: SupportState = "supported";
  if (flags && flags.length > 0) {
    state = "flagged";
  } else if (statement.prefix) {
    state = "prefixed";
  } else if (statement.alternative_name) {
    state = "alternative";
  } else if (statement.partial_implementation) {
    state = "partial";
  }

  return {
    state,
    added: statement.version_added,
    removed: statement.version_removed,
    partial: statement.partial_implementation,
    flags,
    prefix: statement.prefix,
    alternativeName: statement.alternative_name
  };
}

export function evaluateSupport(
  compat: CompatStatement | undefined,
  browser: string,
  targetVersion: string
): SupportEvaluation {
  if (!compat) {
    return { state: "unknown", reason: "feature is not present in the compatibility data" };
  }

  const statements = statementsFor(compat, browser);
  if (statements.length === 0) {
    return { state: "unknown", reason: `no compatibility data for ${browser}` };
  }

  if (!parseVersion(targetVersion)) {
    return { state: "unknown", reason: `unrecognized version ${targetVersion}` };
  }

  let best: SupportEvaluation | undefined;
  const qualifyingPrefixes = new Set<string>();
  for (const statement of statements) {
    const evaluation = evaluateStatement(statement, targetVersion);
    if (!evaluation) {
      continue;
    }
    if (evaluation.prefix) {
      qualifyingPrefixes.add(evaluation.prefix);
    }
    if (evaluation.state === "supported") {
      return evaluation;
    }
    if (!best || STATE_RANK[evaluation.state] < STATE_RANK[best.state]) {
      best = evaluation;
    }
  }

  if (best) {
    return {
      ...best,
      prefixes:
        qualifyingPrefixes.size > 0
          ? [...qualifyingPrefixes].sort(compareStrings)
          : undefined
    };
  }

  const first = statements[0];
  return {
    state: "unsupported",
    added: first ? normalizeAdded(first.version_added) : undefined,
    removed: first ? normalizeRemoved(first.version_removed) : undefined
  };
}
