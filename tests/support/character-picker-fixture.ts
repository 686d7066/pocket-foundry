import type { CharacterPickerActor } from "../../src/services/character-picker.ts";

/** Creates an actor fixture with configurable permissions and opaque system data. */
export function createActor(options: {
  uuid: string;
  name: string;
  type?: string;
  visible?: boolean;
  updateable?: boolean;
  userLevel?: number;
  system?: Record<string, unknown>;
  items?: Array<{ name: string; type: string; system?: Record<string, unknown> }>;
  folder?: { id?: string; name?: string; sort?: number; folder?: { id?: string; name?: string; sort?: number } | null } | null;
}): CharacterPickerActor {
  return {
    uuid: options.uuid,
    id: options.uuid.split(".").at(-1),
    name: options.name,
    type: options.type ?? "character",
    img: null,
    system: options.system,
    items: options.items ?? [],
    folder: options.folder ?? null,
    testUserPermission: (_user, level) => level === "OBSERVER" && (options.visible ?? true),
    canUserModify: (_user, action) => action === "update" && (options.updateable ?? false),
    getUserLevel: () => options.userLevel ?? (options.visible === false ? 0 : options.updateable ? 3 : 2)
  };
}
