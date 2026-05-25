import assert from "node:assert/strict";
import { test } from "vitest";
import { RouteView, type MobileRoute } from "../src/router/routes.ts";
import {
  buildJournalEntryViewModel,
  buildJournalPageViewModel,
  createJournalPageRoute,
  createMobileJournalService,
  type JournalEntryDocumentLike,
  type JournalPageDocumentLike,
  type JournalTextEnricher
} from "../src/services/journal.ts";

const user = { id: "player" };

type FixtureEntry = JournalEntryDocumentLike & {
  uuid: string;
  id: string;
  name: string;
  documentName: "JournalEntry";
  visible?: boolean;
  pages: FixturePage[];
  sort?: number;
  createdPages: FixturePage[];
  entryDeleted: number;
  entryUpdated: number;
  isOwner: boolean;
  update: () => Promise<FixtureEntry>;
  delete: () => Promise<FixtureEntry>;
};

type FixturePage = JournalPageDocumentLike & {
  uuid: string;
  id: string;
  name: string;
  documentName: "JournalEntryPage";
  parent: FixtureEntry;
  visible?: boolean;
  deleted: number;
  sheetOpened: number;
  updatedData: Record<string, unknown>[];
};

test("journal service lists visible entries with visible page counts only", () => {
  const fixtures = createJournalFixtures();
  const service = createMobileJournalService(createEnvironment(fixtures));

  const entries = service.listEntries();
  const serialized = JSON.stringify(entries);

  assert.deepEqual(
    entries.map(entry => [entry.name, entry.visiblePageCount, entry.route]),
    [
      ["The Glass Gate", 5, { view: RouteView.Journal, entryUuid: "JournalEntry.glass-gate" }],
      ["Travel Log", 0, { view: RouteView.Journal, entryUuid: "JournalEntry.travel-log" }]
    ]
  );
  assert.doesNotMatch(serialized, /Hidden Plans|GM Secrets|secret/i);
});

test("opening an entry selects the first visible page when no page UUID is provided", async () => {
  const fixtures = createJournalFixtures();
  const service = createMobileJournalService(createEnvironment(fixtures));

  const model = await service.lookupEntry("JournalEntry.glass-gate");

  assert.equal(model.unavailable, false);
  if (model.unavailable) return;

  assert.equal(model.selectedPageUuid, "JournalEntry.glass-gate.JournalEntryPage.npc-notes");
  assert.equal(model.canCreatePage, true);
  assert.deepEqual(
    model.visiblePages.map(page => [page.name, page.pageType, page.canUpdate, page.canDelete]),
    [
      ["NPC Notes", "text", true, true],
      ["Gate Diagram", "image", true, true],
      ["Field Report", "pdf", true, true],
      ["Memory Echo", "video", true, true],
      ["Relic Data", "unsupported", true, true]
    ]
  );
});

test("opening a page route restores the exact entry and page UUID", async () => {
  const fixtures = createJournalFixtures();
  const service = createMobileJournalService(createEnvironment(fixtures));

  const resolution = await service.resolveRoute({
    view: RouteView.Journal,
    entryUuid: "JournalEntry.glass-gate",
    pageUuid: "JournalEntry.glass-gate.JournalEntryPage.gate-diagram",
    scrollTop: 240
  });

  assert.deepEqual(resolution.route, {
    view: RouteView.Journal,
    entryUuid: "JournalEntry.glass-gate",
    pageUuid: "JournalEntry.glass-gate.JournalEntryPage.gate-diagram",
    scrollTop: 240
  });
  assert.equal(resolution.page?.unavailable, false);
  if (!resolution.page || resolution.page.unavailable) return;
  assert.equal(resolution.page.pageType, "image");
  assert.equal(resolution.page.src, "images/gate.webp");
});

