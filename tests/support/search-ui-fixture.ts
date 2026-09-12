
/** Shared search UI fixture. */
export const user = { id: "player" };

/** Shared search UI fixture. */
export function createDocument(options: {
  uuid: string;
  name: string;
  documentName: string;
  type?: string;
  img?: string | null;
  visible?: boolean;
  items?: SearchFixtureDocument[];
}): SearchFixtureDocument {
  return {
    uuid: options.uuid,
    id: options.uuid.split(".").at(-1),
    name: options.name,
    documentName: options.documentName,
    type: options.type,
    img: options.img,
    visible: options.visible ?? true,
    items: options.items ?? [],
    testUserPermission: (_user, level) => level === "OBSERVER" && (options.visible ?? true),
    canUserModify: () => false,
    getUserLevel: () => (options.visible === false ? 0 : 2)
  };
}

/** Shared search UI fixture. */
export const SEARCH_DEBOUNCE_BUFFER_MS = 310;

/** Shared search UI fixture. */
export type SearchFixtureDocument = {
  uuid: string;
  id: string | undefined;
  name: string;
  documentName: string;
  type?: string;
  img?: string | null;
  visible?: boolean;
  items?: SearchFixtureDocument[];
  testUserPermission: (user: unknown, level: string) => boolean;
  canUserModify: (user: unknown, action: string) => boolean;
  getUserLevel: (user: unknown) => number;
};

/** Shared search UI fixture. */
export type ShellTemplateData = {
  activeDestination: string;
  contentType: string;
  title: string;
  subtitle: string;
  portraitImage?: string | null;
  itemDetail?: {
    available: boolean;
    name?: string;
  };
  search?: {
    query: string;
    typeFilters: Array<{ label: string; active: boolean }>;
    results: Array<{ uuid: string; name: string; type: string }>;
  };
};

/** Shared search UI fixture. */
export type TestElement = {
  id: string;
  dataset: Record<string, string>;
  innerHTML: string;
  scrollTop: number;
  children: TestElement[];
  listeners: Map<string, (event: TestEvent) => void>;
  pushedUrls: string[];
  pushedStates: unknown[];
  replacedStates: Array<{ state: unknown; url?: string | URL | null }>;
  addEventListener: (type: string, handler: (event: TestEvent) => void) => void;
  append: (element: TestElement) => void;
  querySelector: <T>(selector: string) => T | null;
  dispatch: (type: string, event: TestEvent) => void;
  remove: () => void;
};

/** Shared search UI fixture. */
export type TestEvent = {
  preventDefault: () => void;
  stopPropagation: () => void;
  stopImmediatePropagation: () => void;
  target: {
    value?: string;
    closest: (selector: string) => {
      dataset: Record<string, string | undefined>;
      value?: string;
    } | null;
  };
};

/** Shared search UI fixture. */
export type TestInput = {
  dataset: Record<string, string>;
  value: string;
  focused: boolean;
  focus: () => void;
  setSelectionRange: () => void;
  closest: () => TestInput;
};

