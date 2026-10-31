export interface SupportFlag {
  type: "preference" | "runtime_flag";
  name: string;
  value_to_set?: string;
}

export interface SupportStatement {
  version_added: string | true | false | null;
  version_removed?: string | true | false;
  version_last?: string | true | false;
  partial_implementation?: boolean;
  alternative_name?: string;
  prefix?: string;
  flags?: SupportFlag[];
  notes?: string | string[];
}

export interface CompatStatus {
  deprecated?: boolean;
  experimental?: boolean;
  standard_track?: boolean;
}

export interface CompatStatement {
  support: Record<string, SupportStatement | SupportStatement[]>;
  status?: CompatStatus;
  mdn_url?: string;
  spec_url?: string | string[];
}

export interface BcdNode {
  __compat?: CompatStatement;
  [key: string]: unknown;
}

export interface BrowserRelease {
  status?: string;
  index?: number;
  release_date?: string;
}

export interface BrowserData {
  name: string;
  releases?: Record<string, BrowserRelease>;
}

export interface BcdData {
  __meta: { version: string };
  browsers: Record<string, BrowserData>;
  api: BcdNode;
  css: BcdNode;
  html: BcdNode;
  javascript: BcdNode;
  mathml: BcdNode;
  svg: BcdNode;
  webassembly?: BcdNode;
  [key: string]: unknown;
}
