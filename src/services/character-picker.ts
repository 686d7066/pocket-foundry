import {
  canUpdateDocument,
  canViewDocument,
  getDocumentUserLevel,
  FOUNDRY_PERMISSION_LEVELS,
  type FoundryUserLike,
  type PermissionCheckedDocument
} from "./permissions.ts";
import { getCollectionContents, getInitials, getNumber, getObject, getString } from "../core/utils.ts";

/**
 * Minimal actor shape needed by the character picker view model.
 */
export type CharacterPickerActor = PermissionCheckedDocument & {
  uuid?: string;
  id?: string;
  name?: string;
  type?: string;
  img?: string | null;
  folder?: CharacterPickerFolder | null;
  folderId?: string | null;
  system?: Record<string, unknown>;
  items?: unknown;
};

/**
 * Minimal owned item shape used to derive class summaries.
 */
export type CharacterPickerItem = {
  name?: string;
  type?: string;
  system?: Record<string, unknown>;
};

/**
 * Small metadata chip displayed on character picker rows.
 */
export type CharacterPickerChip = {
  id: string;
  label: string;
  value: string;
  tone?: string;
};

/**
 * Template-safe row for one observable player character.
 */
export type CharacterPickerRow = {
  uuid: string;
  name: string;
  typeLabel: "Character";
  iconText: string;
  image: string | null;
  subtitle: string;
  summary: string;
  ownershipLabel: "Owner" | "Observer";
  acValue: string;
  hpValue: string;
  chips: CharacterPickerChip[];
  favorite: boolean;
  canToggleFavorite: boolean;
  folderLabel: string;
  folderPathLabel: string;
  folderDepth: number;
  sortName: string;
  ownerPriority: number;
  folderSortPath: number[];
  folderSortLabel: string;
  folderGroupKey: string;
  folderChain: CharacterPickerFolderChainNode[];
};

export type CharacterPickerFolderTreeNode = {
  id: string;
  label: string;
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  characterCount: number;
  totalCharacterCount: number;
  sortPath: number[];
  childFolders: CharacterPickerFolderTreeNode[];
  characters: CharacterPickerRow[];
};

/**
 * View model rendered by the character picker template.
 */
export type CharacterPickerViewModel = {
  label: "Characters";
  heading: "Character Picker";
  emptyTitle: "No Characters Available";
  emptyBody: "No observable player characters are available for this user.";
  searchQuery: string;
  canClearSearch: boolean;
  favorites: CharacterPickerRow[];
  hasFavorites: boolean;
  favoriteHelpOpen: boolean;
  folderTree: CharacterPickerFolderTreeNode[];
  hasFolderTree: boolean;
  ungroupedCharacters: CharacterPickerRow[];
  hasUngroupedCharacters: boolean;
  characters: CharacterPickerRow[];
  hasCharacters: boolean;
};

/**
 * Runtime dependencies used to build the character picker.
 */
export type CharacterPickerEnvironment = {
  actors: unknown;
  folders?: unknown;
  user: FoundryUserLike;
  favoriteActorUuids?: string[];
  favoriteHelpOpen?: boolean;
  searchQuery?: string;
  expandedFolderIds?: string[];
};

/**
 * Builds a permission-filtered character picker, prioritizing owned characters.
 */
