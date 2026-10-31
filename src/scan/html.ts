import {
  parse,
  type DefaultTreeAdapterTypes
} from "parse5";
import type { Namespace } from "../compat/bcd";
import type { ScanContext } from "./context";
import { addFeature, warn } from "./context";
import { scanCss } from "./css";
import { scanJs } from "./js";
import { LineMap, makeUsage } from "./source";

const XHTML_NS = "http://www.w3.org/1999/xhtml";
const SVG_NS = "http://www.w3.org/2000/svg";
const MATHML_NS = "http://www.w3.org/1998/Math/MathML";

const EVENT_HANDLER_ATTRIBUTES = new Set([
  "onabort",
  "onafterprint",
  "onanimationend",
  "onanimationiteration",
  "onanimationstart",
  "onauxclick",
  "onbeforeinput",
  "onbeforeprint",
  "onbeforeunload",
  "onblur",
  "oncancel",
  "oncanplay",
  "oncanplaythrough",
  "onchange",
  "onclick",
  "onclose",
  "oncontextmenu",
  "oncopy",
  "oncut",
  "ondblclick",
  "ondrag",
  "ondragend",
  "ondragenter",
  "ondragleave",
  "ondragover",
  "ondragstart",
  "ondrop",
  "ondurationchange",
  "onended",
  "onerror",
  "onfocus",
  "onformdata",
  "oninput",
  "oninvalid",
  "onkeydown",
  "onkeypress",
  "onkeyup",
  "onload",
  "onloadeddata",
  "onloadedmetadata",
  "onloadstart",
  "onmessage",
  "onmousedown",
  "onmouseenter",
  "onmouseleave",
  "onmousemove",
  "onmouseout",
  "onmouseover",
  "onmouseup",
  "onoffline",
  "ononline",
  "onpagehide",
  "onpageshow",
  "onpaste",
  "onpause",
  "onplay",
  "onplaying",
  "onpointercancel",
  "onpointerdown",
  "onpointerenter",
  "onpointerleave",
  "onpointermove",
  "onpointerout",
  "onpointerover",
  "onpointerup",
  "onpopstate",
  "onprogress",
  "onratechange",
  "onreset",
  "onresize",
  "onscroll",
  "onscrollend",
  "onsecuritypolicyviolation",
  "onseeked",
  "onseeking",
  "onselect",
  "onslotchange",
  "onstalled",
  "onsubmit",
  "onsuspend",
  "ontimeupdate",
  "ontoggle",
  "ontouchcancel",
  "ontouchend",
  "ontouchmove",
  "ontouchstart",
  "ontransitionend",
  "onunload",
  "onvolumechange",
  "onwaiting",
  "onwheel"
]);

export interface HtmlScanInput {
  file: string;
  source: string;
  context: ScanContext;
}

function namespaceFor(namespaceURI: string): Namespace | undefined {
  switch (namespaceURI) {
    case XHTML_NS:
      return "html";
    case SVG_NS:
      return "svg";
    case MATHML_NS:
      return "mathml";
    default:
      return undefined;
  }
}

function isElement(
  node: DefaultTreeAdapterTypes.Node
): node is DefaultTreeAdapterTypes.Element {
  return "tagName" in node;
}

function getAttribute(
  element: DefaultTreeAdapterTypes.Element,
  name: string
): string | undefined {
  const lower = name.toLowerCase();
  return element.attrs.find(
    (attribute) =>
      attribute.name === name || attribute.name.toLowerCase() === lower
  )?.value;
}

const MULTI_TOKEN_VALUE_ATTRIBUTES = new Set([
  "autocomplete",
  "rel",
  "sandbox"
]);

const JAVASCRIPT_MIME_TYPES = new Set([
  "text/javascript",
  "application/javascript",
  "text/ecmascript",
  "application/ecmascript",
  "application/x-ecmascript",
  "text/jscript",
  "text/livescript",
  "text/x-ecmascript",
  "text/x-javascript",
  "application/x-javascript"
]);

function isJavaScriptType(type: string | undefined): boolean {
  if (type === undefined) {
    return true;
  }
  const normalized = type.split(";")[0]?.trim().toLowerCase() ?? "";
  return !normalized || normalized === "module" || JAVASCRIPT_MIME_TYPES.has(normalized);
}

function isCssType(type: string | undefined): boolean {
  if (type === undefined) {
    return true;
  }
  const normalized = type.split(";")[0]?.trim().toLowerCase() ?? "";
  return !normalized || normalized === "text/css";
}

function findAttributeValueOffset(
  source: string,
  location: { startOffset: number; endOffset: number } | undefined
): number | undefined {
  if (!location) {
    return undefined;
  }
  const raw = source.slice(location.startOffset, location.endOffset);
  const equals = raw.indexOf("=");
  if (equals === -1) {
    return undefined;
  }
  let index = equals + 1;
  while (index < raw.length && /\s/.test(raw[index] ?? "")) {
    index += 1;
  }
  if (raw[index] === '"' || raw[index] === "'") {
    index += 1;
  }
  return location.startOffset + index;
}