test("hidden entries and pages resolve to non-leaking unavailable states", async () => {
  const fixtures = createJournalFixtures();
  const service = createMobileJournalService(createEnvironment(fixtures));

  const hiddenEntry = await service.lookupEntry("JournalEntry.hidden-plans");
  const hiddenPage = await service.lookupPage("JournalEntry.glass-gate.JournalEntryPage.gm-secrets", "JournalEntry.glass-gate");
  const hiddenRoute = await service.resolveRoute({
    view: RouteView.Journal,
    entryUuid: "JournalEntry.hidden-plans",
    pageUuid: "JournalEntry.hidden-plans.JournalEntryPage.secret"
  });
  const serialized = JSON.stringify({ hiddenEntry, hiddenPage, hiddenRoute });

  assert.deepEqual(hiddenEntry, {
    unavailable: true,
    title: "Journal Unavailable",
    body: "This journal content is not available to the current user."
  });
  assert.deepEqual(hiddenPage, hiddenEntry);
  assert.deepEqual(hiddenRoute.route, { view: RouteView.Journal });
  assert.doesNotMatch(serialized, /Hidden Plans|GM Secrets|secret/i);
});

test("text page rendering calls enrichment with relative page and permission-aware secrets", async () => {
  const fixtures = createJournalFixtures();
  const calls: Array<Parameters<JournalTextEnricher>> = [];
  const service = createMobileJournalService(
    createEnvironment(fixtures, {
      enrichHtml: async (value, options) => {
        calls.push([value, options]);
        return `<p>Enriched ${value}</p><a class="content-link" data-uuid="Actor.arlen">Arlen</a>`;
      }
    })
  );

  const page = await service.lookupPage("JournalEntry.glass-gate.JournalEntryPage.npc-notes", "JournalEntry.glass-gate");

  assert.equal(page.unavailable, false);
  if (page.unavailable || page.pageType !== "text") return;
  assert.match(page.textHtml, /data-uuid="Actor\.arlen"/);
  assert.equal(page.textSource, "<p>Visible notes about the gate.</p>");
  assert.equal(page.textFormat, 1);
  assert.equal(page.textMarkdown, "Visible notes about the gate.");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.[0], "<p>Visible notes about the gate.</p>");
  assert.equal(calls[0]?.[1].async, true);
  assert.equal(calls[0]?.[1].secrets, true);
  assert.equal(calls[0]?.[1].relativeTo.uuid, "JournalEntry.glass-gate.JournalEntryPage.npc-notes");
});

test("image, PDF, video, and unsupported page model paths are explicit", async () => {
  const fixtures = createJournalFixtures();
  const service = createMobileJournalService(createEnvironment(fixtures));

  const image = await service.lookupPage("JournalEntry.glass-gate.JournalEntryPage.gate-diagram");
  const pdf = await service.lookupPage("JournalEntry.glass-gate.JournalEntryPage.field-report");
  const video = await service.lookupPage("JournalEntry.glass-gate.JournalEntryPage.memory-echo");
  const unsupported = await service.lookupPage("JournalEntry.glass-gate.JournalEntryPage.relic-data");

  assert.equal(image.unavailable, false);
  assert.equal(pdf.unavailable, false);
  assert.equal(video.unavailable, false);
  assert.equal(unsupported.unavailable, false);
  if (image.unavailable || pdf.unavailable || video.unavailable || unsupported.unavailable) return;
  assert.equal(image.pageType, "image");
  assert.equal(pdf.pageType, "pdf");
  assert.equal(video.pageType, "video");
  assert.equal(unsupported.pageType, "unsupported");
  if (image.pageType !== "image" || pdf.pageType !== "pdf" || video.pageType !== "video" || unsupported.pageType !== "unsupported") return;
  assert.deepEqual([image.pageType, image.src], ["image", "images/gate.webp"]);
  assert.deepEqual([pdf.pageType, pdf.src], ["pdf", "docs/report.pdf"]);
  assert.deepEqual([video.pageType, video.src], ["video", "video/echo.webm"]);
  assert.equal(unsupported.unsupported, true);
});

