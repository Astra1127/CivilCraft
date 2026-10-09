export interface ParsedPlayerName {
  text: string;
  color?: string;
}

/** Parse only Unity's leading six-digit name color, not general rich text. */
export function parsePlayerName(
  rawName: string | null | undefined,
  fallback = "Engineer",
): ParsedPlayerName {
  if (typeof rawName !== "string" || !rawName.trim()) return { text: fallback };

  const prefix = /^<#([0-9a-f]{6})>/i.exec(rawName);
  if (!prefix) return { text: rawName };

  let text = rawName.slice(prefix[0].length);
  const closingTag = "</color>";
  if (text.slice(-closingTag.length).toLowerCase() === closingTag) {
    text = text.slice(0, -closingTag.length);
  }

  if (!text.trim()) return { text: fallback };
  return { text, color: `#${prefix[1]}` };
}
