export type RichTextHtmlEnricher = (content: string, options?: Record<string, unknown>) => Promise<string> | string;
export type RichTextDescriptionRow = { id: string; uuid: string; description: string };
export type RichTextRelativeDocument = { id?: string; _id?: string; uuid?: string };

/**
 * Enriches Foundry rich text and, by default, strips roll/check/save interactivity.
 *
 * `enableRollActions` defaults to `false` because Pocket Foundry currently treats these panes as
 * read-only utility surfaces; preserving roll triggers would introduce accidental roll execution.
 */
export async function enrichHtml(
  content: string,
  options: {
    enrichHtml?: RichTextHtmlEnricher;
    relativeTo?: unknown;
    secrets?: boolean;
    enableRollActions?: boolean;
  } = {}
): Promise<string> {
  if (!content.trim()) return "";
  const enrichHtml = options.enrichHtml;
  if (!enrichHtml) return content;

  try {
    const enriched = await Promise.resolve(enrichHtml(content, {
      async: true,
      relativeTo: options.relativeTo,
      secrets: options.secrets === true
    }));
    if (typeof enriched !== "string") return content;
    return options.enableRollActions === true ? enriched : demoteRollActionLinks(enriched);
  } catch {
    return content;
  }
}

export async function enrichDescriptionRows<Row extends RichTextDescriptionRow, Document extends RichTextRelativeDocument>(
  rows: Row[],
  documents: Document[],
  options: {
    enrichHtml?: RichTextHtmlEnricher;
    secrets?: boolean;
    enableRollActions?: boolean;
  } = {}
): Promise<Row[]> {
  if (rows.length === 0) return rows;
  const identityMap = buildDocumentIdentityMap(documents);

  return Promise.all(rows.map(async row => ({
    ...row,
    description: await enrichHtml(row.description, {
      enrichHtml: options.enrichHtml,
      relativeTo: identityMap.get(row.id) ?? identityMap.get(row.uuid) ?? null,
      secrets: options.secrets === true,
      enableRollActions: options.enableRollActions === true
    })
  })));
}

export async function enrichSectionRows<
  Section,
  Row extends RichTextDescriptionRow,
  Document extends RichTextRelativeDocument
>(
  sections: Section[],
  options: {
    getRows: (section: Section) => Row[];
    setRows: (section: Section, rows: Row[]) => Section;
    documents: Document[];
    enrichHtml?: RichTextHtmlEnricher;
    secrets?: boolean;
    enableRollActions?: boolean;
  }
): Promise<Section[]> {
  if (sections.length === 0) return sections;
  return Promise.all(sections.map(async section => {
    const rows = await enrichDescriptionRows(options.getRows(section), options.documents, {
      enrichHtml: options.enrichHtml,
      secrets: options.secrets,
      enableRollActions: options.enableRollActions
    });
    return options.setRows(section, rows);
  }));
}

export function demoteRollActionLinks(html: string): string {
  const demotedReferences = demoteReferenceEnricherLinks(html);
  const demotedAnchors = demotedReferences.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (fullMatch, rawAttributes, rawContent) => {
    const attributes = typeof rawAttributes === "string" ? rawAttributes : "";
    if (hasContentLinkTarget(attributes)) return fullMatch;
    if (!isRollActionAnchor(attributes)) return fullMatch;
    const text = rawContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return text ? `<span class="inline-roll-text">${text}</span>` : "";
  });

  return demotedAnchors.replace(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi, (fullMatch, rawAttributes, rawContent) => {
    const attributes = typeof rawAttributes === "string" ? rawAttributes : "";
    if (!isRollActionButton(attributes)) return fullMatch;
    const text = rawContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return text ? `<span class="inline-roll-text">${text}</span>` : "";
  });
}

function demoteReferenceEnricherLinks(html: string): string {
  return html.replace(
    /<enriched-content\b([^>]*)\benricher=(["'])[^"']*reference[^"']*\2([^>]*)>([\s\S]*?)<\/enriched-content>/gi,
    (_fullMatch, _leftAttrs, _quote, _rightAttrs, innerHtml: string) =>
      innerHtml.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (_anchorMatch, content: string) => {
        const text = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        return text ? `<span class="inline-roll-text">${text}</span>` : "";
      })
  );
}

function hasContentLinkTarget(attributes: string): boolean {
  if (/\bdata-uuid=(["']).*?\1/i.test(attributes)) return true;
  const href = attributes.match(/\bhref=(["'])(.*?)\1/i)?.[2]?.trim() ?? "";
  if (!href) return false;
  const normalized = href.toLocaleLowerCase();
  return normalized.startsWith("http://") || normalized.startsWith("https://") || normalized.startsWith("mailto:");
}

function isRollActionAnchor(attributes: string): boolean {
  if (!attributes) return false;
  const classes = attributes.match(/\bclass=(["'])(.*?)\1/i)?.[2]?.toLocaleLowerCase() ?? "";
  if (/\binline-roll\b/.test(classes)) return true;
  if (/\broll\b/.test(classes) || /\bcheck\b/.test(classes) || /\bsave\b/.test(classes)) return true;
  const action = attributes.match(/\bdata-action=(["'])(.*?)\1/i)?.[2]?.toLocaleLowerCase() ?? "";
  if (action.includes("roll") || action.includes("check") || action.includes("save")) return true;
  const href = attributes.match(/\bhref=(["'])(.*?)\1/i)?.[2]?.trim().toLocaleLowerCase() ?? "";
  if (!href) return true;
  return href === "#" || href.startsWith("javascript:");
}

function isRollActionButton(attributes: string): boolean {
  if (!attributes) return true;
  const classes = attributes.match(/\bclass=(["'])(.*?)\1/i)?.[2]?.toLocaleLowerCase() ?? "";
  if (/\binline-roll\b/.test(classes)) return true;
  if (/\broll\b/.test(classes) || /\bcheck\b/.test(classes) || /\bsave\b/.test(classes)) return true;
  const action = attributes.match(/\bdata-action=(["'])(.*?)\1/i)?.[2]?.toLocaleLowerCase() ?? "";
  return action.includes("roll") || action.includes("check") || action.includes("save");
}

function buildDocumentIdentityMap<Document extends RichTextRelativeDocument>(documents: Document[]): Map<string, Document> {
  const identityMap = new Map<string, Document>();
  for (const document of documents) {
    if (document.id) identityMap.set(document.id, document);
    if (document._id) identityMap.set(document._id, document);
    if (document.uuid) identityMap.set(document.uuid, document);
  }
  return identityMap;
}