test("document links route through mobile-native routes with permission checks", async () => {
  const fixtures = createJournalFixtures();
  const actor = createLinkedDocument("Actor.arlen", "Arlen Mire", "Actor");
  const item = createLinkedDocument("Item.compass", "Compass", "Item");
  const hiddenItem = createLinkedDocument("Item.hidden", "Hidden Compass", "Item", false);
  const service = createMobileJournalService(createEnvironment(fixtures, { extras: [actor, item, hiddenItem] }));
  const parentRoute: MobileRoute = {
    view: RouteView.Journal,
    entryUuid: "JournalEntry.glass-gate",
    pageUuid: "JournalEntry.glass-gate.JournalEntryPage.npc-notes",
    scrollTop: 400
  };

  assert.deepEqual(await service.createRouteForDocumentLink("Actor.arlen", parentRoute), { view: RouteView.Character, actorUuid: "Actor.arlen" });
  assert.deepEqual(await service.createRouteForDocumentLink("JournalEntry.glass-gate.JournalEntryPage.gate-diagram", parentRoute), {
    view: RouteView.Journal,
    entryUuid: "JournalEntry.glass-gate",
    pageUuid: "JournalEntry.glass-gate.JournalEntryPage.gate-diagram",
    scrollTop: 0
  });
  assert.deepEqual(await service.createRouteForDocumentLink("Item.compass", parentRoute), {
    view: RouteView.DocumentDetail,
    documentUuid: "Item.compass",
    documentType: "item",
    parentRoute
  });
  assert.equal(await service.createRouteForDocumentLink("Item.hidden", parentRoute), null);
});

test("back route state includes entry UUID, page UUID, and scroll state", () => {
  assert.deepEqual(createJournalPageRoute("JournalEntry.glass-gate", "JournalEntry.glass-gate.JournalEntryPage.npc-notes", 321), {
    view: RouteView.Journal,
    entryUuid: "JournalEntry.glass-gate",
    pageUuid: "JournalEntry.glass-gate.JournalEntryPage.npc-notes",
    scrollTop: 321
  });
});

test("standalone builders gate hidden entries and pages", async () => {
  const fixtures = createJournalFixtures();
  const hiddenEntry = fixtures.entries.find(entry => entry.uuid === "JournalEntry.hidden-plans");
  const hiddenPage = fixtures.pages.find(page => page.uuid === "JournalEntry.glass-gate.JournalEntryPage.gm-secrets");

  assert.equal(buildJournalEntryViewModel({ entry: hiddenEntry, user }).unavailable, true);
  assert.equal((await buildJournalPageViewModel({ page: hiddenPage, user })).unavailable, true);
});

test("journal page mutations use page permissions without allowing entry mutation", async () => {
  const fixtures = createJournalFixtures();
  const service = createMobileJournalService(createEnvironment(fixtures, { canCreatePage: true }));
  const entry = fixtures.entries.find(document => document.uuid === "JournalEntry.glass-gate");
  const editablePage = fixtures.pages.find(page => page.uuid === "JournalEntry.glass-gate.JournalEntryPage.npc-notes");
  const deletablePage = fixtures.pages.find(page => page.uuid === "JournalEntry.glass-gate.JournalEntryPage.gate-diagram");

  const created = await service.createPage("JournalEntry.glass-gate");
  assert.equal(created.ok, true);
  assert.equal(entry?.createdPages.length, 1);
  assert.deepEqual(created.route, {
    view: RouteView.Journal,
    entryUuid: "JournalEntry.glass-gate",
    pageUuid: "JournalEntry.glass-gate.JournalEntryPage.created-1",
    scrollTop: 0
  });

  const edited = await service.openPageEditor("JournalEntry.glass-gate.JournalEntryPage.npc-notes", "JournalEntry.glass-gate");
  assert.equal(edited.ok, true);
  assert.equal(editablePage?.sheetOpened, 1);

  const deleted = await service.deletePage("JournalEntry.glass-gate.JournalEntryPage.gate-diagram", "JournalEntry.glass-gate");
  assert.equal(deleted.ok, true);
  assert.equal(deletablePage?.deleted, 1);
  assert.deepEqual(deleted.route, { view: RouteView.Journal, entryUuid: "JournalEntry.glass-gate" });

  assert.deepEqual(await service.deletePage("JournalEntry.glass-gate.JournalEntryPage.field-report", "JournalEntry.glass-gate"), { ok: true, route: { view: RouteView.Journal, entryUuid: "JournalEntry.glass-gate" } });
  assert.equal(entry?.entryDeleted, 0);
  assert.equal(entry?.entryUpdated, 0);
});

