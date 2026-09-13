import { getNumber, getObject, getString } from "../../core/utils.ts";

/** A definite dnd5e rejection which is safe to retry manually. */
export type Dnd5eRejectedActionResult = {
  ok: false;
  reason: "rejected";
  failure: "rejected";
  retry: "safe";
};

/** A completed dnd5e workflow which did not request a character update. */
export type Dnd5eUnchangedActionResult = { ok: true; changed: false };

/** A native workflow result that cannot be verified from document sources. */
export type Dnd5eUncertainActionResult = {
  ok: false;
  failure: "uncertain";
  retry: "review";
};

/** Returns a typed result without treating an empty Foundry response as saved. */
export function acknowledgeDnd5eAction(acknowledged: boolean): { ok: true } | Dnd5eRejectedActionResult {
  return acknowledged ? { ok: true } : rejectDnd5eAction();
}

/** Returns definite rejection metadata for a cancelled dnd5e action. */
export function rejectDnd5eAction(): Dnd5eRejectedActionResult {
  return { ok: false, reason: "rejected", failure: "rejected", retry: "safe" };
}

/** Checks a document or workflow response, including non-empty roll arrays. */
export function hasDnd5eActionAcknowledgement(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

/** Captures raw document sources so native workflows can prove that character data changed. */
export function snapshotDnd5eMutationState(...documents: unknown[]): string | null {
  const sources: unknown[] = [];
  for (const document of documents) {
    const record = getObject(document);
    if (!record) return null;
    const toObject = record.toObject;
    if (typeof toObject === "function") {
      try {
        const source = (toObject as (source?: boolean) => unknown).call(document, true);
        if (!getObject(source) || Array.isArray(source)) return null;
        sources.push(source);
      } catch {
        return null;
      }
      continue;
    }
    if (!getObject(record._source) || Array.isArray(record._source)) return null;
    sources.push(record._source);
  }
  if (sources.length === 0) return null;
  try {
    return JSON.stringify(sources);
  } catch {
    return null;
  }
}

/** Classifies an acknowledged native workflow by its before/after document sources. */
export function getDnd5eWorkflowOutcome(
  value: unknown,
  before: string | null,
  after: string | null
): { ok: true } | Dnd5eUnchangedActionResult | Dnd5eRejectedActionResult | Dnd5eUncertainActionResult {
  if (!hasDnd5eActionAcknowledgement(value)) return rejectDnd5eAction();
  if (before === null || after === null) return { ok: false, failure: "uncertain", retry: "review" };
  return before === after ? { ok: true, changed: false } : { ok: true };
}

/** Checks that an embedded update acknowledged the document that was requested. */
export function hasDnd5eEmbeddedDocumentAcknowledgement(value: unknown, documentId: string): boolean {
  if (!Array.isArray(value)) return false;
  return value.some(document => {
    const record = getObject(document);
    return getString(record?.id) === documentId || getString(record?._id) === documentId;
  });
}

/** Distinguishes a cancelled recharge, an unchanged roll, and an applied update. */
export function getDnd5eRechargeOutcome(
  value: unknown,
  currentUses: unknown
): { ok: true } | Dnd5eUnchangedActionResult | Dnd5eRejectedActionResult {
  if (Array.isArray(value)) return value.length > 0 ? { ok: true, changed: false } : rejectDnd5eAction();
  const result = getObject(value);
  const rolls = result?.rolls;
  if (!Array.isArray(rolls) || rolls.length === 0) return rejectDnd5eAction();
  const updates = getObject(result?.updates);
  if (!updates || Object.keys(updates).length === 0) return { ok: true, changed: false };
  const spent = getNumber(updates["system.uses.spent"]) ?? getNumber(updates["uses.spent"]);
  return acknowledgeDnd5eAction(spent !== null && getNumber(getObject(currentUses)?.spent) === spent);
}