export function buildCharacterPickerViewModel(environment: CharacterPickerEnvironment): CharacterPickerViewModel {
  const searchQuery = normalizeCharacterPickerSearchQuery(environment.searchQuery);
  const favoriteActorUuids = new Set((environment.favoriteActorUuids ?? []).map(actorUuid => actorUuid.trim()).filter(Boolean));
  const expandedFolderIds = new Set((environment.expandedFolderIds ?? []).map(folderId => folderId.trim()).filter(Boolean));
  const characters = getActors(environment.actors)
    .filter(actor => isPlayerCharacter(actor) && canListCharacter(actor, environment.user))
    .map(actor => buildCharacterPickerRow(actor, environment.user, favoriteActorUuids))
    .filter(character => matchesCharacterNameSearch(character, searchQuery))
    .sort(compareCharacterRows);
  const favorites = characters.filter(character => character.favorite);
  const folderTree = buildCharacterFolderTree(characters, getActorFolders(environment.folders), expandedFolderIds);
  const ungroupedCharacters = characters.filter(character => character.folderGroupKey === "ungrouped");

  return {
    label: "Characters",
    heading: "Character Picker",
    emptyTitle: "No Characters Available",
    emptyBody: "No observable player characters are available for this user.",
    searchQuery,
    canClearSearch: searchQuery.length > 0,
    favorites,
    hasFavorites: favorites.length > 0,
    favoriteHelpOpen: environment.favoriteHelpOpen === true,
    folderTree,
    hasFolderTree: folderTree.length > 0,
    ungroupedCharacters,
    hasUngroupedCharacters: ungroupedCharacters.length > 0,
    characters,
    hasCharacters: characters.length > 0
  };
}

function canListCharacter(actor: CharacterPickerActor, user: FoundryUserLike): boolean {
  if (canViewDocument(actor, user)) return true;
  if (typeof actor.testUserPermission === "function" && actor.testUserPermission(user, "LIMITED") === true) return true;
  const level = getDocumentUserLevel(actor, user);
  return level !== null && level >= FOUNDRY_PERMISSION_LEVELS.LIMITED;
}

function buildCharacterPickerRow(actor: CharacterPickerActor, user: FoundryUserLike, favoriteActorUuids: Set<string>): CharacterPickerRow {
  const name = actor.name?.trim() || "Unnamed Character";
  const summary = getCharacterSummary(actor);
  const classSummary = getClassSummary(actor);
  const ownershipLabel = isOwner(actor, user) ? "Owner" : "Observer";
  const folderInfo = getCharacterFolderInfo(actor);
  const actorUuid = actor.uuid ?? (actor.id ? `Actor.${actor.id}` : "");
  const headerStats = getCharacterHeaderStats(actor);
  const subtitle = classSummary || summary || "Character";

  return {
    uuid: actorUuid,
    name,
    typeLabel: "Character",
    iconText: getInitials(name),
    image: actor.img || null,
    subtitle,
    summary,
    ownershipLabel,
    acValue: headerStats.ac,
    hpValue: headerStats.hp,
    chips: getCharacterChips(actor),
    favorite: favoriteActorUuids.has(actorUuid),
    canToggleFavorite: true,
    folderLabel: folderInfo.label,
    folderPathLabel: folderInfo.pathLabel,
    folderDepth: folderInfo.depth,
    sortName: name.toLocaleLowerCase(),
    ownerPriority: ownershipLabel === "Owner" ? 0 : 1,
    folderSortPath: folderInfo.sortPath,
    folderSortLabel: folderInfo.pathLabel.toLocaleLowerCase(),
    folderGroupKey: folderInfo.key,
    folderChain: folderInfo.chain
  };
}

function getActors(actors: unknown): CharacterPickerActor[] {
  return getCollectionContents(actors) as CharacterPickerActor[];
}

function isPlayerCharacter(actor: CharacterPickerActor): boolean {
  return actor.type === "character";
}

function isOwner(actor: CharacterPickerActor, user: FoundryUserLike): boolean {
  if (canUpdateDocument(actor, user)) return true;
  return (getDocumentUserLevel(actor, user) ?? FOUNDRY_PERMISSION_LEVELS.NONE) >= FOUNDRY_PERMISSION_LEVELS.OWNER;
}

function compareCharacterRows(left: CharacterPickerRow, right: CharacterPickerRow): number {
  if (left.folderSortLabel !== right.folderSortLabel) return compareFolderSortPath(left.folderSortPath, right.folderSortPath, left.folderSortLabel, right.folderSortLabel);
  if (left.ownerPriority !== right.ownerPriority) return left.ownerPriority - right.ownerPriority;
  return left.sortName.localeCompare(right.sortName);
}

