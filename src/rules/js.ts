export const MODERN_BUILTIN_GLOBALS = new Set([
  "AsyncDisposableStack",
  "AsyncIterator",
  "Atomics",
  "BigInt",
  "DisposableStack",
  "FinalizationRegistry",
  "Iterator",
  "SharedArrayBuffer",
  "SuppressedError",
  "Temporal",
  "WeakRef"
]);

export const GLOBAL_OBJECT_INTERFACES: Record<string, string> = {
  CSS: "CSS",
  caches: "CacheStorage",
  console: "console",
  crypto: "Crypto",
  customElements: "CustomElementRegistry",
  document: "Document",
  globalThis: "Window",
  history: "History",
  indexedDB: "IDBFactory",
  localStorage: "Storage",
  location: "Location",
  navigator: "Navigator",
  performance: "Performance",
  screen: "Screen",
  self: "Window",
  sessionStorage: "Storage",
  visualViewport: "VisualViewport",
  window: "Window"
};

export const GLOBAL_PATHS: Record<string, string> = {
  "crypto.subtle": "SubtleCrypto",
  "document.fonts": "FontFaceSet",
  "document.timeline": "DocumentTimeline",
  "navigator.clipboard": "Clipboard",
  "navigator.connection": "NetworkInformation",
  "navigator.credentials": "CredentialsContainer",
  "navigator.geolocation": "Geolocation",
  "navigator.locks": "LockManager",
  "navigator.mediaDevices": "MediaDevices",
  "navigator.permissions": "Permissions",
  "navigator.scheduling": "Scheduling",
  "navigator.serviceWorker": "ServiceWorkerContainer",
  "navigator.storage": "StorageManager",
  "navigator.userAgentData": "NavigatorUAData",
  "navigator.wakeLock": "WakeLock",
  "screen.orientation": "ScreenOrientation"
};

export interface InterfaceMemberCandidate {
  interfaceName: string;
  property: string;
}

export const INSTANCE_API_METHODS: Record<string, InterfaceMemberCandidate[]> = {
  addEventListener: [
    { interfaceName: "EventTarget", property: "addEventListener" }
  ],
  animate: [{ interfaceName: "Element", property: "animate" }],
  attachInternals: [{ interfaceName: "HTMLElement", property: "attachInternals" }],
  attachShadow: [{ interfaceName: "Element", property: "attachShadow" }],
  checkVisibility: [{ interfaceName: "Element", property: "checkVisibility" }],
  closest: [{ interfaceName: "Element", property: "closest" }],
  getAnimations: [{ interfaceName: "Element", property: "getAnimations" }],
  hasPointerCapture: [{ interfaceName: "Element", property: "hasPointerCapture" }],
  hidePopover: [{ interfaceName: "HTMLElement", property: "hidePopover" }],
  matches: [{ interfaceName: "Element", property: "matches" }],
  moveBefore: [
    { interfaceName: "Element", property: "moveBefore" },
    { interfaceName: "Document", property: "moveBefore" }
  ],
  releasePointerCapture: [
    { interfaceName: "Element", property: "releasePointerCapture" }
  ],
  removeEventListener: [
    { interfaceName: "EventTarget", property: "removeEventListener" }
  ],
  requestFullscreen: [
    { interfaceName: "Element", property: "requestFullscreen" }
  ],
  requestPointerLock: [
    { interfaceName: "Element", property: "requestPointerLock" }
  ],
  setHTMLUnsafe: [{ interfaceName: "Element", property: "setHTMLUnsafe" }],
  setPointerCapture: [{ interfaceName: "Element", property: "setPointerCapture" }],
  showModal: [{ interfaceName: "HTMLDialogElement", property: "showModal" }],
  showPicker: [{ interfaceName: "HTMLInputElement", property: "showPicker" }],
  showPopover: [{ interfaceName: "HTMLElement", property: "showPopover" }],
  startViewTransition: [
    { interfaceName: "Document", property: "startViewTransition" }
  ],
  togglePopover: [{ interfaceName: "HTMLElement", property: "togglePopover" }]
};

export interface BuiltinMemberCandidate {
  owner: string;
  property: string;
}

export const INSTANCE_BUILTIN_METHODS: Record<string, BuiltinMemberCandidate[]> = {
  at: [
    { owner: "Array", property: "at" },
    { owner: "String", property: "at" }
  ],
  findLast: [{ owner: "Array", property: "findLast" }],
  findLastIndex: [{ owner: "Array", property: "findLastIndex" }],
  flat: [{ owner: "Array", property: "flat" }],
  flatMap: [{ owner: "Array", property: "flatMap" }],
  getOrInsert: [{ owner: "Map", property: "getOrInsert" }],
  getOrInsertComputed: [{ owner: "Map", property: "getOrInsertComputed" }],
  isWellFormed: [{ owner: "String", property: "isWellFormed" }],
  replaceAll: [{ owner: "String", property: "replaceAll" }],
  toReversed: [{ owner: "Array", property: "toReversed" }],
  toSorted: [{ owner: "Array", property: "toSorted" }],
  toSpliced: [{ owner: "Array", property: "toSpliced" }],
  toWellFormed: [{ owner: "String", property: "toWellFormed" }],
  with: [{ owner: "Array", property: "with" }]
};

export const GLOBAL_FUNCTION_KEYS: Record<string, InterfaceMemberCandidate> = {
  addEventListener: {
    interfaceName: "EventTarget",
    property: "addEventListener"
  },
  removeEventListener: {
    interfaceName: "EventTarget",
    property: "removeEventListener"
  }
};

export const WINDOW_GLOBAL_FUNCTIONS = new Set([
  "alert",
  "atob",
  "blur",
  "btoa",
  "cancelAnimationFrame",
  "cancelIdleCallback",
  "captureEvents",
  "clearInterval",
  "clearTimeout",
  "close",
  "confirm",
  "find",
  "focus",
  "getComputedStyle",
  "getSelection",
  "matchMedia",
  "moveBy",
  "moveTo",
  "open",
  "postMessage",
  "print",
  "prompt",
  "queueMicrotask",
  "releaseEvents",
  "requestAnimationFrame",
  "requestIdleCallback",
  "resizeBy",
  "resizeTo",
  "scroll",
  "scrollBy",
  "scrollTo",
  "setInterval",
  "setTimeout",
  "stop"
]);

export const SPECIAL_GLOBAL_KEYS: Record<string, string> = {
  WebAssembly: "webassembly.api"
};
