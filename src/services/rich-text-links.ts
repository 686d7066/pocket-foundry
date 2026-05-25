export type RichTextReference = {
  uuid: string;
  label: string;
};

export type RichTextSummary = {
  text: string;
  references: RichTextReference[];
};

type RichTextEnricher = (content: string, options?: Record<string, unknown>) => Promise<string> | string;

export async function summarizeRichTextWithReferences(
  content: string,
  options: {
    enrichHtml?: RichTextEnricher;
    relativeTo?: unknown;
    maxLength?: number;
    maxSentences?: number;
  } = {}
): Promise<RichTextSummary> {
  if (!content.trim()) return { text: "", references: [] };

  const enriched = await enrichRichText(content, options.enrichHtml, options.relativeTo);
  const references = extractRichTextReferences(enriched, content);
  const plainText = collapseWhitespace(stripRichTextMarkup(enriched));
  if (!plainText) return { text: "", references };

  const examples = plainText.match(/\bExamples?:\s*[^.?!]+[.?!]?/i)?.[0];
  if (examples) return { text: examples, references };

  const sentenceCount = clampNumber(options.maxSentences ?? 2, 1, 4);
  const excerpt = (plainText.match(/[^.?!]+[.?!]?/g) ?? [])
    .map(sentence => sentence.trim())
    .filter(Boolean)
    .slice(0, sentenceCount)
    .join(" ");
  const maxLength = clampNumber(options.maxLength ?? 320, 80, 1200);
  return {
    text: excerpt.length > maxLength ? `${excerpt.slice(0, maxLength - 3).trimEnd()}...` : excerpt,
    references
  };
}

export function extractRichTextReferences(value: string, fallbackRaw = ""): RichTextReference[] {
  const references: RichTextReference[] = [];
  const seen = new Set<string>();

  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let anchorMatch: RegExpExecArray | null = anchorPattern.exec(value);
  while (anchorMatch) {
    const attributes = anchorMatch[1] ?? "";
    const uuid = attributes.match(/\bdata-uuid=(["'])(.*?)\1/i)?.[2]?.trim() ?? "";
    if (uuid && !seen.has(uuid)) {
      seen.add(uuid);
      const label = collapseWhitespace(stripRichTextMarkup(anchorMatch[2] ?? ""));
      references.push({ uuid, label: label || "Open Reference" });
    }
    anchorMatch = anchorPattern.exec(value);
  }

  const fallbackPattern = /@UUID\[([^\]]+)\](?:\{([^}]+)\})?/gi;
  let fallbackMatch: RegExpExecArray | null = fallbackPattern.exec(fallbackRaw || value);
  while (fallbackMatch) {
    const uuid = (fallbackMatch[1] ?? "").trim();
    const label = (fallbackMatch[2] ?? "").trim();
    if (uuid && !seen.has(uuid)) {
      seen.add(uuid);
      references.push({ uuid, label: label || "Open Reference" });
    }
    fallbackMatch = fallbackPattern.exec(fallbackRaw || value);
  }

  return references;
}

export function stripRichTextMarkup(value: string): string {
  return value
    .replace(/@\w+\[[^\]]+\]\{([^}]+)\}/g, "$1")
    .replace(/@\w+\[[^\]]+\]/g, " ")
    .replace(/\[\[\/[^\]]+\]\]/g, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .trim();
}

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

async function enrichRichText(content: string, enrichHtml?: RichTextEnricher, relativeTo?: unknown): Promise<string> {
  if (!enrichHtml) return content;

  try {
    return await Promise.resolve(enrichHtml(content, {
      async: true,
      documents: true,
      links: true,
      embeds: false,
      rolls: false,
      custom: true,
      secrets: false,
      relativeTo
    }));
  } catch {
    return content;
  }
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}
