import { getObject, getString } from "../core/utils.ts";

type RecoverableDocument = {
  id?: string | null;
  _id?: string | null;
  documentName?: string;
  parent?: unknown;
  constructor?: unknown;
  toObject?: (source?: boolean) => unknown;
  updateSource?: (changes: object, options?: { recursive?: boolean }) => unknown;
};

type DocumentDatabase = {
  get(documentClass: Function, operation: {
    action: "get";
    documentName: string;
    query: { _id: string };
  }): Promise<unknown>;
};

/**
 * Re-reads the persisted root document through Foundry's public database
 * backend and refreshes the retained document identity from source data.
 */
export async function refreshDocumentFromDatabase(
  document: unknown,
  options: { isCurrent: () => boolean; attempts?: number }
): Promise<boolean> {
  const retained = getRootDocument(document);
  if (!retained || !options.isCurrent()) return false;

  const id = getString(retained.id) || getString(retained._id);
  const documentName = getString(retained.documentName);
  const documentClass = typeof retained.constructor === "function"
    ? retained.constructor as Function & { database?: unknown }
    : null;
  const database = getObject(documentClass?.database) as DocumentDatabase | null;
  if (!id || !documentName || !documentClass || typeof database?.get !== "function"
    || typeof retained.toObject !== "function" || typeof retained.updateSource !== "function") return false;

  const attempts = Math.max(1, Math.min(options.attempts ?? 2, 3));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (!options.isCurrent()) return false;
    const before = sourceFingerprint(retained);
    if (before === null) return false;

    let response: unknown;
    try {
      response = await database.get(documentClass, {
        action: "get",
        documentName,
        query: { _id: id }
      });
    } catch {
      return false;
    }

    if (!options.isCurrent()) return false;
    if (sourceFingerprint(retained) !== before) continue;
    try {
      const fresh = getReturnedDocument(response);
      if (!fresh || typeof fresh.toObject !== "function") return false;
      const source = getObject(fresh.toObject(true));
      if (!source) return false;
      retained.updateSource(source, { recursive: false });
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

/** Walks embedded parents so database reads target a persisted root document. */
function getRootDocument(value: unknown): RecoverableDocument | null {
  let current = getObject(value) as RecoverableDocument | null;
  const visited = new Set<object>();
  while (current && !visited.has(current)) {
    visited.add(current);
    const parent = getObject(current.parent) as RecoverableDocument | null;
    if (!parent) return current;
    current = parent;
  }
  return null;
}

function sourceFingerprint(document: RecoverableDocument): string | null {
  try {
    return JSON.stringify(document.toObject?.(true));
  } catch {
    return null;
  }
}

function getReturnedDocument(response: unknown): RecoverableDocument | null {
  const records = Array.isArray(response)
    ? response
    : Array.isArray(getObject(response)?.documents)
      ? getObject(response)?.documents as unknown[]
      : [];
  return (getObject(records[0]) as RecoverableDocument | null) ?? null;
}