/** Shared search UI fixture. */
export function installShellFixtureRuntime(options: {
  root: TestElement;
  searchInput: TestInput;
  actors?: unknown;
  items?: unknown;
  journals?: unknown;
  packs?: unknown;
  systemId?: string;
  renderTemplate: (path: string, data: object) => Promise<string>;
}): void {
  Object.defineProperty(globalThis, "Element", { configurable: true, value: Object });
  Object.defineProperty(globalThis, "addEventListener", { configurable: true, value: () => undefined });
  Object.defineProperty(globalThis, "removeEventListener", { configurable: true, value: () => undefined });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      body: {
        dataset: {},
        append: (element: TestElement) => options.root.append(element)
      },
      createElement: () => options.root,
      getElementById: () => null,
      querySelectorAll: () => []
    }
  });
  Object.defineProperty(globalThis, "game", {
    configurable: true,
    value: {
      actors: options.actors ?? [],
      items: options.items ?? [],
      journal: options.journals ?? [],
      packs: options.packs ?? [],
      system: options.systemId ? { id: options.systemId } : undefined,
      user,
      settings: {
        get: () => true,
        register: () => undefined,
        set: async () => undefined
      }
    }
  });
  const historyFixture = {
    length: 1,
    state: null as unknown,
    pushState: (state: unknown, _unused: string, url?: string | URL | null) => {
      options.root.pushedUrls.push(String(url));
      options.root.pushedStates.push(state);
      historyFixture.state = state;
    },
    replaceState: (state: unknown, _unused: string, url?: string | URL | null) => {
      options.root.replacedStates.push({ state, url });
      historyFixture.state = state;
    },
    back: () => undefined
  };
  Object.defineProperty(globalThis, "history", {
    configurable: true,
    value: historyFixture
  });
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { href: "http://localhost/game", hash: "" }
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => null,
      setItem: () => undefined
    }
  });
  Object.defineProperty(globalThis, "renderTemplate", {
    configurable: true,
    value: options.renderTemplate
  });
  Object.defineProperty(globalThis, "foundry", {
    configurable: true,
    value: {
      utils: {
        fromUuid: async (uuid: string) => findByUuid([options.actors, options.items, options.journals], uuid),
        fromUuidSync: (uuid: string) => findByUuid([options.actors, options.items, options.journals], uuid)
      }
    }
  });

  options.root.querySelector = <T,>(selector: string): T | null => (selector === "[data-search-input]" ? (options.searchInput as T) : null);
}

/** Shared search UI fixture. */
export function createElement(): TestElement {
  return {
    id: "",
    dataset: {},
    innerHTML: "",
    scrollTop: 0,
    children: [],
    listeners: new Map(),
    pushedUrls: [],
    pushedStates: [],
    replacedStates: [],
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    },
    append(element) {
      this.children.push(element);
    },
    querySelector() {
      return null;
    },
    dispatch(type, event) {
      this.listeners.get(type)?.(event);
    },
    remove() {
      return undefined;
    }
  };
}

/** Shared search UI fixture. */
export function createInput(): TestInput {
  const input: TestInput = {
    dataset: { searchInput: "" },
    value: "",
    focused: false,
    focus() {
      this.focused = true;
    },
    setSelectionRange() {
      return undefined;
    },
    closest() {
      return input;
    }
  };
  return input;
}

/** Shared search UI fixture. */
export function createActionEvent(data: { action: string; route?: string; typeFilter?: string; resultId?: string }): TestEvent {
  return {
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
    stopImmediatePropagation: () => undefined,
    target: {
      closest: () => ({
        dataset: {
          action: data.action,
          route: data.route,
          typeFilter: data.typeFilter,
          resultId: data.resultId
        }
      })
    }
  };
}

/** Shared search UI fixture. */
export function createInputEvent(input: TestInput): TestEvent {
  return {
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
    stopImmediatePropagation: () => undefined,
    target: input
  };
}

/** Shared search UI fixture. */
export function createSearchableCollection(documents: SearchFixtureDocument[], delays: Record<string, number>) {
  return {
    contents: documents,
    search: async ({ query }: { query?: string }) => {
      await wait(delays[query ?? ""] ?? 0);
      const normalizedQuery = (query ?? "").toLocaleLowerCase();
      return documents.filter(document => document.name.toLocaleLowerCase().includes(normalizedQuery));
    },
    [Symbol.iterator]() {
      return documents[Symbol.iterator]();
    }
  };
}

/** Shared search UI fixture. */
export function findByUuid(collections: unknown[], uuid: string): SearchFixtureDocument | null {
  for (const collection of collections) {
    for (const document of flattenCollection(collection)) {
      if (document.uuid === uuid) return document;
    }
  }

  return null;
}

/** Shared search UI fixture. */
export function flattenCollection(collection: unknown): SearchFixtureDocument[] {
  if (!collection) return [];

  const documents = Array.isArray(collection)
    ? collection
    : typeof collection === "object" && "contents" in collection && Array.isArray(collection.contents)
      ? collection.contents
      : [];

  return documents.flatMap(document => [document, ...(document.items ?? [])]);
}

/** Shared search UI fixture. */
export function isHistoryState(value: unknown): value is { route: unknown } {
  return Boolean(value && typeof value === "object" && "route" in value);
}

/** Shared search UI fixture. */
export async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await wait(0);
}

/** Shared search UI fixture. */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