export function scanHtml(input: HtmlScanInput): void {
  const { file, source, context } = input;
  const lineMap = new LineMap(source);

  let document: DefaultTreeAdapterTypes.Document;
  try {
    document = parse(source, {
      sourceCodeLocationInfo: true,
      onParseError: (error) => {
        warn(
          context,
          file,
          `${error.code} at ${error.startLine}:${error.startCol}`
        );
      }
    });
  } catch (error) {
    warn(
      context,
      file,
      error instanceof Error ? error.message : "failed to parse HTML"
    );
    return;
  }

  const addAt = (
    key: string | undefined,
    line: number,
    column: number
  ) => {
    addFeature(
      context,
      key,
      "html",
      makeUsage(file, line, column, source, line, column)
    );
  };

  const processElement = (element: DefaultTreeAdapterTypes.Element) => {
    const namespace = namespaceFor(element.namespaceURI);
    if (!namespace) {
      return;
    }

    const elementLocation = element.sourceCodeLocation;
    if (elementLocation) {
      addAt(
        context.compat.resolveTag(namespace, element.tagName),
        elementLocation.startLine,
        elementLocation.startCol
      );
    }

    const attributeLocations = elementLocation?.attrs;
    for (const attribute of element.attrs) {
      const attributeLocation = attributeLocations?.[attribute.name];
      const attributeLine =
        attributeLocation?.startLine ?? elementLocation?.startLine;
      const attributeColumn =
        attributeLocation?.startCol ?? elementLocation?.startCol;

      if (attributeLine !== undefined && attributeColumn !== undefined) {
        for (const key of context.compat.attributePresenceKeys(
          namespace,
          element.tagName,
          attribute.name
        )) {
          addAt(key, attributeLine, attributeColumn);
        }
      }

      const valueOffset = findAttributeValueOffset(source, attributeLocation);
      const valuePosition =
        valueOffset !== undefined ? lineMap.locationAt(valueOffset) : undefined;
      const valueKeys: string[] = [];
      if (attribute.value) {
        const values = MULTI_TOKEN_VALUE_ATTRIBUTES.has(
          attribute.name.toLowerCase()
        )
          ? attribute.value.split(/\s+/).filter(Boolean)
          : [attribute.value];
        for (const value of values) {
          valueKeys.push(
            ...context.compat.attributeValueKeys(
              namespace,
              element.tagName,
              attribute.name,
              value
            )
          );
        }
      }

      for (const key of valueKeys) {
        if (valuePosition) {
          addAt(key, valuePosition.line, valuePosition.column);
        } else if (attributeLine !== undefined && attributeColumn !== undefined) {
          addAt(key, attributeLine, attributeColumn);
        }
      }

      const normalizedName = attribute.name.toLowerCase();
      if (normalizedName === "style" && attribute.value) {
        scanCss({
          file,
          source: attribute.value,
          context,
          mode: "declarationList",
          base: valuePosition
            ? {
                offset: valueOffset ?? 0,
                line: valuePosition.line,
                column: valuePosition.column
              }
            : undefined
        });
      } else if (
        EVENT_HANDLER_ATTRIBUTES.has(normalizedName) &&
        attribute.value
      ) {
        scanJs({
          file,
          source: attribute.value,
          context,
          sourceType: "script",
          allowReturnOutsideFunction: true,
          base: valuePosition
            ? {
                offset: valueOffset ?? 0,
                line: valuePosition.line,
                column: valuePosition.column
              }
            : undefined
        });
      }
    }

    if (namespace === "html" && element.tagName.toLowerCase() === "script") {
      const scriptType = getAttribute(element, "type");
      const src = getAttribute(element, "src");
      if (!src && isJavaScriptType(scriptType)) {
        const text = element.childNodes.find(
          (child): child is DefaultTreeAdapterTypes.TextNode =>
            child.nodeName === "#text"
        );
        const location = text?.sourceCodeLocation;
        if (text && location) {
          scanJs({
            file,
            source: text.value,
            context,
            sourceType:
              scriptType?.trim().toLowerCase() === "module"
                ? "module"
                : "script",
            base: {
              offset: location.startOffset,
              line: location.startLine,
              column: location.startCol
            }
          });
        }
      }
    }

    if (element.tagName.toLowerCase() === "style") {
      const styleType = getAttribute(element, "type");
      if (isCssType(styleType)) {
        const text = element.childNodes.find(
          (child): child is DefaultTreeAdapterTypes.TextNode =>
            child.nodeName === "#text"
        );
        const location = text?.sourceCodeLocation;
        if (text && location) {
          scanCss({
            file,
            source: text.value,
            context,
            base: {
              offset: location.startOffset,
              line: location.startLine,
              column: location.startCol
            }
          });
        }
      }
    }
  };

  const visit = (node: DefaultTreeAdapterTypes.Node) => {
    if (isElement(node)) {
      processElement(node);
    }
    if ("content" in node && node.content) {
      for (const child of node.content.childNodes) {
        visit(child);
      }
    }
    if ("childNodes" in node) {
      for (const child of node.childNodes) {
        visit(child);
      }
    }
  };

  visit(document);
}
