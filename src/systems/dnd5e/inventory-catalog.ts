import { getFoundryRuntime } from "../../core/foundry-globals.ts";
import { getCollectionContents, getObject } from "../../core/utils.ts";
import { canViewDocument, type FoundryUserLike } from "../../services/permissions.ts";
import type { SearchableCompendiumPack } from "../../services/search.ts";
import type { InventoryImportEnvironment, InventoryImportSource } from "./inventory-management.ts";

export type InventoryCatalogEntry = { uuid: string; name: string; source: string; type: string };
const types = new Set(["weapon", "equipment", "consumable", "tool", "loot", "container"]);

/** Lists matching accessible physical items without loading every compendium document. */
export async function searchInventoryCatalog(query: string, user: FoundryUserLike): Promise<{ entries: InventoryCatalogEntry[]; failures: number }> {
  const runtime = getFoundryRuntime();
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return { entries: [], failures: 0 };
  const entries: InventoryCatalogEntry[] = [];
  let failures = 0;
  for (const item of getCollectionContents(runtime.game?.items) as InventoryImportSource[]) {
    if (item.uuid && types.has(item.type ?? "") && item.name?.toLocaleLowerCase().includes(needle) && canViewDocument(item, user)) {
      entries.push({ uuid: item.uuid, name: item.name, type: item.type ?? "", source: "World items" });
    }
  }
  const packs = (getCollectionContents(runtime.game?.packs) as SearchableCompendiumPack[]).filter(pack => pack.visible === true && pack.documentName === "Item");
  let next = 0;
  const worker = async () => {
    while (next < packs.length) {
      const pack = packs[next++];
      if (!pack?.collection) continue;
      try {
        const index = pack.getIndex ? await pack.getIndex({ fields: ["name", "type"] }) : pack.index;
        for (const item of getCollectionContents(index)) {
          const data = getObject(item);
          if (typeof data?.name !== "string" || typeof data.type !== "string" || typeof data._id !== "string") continue;
          if (!types.has(data.type) || !data.name.toLocaleLowerCase().includes(needle)) continue;
          entries.push({ uuid: "Compendium." + pack.collection + ".Item." + data._id, name: data.name, type: data.type, source: pack.metadata?.label ?? pack.collection });
        }
      } catch { failures++; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, packs.length) }, () => worker()));
  return { entries: entries.sort((a,b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source) || a.uuid.localeCompare(b.uuid)), failures };
}

/** Resolves authoritative documents and delegates data copying and container ID remapping to the active system. */
export function inventoryImportEnvironment(user: FoundryUserLike): InventoryImportEnvironment {
  return {
    resolve: async uuid => {
      const runtime = getFoundryRuntime();
      const resolve = runtime.foundry?.utils?.fromUuid ?? runtime.fromUuid;
      if (!resolve) return null;
      const result = await resolve(uuid);
      if (!result || typeof result !== "object" || !("documentName" in result) || result.documentName !== "Item") return null;
      return result as InventoryImportSource;
    },
    prepare: async source => {
      const implementation = source.constructor as { createWithContents?: (items: InventoryImportSource[], options: { transformAll: (item: InventoryImportSource) => InventoryImportSource }) => Promise<Record<string, unknown>[] | undefined> };
      if (!implementation.createWithContents) throw new Error("The active system does not provide item import support.");
      return await implementation.createWithContents([source], {
        transformAll: item => {
          if (!canViewDocument(item, user)) throw new Error("A contained item is not accessible.");
          return item;
        }
      }) ?? [];
    }
  };
}