function getCharacterSummary(actor: CharacterPickerActor): string {
  const details = getObject(actor.system?.details);
  const species = getString(details?.species) || getString(details?.race);
  const classSummary = getClassSummary(actor);
  const level = getNumber(details?.level);

  const parts = [species, classSummary || (level !== null ? `Level ${level}` : "")].filter(Boolean);
  return parts.join(" ");
}

function getClassSummary(actor: CharacterPickerActor): string {
  const classItems = getActorItems(actor).filter(item => item.type === "class");
  if (classItems.length === 0) return "";

  return classItems
    .map(item => {
      const levels = getNumber(getObject(item.system)?.levels);
      return `${item.name?.trim() || "Class"}${levels === null ? "" : ` ${levels}`}`;
    })
    .join(" / ");
}

function getActorItems(actor: CharacterPickerActor): CharacterPickerItem[] {
  return getCollectionContents(actor.items) as CharacterPickerItem[];
}

function getCharacterChips(actor: CharacterPickerActor): CharacterPickerChip[] {
  const attributes = getObject(actor.system?.attributes);
  const hp = getObject(attributes?.hp);
  const ac = getObject(attributes?.ac);
  const initiative = getObject(attributes?.init);
  const chips: CharacterPickerChip[] = [];

  const hpValue = getNumber(hp?.value);
  const hpMax = getNumber(hp?.max);
  if (hpValue !== null || hpMax !== null) {
    chips.push({ id: "hp", label: "HP", value: `${hpValue ?? "-"}${hpMax === null ? "" : `/${hpMax}`}` });
  }

  const acValue = getNumber(ac?.value);
  if (acValue !== null) chips.push({ id: "ac", label: "AC", value: String(acValue) });

  const initiativeValue = getNumber(initiative?.total) ?? getNumber(initiative?.mod) ?? getNumber(initiative?.value);
  if (initiativeValue !== null) chips.push({ id: "initiative", label: "Init", value: formatSignedNumber(initiativeValue) });

  return chips;
}

