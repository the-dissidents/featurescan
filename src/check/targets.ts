import type { CompatDB } from "../compat/bcd";
import { parseVersion } from "../compat/support";
import type { BrowserTarget } from "./index";

export const DEFAULT_BROWSERS = [
  "chrome",
  "chrome_android",
  "edge",
  "firefox",
  "firefox_android",
  "safari",
  "safari_ios"
];

const BROWSER_ALIASES: Record<string, string> = {
  and_chr: "chrome_android",
  and_ff: "firefox_android",
  android: "chrome_android",
  "chrome-android": "chrome_android",
  "firefox-android": "firefox_android",
  ios: "safari_ios",
  "ios-safari": "safari_ios",
  "ios_safari": "safari_ios",
  samsung: "samsunginternet_android",
  webview: "webview_android"
};

export function resolveTargets(
  specs: string[],
  compat: CompatDB
): BrowserTarget[] {
  const rawSpecs =
    specs.length > 0
      ? specs.flatMap((spec) => spec.split(",")).filter(Boolean)
      : DEFAULT_BROWSERS;
  const browsers = new Set(compat.browserIds());
  const seen = new Set<string>();
  const targets: BrowserTarget[] = [];

  for (const rawSpec of rawSpecs) {
    const spec = rawSpec.trim();
    if (!spec) {
      continue;
    }

    const separator = spec.lastIndexOf("@");
    const rawBrowser = separator === -1 ? spec : spec.slice(0, separator);
    const rawVersion = separator === -1 ? "" : spec.slice(separator + 1);
    const browser = (
      BROWSER_ALIASES[rawBrowser.toLowerCase()] ?? rawBrowser
    ).toLowerCase();

    if (!browsers.has(browser)) {
      throw new Error(
        `unknown browser "${rawBrowser}". Available browsers: ${[...browsers]
          .sort()
          .join(", ")}`
      );
    }

    const version =
      rawVersion && rawVersion.toLowerCase() !== "latest"
        ? rawVersion
        : compat.latestVersion(browser);

    if (!version) {
      throw new Error(`could not determine a version for ${browser}`);
    }
    if (!parseVersion(version)) {
      throw new Error(`unrecognized version "${version}" for ${browser}`);
    }

    const identity = `${browser}@${version}`;
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    targets.push({ browser, version });
  }

  return targets;
}