test("journal page draft create and update use embedded page document APIs", async () => {
  const fixtures = createJournalFixtures();
  const service = createMobileJournalService(createEnvironment(fixtures));
  const editablePage = fixtures.pages.find(page => page.uuid === "JournalEntry.glass-gate.JournalEntryPage.npc-notes");

  const created = await service.createPageFromDraft("JournalEntry.glass-gate", {
    name: "Test Page",
    type: "text",
    textContent: "Created from Pocket Foundry.\nSecond line."
  });

  assert.equal(created.ok, true);
  assert.equal(fixtures.entries[0]?.createdPages.at(-1)?.name, "Test Page");
  assert.equal(fixtures.entries[0]?.createdPages.at(-1)?.type, "text");
  assert.deepEqual(fixtures.entries[0]?.createdPages.at(-1)?.text, {
    content: "<p>Created from Pocket Foundry.<br>Second line.</p>",
    format: 1
  });

  const updated = await service.updatePageFromDraft("JournalEntry.glass-gate.JournalEntryPage.npc-notes", "JournalEntry.glass-gate", {
    name: "Updated Notes",
    type: "text",
    textContent: "Updated from Pocket Foundry.\n\nSecond paragraph."
  });

  assert.equal(updated.ok, true);
  assert.equal(editablePage?.name, "Updated Notes");
  assert.deepEqual(editablePage?.updatedData.at(-1), {
    name: "Updated Notes",
    type: "text",
    text: {
      content: "<p>Updated from Pocket Foundry.</p><p>Second paragraph.</p>",
      format: 1
    }
  });
});

test("journal media page drafts require a source path", async () => {
  const fixtures = createJournalFixtures();
  const service = createMobileJournalService(createEnvironment(fixtures));

  assert.deepEqual(await service.createPageFromDraft("JournalEntry.glass-gate", {
    name: "No Source",
    type: "image"
  }), { ok: false, reason: "invalid" });

  const created = await service.createPageFromDraft("JournalEntry.glass-gate", {
    name: "Uploaded Image",
    type: "image",
    src: "storage/pocket-foundry/journal/upload.webp"
  });

  assert.equal(created.ok, true);
  assert.equal(fixtures.entries[0]?.createdPages.at(-1)?.src, "storage/pocket-foundry/journal/upload.webp");
});

function createEnvironment(
  fixtures: ReturnType<typeof createJournalFixtures>,
  options: {
    enrichHtml?: JournalTextEnricher;
    extras?: Array<JournalEntryDocumentLike | JournalPageDocumentLike>;
    canCreatePage?: boolean;
  } = {}
) {
  const documents = [...fixtures.entries, ...fixtures.pages, ...(options.extras ?? [])];
  return {
    collection: fixtures.entries,
    user,
    enrichHtml: options.enrichHtml,
    canCreatePage: () => options.canCreatePage === true,
    createPageDialog: async (entry: JournalEntryDocumentLike) => {
      const fixtureEntry = entry as FixtureEntry;
      const page = createPage(fixtureEntry, `created-${fixtureEntry.createdPages.length + 1}`, "New Image Page", "image", true, 999, {
        src: "images/new-page.webp",
        canUpdate: true,
        canDelete: true
      });
      fixtureEntry.createdPages.push(page);
      fixtureEntry.pages.push(page);
      documents.push(page);
      return page;
    },
    createPageData: async (entry: JournalEntryDocumentLike, data: Record<string, unknown>) => {
      const fixtureEntry = entry as FixtureEntry;
      const page = createPage(
        fixtureEntry,
        `created-${fixtureEntry.createdPages.length + 1}`,
        String(data.name ?? "New Page"),
        String(data.type ?? "text"),
        true,
        999,
        {
          text: data.text as FixturePage["text"],
          src: typeof data.src === "string" ? data.src : undefined,
          canUpdate: true,
          canDelete: true
        }
      );
      fixtureEntry.createdPages.push(page);
      fixtureEntry.pages.push(page);
      documents.push(page);
      return page;
    },
    fromUuid: async (uuid: string) => documents.find(document => document.uuid === uuid) ?? null
  };
}