function formatSignedNumber(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function getCharacterHeaderStats(actor: CharacterPickerActor): { ac: string; hp: string } {
  const attributes = getObject(actor.system?.attributes);
  const hp = getObject(attributes?.hp);
  const ac = getObject(attributes?.ac);
  const acValue = getNumber(ac?.value);
  const hpValue = getNumber(hp?.value);
  const hpMax = getNumber(hp?.max);

  return {
    ac: acValue === null ? "-" : String(acValue),
    hp: hpValue === null && hpMax === null ? "-/-" : `${hpValue ?? "-"}/${hpMax ?? "-"}`
  };
}

function normalizeCharacterPickerSearchQuery(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function matchesCharacterNameSearch(character: CharacterPickerRow, searchQuery: string): boolean {
  if (!searchQuery) return true;
  return character.name.toLocaleLowerCase().includes(searchQuery.toLocaleLowerCase());
}

function buildCharacterFolderTree(characters: CharacterPickerRow[], folders: CharacterPickerFolderEntry[], expandedFolderIds: Set<string>): CharacterPickerFolderTreeNode[] {
  const roots: CharacterPickerFolderTreeNode[] = [];
  const nodeById = new Map<string, CharacterPickerFolderTreeNode>();
  const pendingChildrenByParent = new Map<string, CharacterPickerFolderTreeNode[]>();

  for (const folder of folders) {
    const node: CharacterPickerFolderTreeNode = {
      id: folder.id,
      label: folder.name,
      depth: 0,
      expanded: expandedFolderIds.has(folder.id),
      hasChildren: false,
      characterCount: 0,
      totalCharacterCount: 0,
      sortPath: folder.sortPath,
      childFolders: [],
      characters: []
    };
    nodeById.set(folder.id, node);
  }

  for (const folder of folders) {
    const node = nodeById.get(folder.id);
    if (!node) continue;

    const bufferedChildren = pendingChildrenByParent.get(folder.id);
    if (bufferedChildren) {
      node.childFolders.push(...bufferedChildren);
      node.hasChildren = true;
      pendingChildrenByParent.delete(folder.id);
    }

    if (folder.parentId) {
      const parentNode = nodeById.get(folder.parentId);
      if (parentNode) {
        node.depth = parentNode.depth + 1;
        parentNode.childFolders.push(node);
        parentNode.hasChildren = true;
      } else {
        const pending = pendingChildrenByParent.get(folder.parentId) ?? [];
        pending.push(node);
        pendingChildrenByParent.set(folder.parentId, pending);
      }
      continue;
    }

    roots.push(node);
  }

  for (const orphanChildren of pendingChildrenByParent.values()) {
    roots.push(...orphanChildren);
  }

  for (const character of characters) {
    if (character.folderChain.length === 0) continue;

    const leafFolderId = character.folderChain.at(-1)?.id ?? character.folderGroupKey;
    let parentNode = leafFolderId ? nodeById.get(leafFolderId) : undefined;
    if (!parentNode && character.folderChain.length > 0) {
      parentNode = ensureCharacterChainNode(roots, nodeById, character.folderChain, expandedFolderIds);
    }

    parentNode?.characters.push(character);
  }

  sortFolderTreeNodes(roots);
  const rootsWithTotals = roots
    .map(root => assignFolderCharacterTotals(root))
    .filter((node): node is CharacterPickerFolderTreeNode => Boolean(node));
  return rootsWithTotals;
}

function compareFolderSortPath(left: number[], right: number[], leftLabel: string, rightLabel: string): number {
  const minLength = Math.min(left.length, right.length);
  for (let index = 0; index < minLength; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }

  if (left.length !== right.length) return left.length - right.length;
  return leftLabel.localeCompare(rightLabel, undefined, { sensitivity: "base" });
}

type CharacterPickerFolder = {
  id?: string;
  name?: string;
  sort?: number;
  folder?: CharacterPickerFolder | null;
  parent?: CharacterPickerFolder | null;
};

type CharacterPickerFolderInfo = {
  key: string;
  label: string;
  pathLabel: string;
  depth: number;
  sortPath: number[];
  chain: CharacterPickerFolderChainNode[];
};

type CharacterPickerFolderEntry = {
  id: string;
  name: string;
  parentId?: string;
  sortPath: number[];
};

type CharacterPickerFolderChainNode = {
  id: string;
  label: string;
  depth: number;
  sortPath: number[];
};

function getCharacterFolderInfo(actor: CharacterPickerActor & { folder?: CharacterPickerFolder | null; folderId?: string | null }): CharacterPickerFolderInfo {
  const chain = getFolderChain(actor.folder ?? null);
  const names = chain.map(folder => (folder.name ?? "").trim()).filter(Boolean);
  const sortPath = chain.map(folder => Number(folder.sort ?? Number.MAX_SAFE_INTEGER));
  const actorFolderId = (typeof actor.folderId === "string" ? actor.folderId : undefined) ?? chain.at(-1)?.id ?? "";

  if (names.length === 0) {
    return {
      key: "ungrouped",
      label: "Ungrouped",
      pathLabel: "Ungrouped",
      depth: 0,
      sortPath: [],
      chain: []
    };
  }

  const chainNodes: CharacterPickerFolderChainNode[] = chain.map((folder, index) => {
    const name = (folder.name ?? "").trim() || "Folder";
    const id = folder.id?.trim() || `folder:${names.slice(0, index + 1).join("/").toLocaleLowerCase()}`;
    return {
      id,
      label: name,
      depth: index,
      sortPath: sortPath.slice(0, index + 1)
    };
  });
  const pathLabel = names.join(" / ");
  return {
    key: actorFolderId.trim() || `folder:${pathLabel.toLocaleLowerCase()}`,
    label: names.at(-1) ?? "Folder",
    pathLabel,
    depth: Math.max(0, names.length - 1),
    sortPath,
    chain: chainNodes
  };
}

function getFolderChain(folder: CharacterPickerFolder | null): CharacterPickerFolder[] {
  const chain: CharacterPickerFolder[] = [];
  const seen = new Set<CharacterPickerFolder>();
  let current = folder;

  while (current && !seen.has(current)) {
    chain.unshift(current);
    seen.add(current);
    current = current.folder ?? current.parent ?? null;
  }

  return chain;
}

function getActorFolders(folders: unknown): CharacterPickerFolderEntry[] {
  const allFolders = getCollectionContents(folders) as Array<CharacterPickerFolder & {
    type?: string;
    documentName?: string;
    folder?: CharacterPickerFolder | null;
    parent?: CharacterPickerFolder | null;
  }>;
  const entries: CharacterPickerFolderEntry[] = [];

  for (const folder of allFolders) {
    if (!isActorFolder(folder)) continue;
    const id = folder.id?.trim();
    if (!id) continue;
    const chain = getFolderChain(folder);
    const name = (folder.name ?? "").trim() || "Folder";
    const parentFolder = folder.folder ?? folder.parent ?? null;
    const parentId = parentFolder?.id?.trim();
    entries.push({
      id,
      name,
      ...(parentId ? { parentId } : {}),
      sortPath: chain.map(item => Number(item.sort ?? Number.MAX_SAFE_INTEGER))
    });
  }

  entries.sort((left, right) => compareFolderSortPath(left.sortPath, right.sortPath, left.name.toLocaleLowerCase(), right.name.toLocaleLowerCase()));
  return entries;
}

function isActorFolder(folder: { type?: string; documentName?: string }): boolean {
  const type = (folder.type ?? folder.documentName ?? "").trim().toLocaleLowerCase();
  return type === "actor" || type === "actors";
}

function ensureCharacterChainNode(
  roots: CharacterPickerFolderTreeNode[],
  nodeById: Map<string, CharacterPickerFolderTreeNode>,
  chain: CharacterPickerFolderChainNode[],
  expandedFolderIds: Set<string>
): CharacterPickerFolderTreeNode | undefined {
  let parent: CharacterPickerFolderTreeNode | undefined;

  for (const segment of chain) {
    let node = nodeById.get(segment.id);
    if (!node) {
      node = {
        id: segment.id,
        label: segment.label,
        depth: segment.depth,
        expanded: expandedFolderIds.has(segment.id),
        hasChildren: false,
        characterCount: 0,
        totalCharacterCount: 0,
        sortPath: segment.sortPath,
        childFolders: [],
        characters: []
      };
      nodeById.set(segment.id, node);
      if (parent) {
        parent.childFolders.push(node);
        parent.hasChildren = true;
      } else {
        roots.push(node);
      }
    } else if (parent && !parent.childFolders.includes(node)) {
      parent.childFolders.push(node);
      parent.hasChildren = true;
    }
    parent = node;
  }

  return parent;
}

function sortFolderTreeNodes(nodes: CharacterPickerFolderTreeNode[]): void {
  for (const node of nodes) {
    sortFolderTreeNodes(node.childFolders);
    node.characters.sort(compareCharacterRows);
  }

  nodes.sort((left, right) => {
    const sortPathCompare = compareFolderSortPath(left.sortPath, right.sortPath, left.label.toLocaleLowerCase(), right.label.toLocaleLowerCase());
    if (sortPathCompare !== 0) return sortPathCompare;
    return left.label.localeCompare(right.label, undefined, { sensitivity: "base" });
  });
}

function assignFolderCharacterTotals(node: CharacterPickerFolderTreeNode): CharacterPickerFolderTreeNode | null {
  node.childFolders = node.childFolders
    .map(child => assignFolderCharacterTotals(child))
    .filter((child): child is CharacterPickerFolderTreeNode => Boolean(child));
  node.hasChildren = node.childFolders.length > 0;

  let total = node.characters.length;
  for (const child of node.childFolders) total += child.totalCharacterCount;

  node.characterCount = node.characters.length;
  node.totalCharacterCount = total;
  return total > 0 ? node : null;
}
