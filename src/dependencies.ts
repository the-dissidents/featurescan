export interface DependencyLocation {
  name: string;
  version?: string;
  subpath?: string;
}

export function normalizeSourcePath(value: string): string {
  const parts: string[] = [];

  for (const part of value.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  return parts.join("/");
}

function parsePnpmSegment(
  segment: string
): { name: string; version?: string } | undefined {
  if (!segment) {
    return undefined;
  }

  const versionStart = segment.startsWith("@")
    ? segment.indexOf("@", 1)
    : segment.indexOf("@");
  const encodedName =
    versionStart === -1 ? segment : segment.slice(0, versionStart);
  const versionPart =
    versionStart === -1 ? undefined : segment.slice(versionStart + 1);
  const name = encodedName.startsWith("@")
    ? encodedName.replace("+", "/")
    : encodedName;
  const version = versionPart?.split("_")[0] || undefined;

  if (!name || (name.startsWith("@") && !name.includes("/"))) {
    return undefined;
  }

  return { name, version };
}

function parsePackageAt(
  segments: string[],
  start: number
): { name: string; end: number } | undefined {
  const first = segments[start];
  if (!first) {
    return undefined;
  }

  if (first.startsWith("@")) {
    const second = segments[start + 1];
    if (!second) {
      return undefined;
    }
    return { name: `${first}/${second}`, end: start + 2 };
  }

  return { name: first, end: start + 1 };
}

function parsePlainNodeModules(
  segments: string[]
): DependencyLocation | undefined {
  const nodeModulesIndex = segments.lastIndexOf("node_modules");
  if (nodeModulesIndex === -1) {
    return undefined;
  }

  const pkg = parsePackageAt(segments, nodeModulesIndex + 1);
  if (!pkg) {
    return undefined;
  }

  const subpath = segments.slice(pkg.end).join("/");
  return {
    name: pkg.name,
    ...(subpath ? { subpath } : {})
  };
}

export function parseDependencyPath(
  source: string
): DependencyLocation | undefined {
  const segments = normalizeSourcePath(source).split("/").filter(Boolean);
  const pnpmIndex = segments.indexOf(".pnpm");

  if (pnpmIndex !== -1) {
    const encoded = segments[pnpmIndex + 1];
    const parsed = encoded ? parsePnpmSegment(encoded) : undefined;
    const nodeModulesIndex = segments.indexOf(
      "node_modules",
      pnpmIndex + 2
    );

    if (nodeModulesIndex !== -1) {
      const pkg = parsePackageAt(segments, nodeModulesIndex + 1);
      if (pkg) {
        const rest = segments.slice(pkg.end);
        if (rest.includes("node_modules")) {
          return parsePlainNodeModules(segments) ?? parsed;
        }

        const subpath = rest.join("/");
        return {
          name: parsed?.name ?? pkg.name,
          ...(parsed?.version ? { version: parsed.version } : {}),
          ...(subpath ? { subpath } : {})
        };
      }
    }

    if (parsed) {
      return parsed;
    }
  }

  return parsePlainNodeModules(segments);
}

export function formatDependency(
  dependency: DependencyLocation,
  showPath: boolean
): string {
  const label = dependency.version
    ? `${dependency.name} ${dependency.version}`
    : dependency.name;
  return showPath && dependency.subpath
    ? `${label} (${dependency.subpath})`
    : label;
}