function createJournalFixtures(): { entries: FixtureEntry[]; pages: FixturePage[] } {
  const glassGate = createEntry("JournalEntry.glass-gate", "The Glass Gate", true, 10, true);
  const hiddenPlans = createEntry("JournalEntry.hidden-plans", "Hidden Plans", false, 20);
  const travelLog = createEntry("JournalEntry.travel-log", "Travel Log", true, 30);

  const pages = [
    createPage(glassGate, "npc-notes", "NPC Notes", "text", true, 10, {
      text: { content: "<p>Visible notes about the gate.</p>", format: 1, markdown: "Visible notes about the gate." },
      canUpdate: true
    }),
    createPage(glassGate, "gm-secrets", "GM Secrets", "text", false, 20, {
      text: { content: "<p>Secret gate controls.</p>", format: 1 }
    }),
    createPage(glassGate, "gate-diagram", "Gate Diagram", "image", true, 30, { src: "images/gate.webp", canDelete: true }),
    createPage(glassGate, "field-report", "Field Report", "pdf", true, 40, { src: "docs/report.pdf" }),
    createPage(glassGate, "memory-echo", "Memory Echo", "video", true, 50, { src: "video/echo.webm" }),
    createPage(glassGate, "relic-data", "Relic Data", "foundry", true, 60),
    createPage(hiddenPlans, "secret", "Hidden Agenda", "text", true, 10, { text: { content: "<p>Hidden entry page.</p>" } })
  ];

  glassGate.pages = pages.filter(page => page.parent === glassGate);
  hiddenPlans.pages = pages.filter(page => page.parent === hiddenPlans);
  travelLog.pages = [];

  return { entries: [glassGate, hiddenPlans, travelLog], pages };
}

function createEntry(uuid: string, name: string, visible: boolean, sort: number, owner = false): FixtureEntry {
  return {
    uuid,
    id: uuid.split(".").at(-1) ?? uuid,
    name,
    documentName: "JournalEntry",
    visible,
    isOwner: false,
    pages: [],
    sort,
    createdPages: [],
    entryDeleted: 0,
    entryUpdated: 0,
    testUserPermission: (_user, level) => (level === "OWNER" ? owner : level === "OBSERVER" && visible),
    canUserModify: () => false,
    getUserLevel: () => (visible ? 2 : 0),
    update() {
      this.entryUpdated += 1;
      return Promise.resolve(this);
    },
    delete() {
      this.entryDeleted += 1;
      return Promise.resolve(this);
    }
  };
}

function createPage(
  entry: FixtureEntry,
  id: string,
  name: string,
  type: string,
  visible: boolean,
  sort: number,
  options: {
    text?: FixturePage["text"];
    src?: string;
    canUpdate?: boolean;
    canDelete?: boolean;
  } = {}
): FixturePage {
  const uuid = `${entry.uuid}.JournalEntryPage.${id}`;
  const page: FixturePage = {
    uuid,
    id,
    name,
    documentName: "JournalEntryPage",
    parent: entry,
    type,
    visible,
    sort,
    deleted: 0,
    sheetOpened: 0,
    updatedData: [],
    text: options.text,
    src: options.src,
    isOwner: options.canUpdate === true,
    testUserPermission: (_user, level) => level === "OBSERVER" && visible,
    canUserModify: (_user, action) => (action === "update" && options.canUpdate === true) || (action === "delete" && options.canDelete === true),
    getUserLevel: () => (visible ? (options.canUpdate ? 3 : 2) : 0),
    delete() {
      this.deleted += 1;
      return Promise.resolve(this);
    },
    update(data: Record<string, unknown>) {
      this.updatedData.push(data);
      if (typeof data.name === "string") this.name = data.name;
      if (typeof data.type === "string") this.type = data.type;
      if (data.text && typeof data.text === "object") this.text = data.text as FixturePage["text"];
      if (typeof data.src === "string") this.src = data.src;
      return Promise.resolve(this);
    },
    sheet: {
      render: () => {
        page.sheetOpened += 1;
      }
    }
  };
  return page;
}

function createLinkedDocument(uuid: string, name: string, documentName: "Actor" | "Item", visible = true): JournalEntryDocumentLike {
  return {
    uuid,
    id: uuid.split(".").at(-1) ?? uuid,
    name,
    documentName,
    testUserPermission: (_user, level) => level === "OBSERVER" && visible,
    canUserModify: () => false,
    getUserLevel: () => (visible ? 2 : 0)
  };
}

