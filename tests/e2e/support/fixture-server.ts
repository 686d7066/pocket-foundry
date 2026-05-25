import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type FixtureServer = {
  port: number;
  close: () => void;
};

export async function startFixtureServer(projectRoot: string): Promise<FixtureServer> {
  const server = createServer((request, response) => handleRequest(projectRoot, request, response));

  const port = await new Promise<number>(resolvePort => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Could not bind browser test server.");
      resolvePort(address.port);
    });
  });

  return {
    port,
    close: () => server.close()
  };
}

function handleRequest(projectRoot: string, request: IncomingMessage, response: ServerResponse): void {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (url.pathname === "/browser-history.html") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(getBrowserHistoryFixtureHtml());
    return;
  }

  if (url.pathname === "/favorite-context.html") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(getFavoriteContextFixtureHtml());
    return;
  }

  if (url.pathname === "/join") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><title>Foundry Login</title><h1>Foundry Login</h1>");
    return;
  }

  if (url.pathname === "/modules/pocket-foundry/scripts/pocket-foundry.js") {
    response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    response.end(readFileSync(resolve(projectRoot, "dist/pocket-foundry/scripts/pocket-foundry.js"), "utf8"));
    return;
  }

  if (url.pathname === "/modules/pocket-foundry/styles/pocket-foundry.css") {
    response.writeHead(200, { "content-type": "text/css; charset=utf-8" });
    response.end(readFileSync(resolve(projectRoot, "dist/pocket-foundry/styles/pocket-foundry.css"), "utf8"));
    return;
  }

  response.writeHead(404);
  response.end("Not found");
}

function getBrowserHistoryFixtureHtml(): string {
  return String.raw`<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Pocket Foundry Browser History Test</title><link rel="stylesheet" href="/modules/pocket-foundry/styles/pocket-foundry.css"></head>
  <body>
    <script>
      window.__beforeUnloadCount = 0;
      window.__foundryPopstateCount = 0;
      window.__foundryConfirmResults = [];
      window.__pocketFoundryBrowserTestReady = false;
      window.addEventListener("beforeunload", event => {
        window.__beforeUnloadCount += 1;
        event.preventDefault();
        event.returnValue = "Foundry leave guard";
      });
      window.addEventListener("popstate", () => {
        window.__foundryPopstateCount += 1;
        const result = window.confirm("Are you sure you want to exit the Foundry Virtual Tabletop game?");
        window.__foundryConfirmResults.push(result);
        if (result) window.location.href = "/join";
      });
      window.game = {
        settings: {
          register() {},
          get() { return true; },
          async set() { return true; }
        }
      };
      window.renderTemplate = async (_path, data) => {
        const nav = data.bottomNav.items.map(item => '<button data-action="' + item.action + '" data-route="' + item.route + '" class="' + (item.active ? "active" : "") + '">' + item.label + '</button>').join("");
        return '<main class="pocket-foundry-root mf-app" data-view="' + data.activeDestination + '"><header class="mf-header"><button data-action="back">Back</button><h1>' + data.title + '</h1></header><section class="content"><p>' + data.activeDestination + '</p></section><nav class="bottom-nav">' + nav + '</nav></main>';
      };
      import("/modules/pocket-foundry/scripts/pocket-foundry.js").then(async () => {
        await window.pocketFoundry.mobileShell.mount();
        window.__pocketFoundryBrowserTestReady = true;
      });
    </script>
  </body>
</html>`;
}

function getFavoriteContextFixtureHtml(): string {
  return String.raw`<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Pocket Foundry Favorite Context Test</title><link rel="stylesheet" href="/modules/pocket-foundry/styles/pocket-foundry.css"></head>
  <body>
    <script>
      window.__favoriteCalls = [];
      window.__pocketFoundryFavoriteContextReady = false;
      const actor = {
        uuid: "Actor.arlen",
        id: "arlen",
        name: "Arlen Mire",
        type: "character",
        img: null,
        system: {
          abilities: { dex: { value: 16, mod: 3, save: { value: 3 } } },
          attributes: {
            ac: { value: 14 },
            hp: { value: 18, max: 24, effectiveMax: 24, temp: 0 },
            movement: { walk: 30 },
            prof: 2,
            hd: { value: 2, max: 3 },
            death: { success: 0, failure: 0 }
          },
          details: { level: 3 },
          skills: { acr: { ability: "dex", total: 5, passive: 15, prof: 1 } },
          tools: { thieves: { ability: "dex", total: 5, prof: 1 } },
          traits: {},
          favorites: [],
          async addFavorite(favorite) {
            window.__favoriteCalls.push(["add", favorite]);
            this.favorites.push(favorite);
            return true;
          },
          async removeFavorite(id) {
            window.__favoriteCalls.push(["remove", id]);
            this.favorites = this.favorites.filter(favorite => favorite.id !== id);
            return true;
          }
        },
        items: [],
        effects: [],
        testUserPermission(_user, level) { return level === "OBSERVER"; },
        canUserModify(_user, action) { return action === "update"; },
        getUserLevel() { return 3; },
        async update() { return this; }
      };

      window.CONFIG = {
        DND5E: {
          skills: { acr: { label: "Acrobatics" } },
          tools: { thieves: { label: "Thieves' Tools" } }
        }
      };
      window.game = {
        user: { id: "player" },
        system: { id: "dnd5e" },
        actors: [actor],
        items: [],
        journal: [],
        packs: [],
        settings: {
          register() {},
          get() { return true; },
          async set() { return true; }
        }
      };
      window.foundry = {
        utils: {
          fromUuidSync(uuid) { return uuid === actor.uuid ? actor : null; },
          async fromUuid(uuid) { return uuid === actor.uuid ? actor : null; }
        }
      };
      window.renderTemplate = async (_path, data) => {
        const details = data.actorSheet && data.actorSheet.details && !data.actorSheet.details.unavailable ? data.actorSheet.details : null;
        const skills = details ? details.skills.map(skill => '<div class="detail-table-row skill-row" data-favorite-context data-test-skill="' + skill.id + '"><strong>' + skill.label + '</strong>' + (skill.canToggleFavorite ? '<div class="favorite-context-menu" role="menu"><button class="context-action" type="button" role="menuitem" data-action="' + (skill.favorite ? "context-remove-favorite" : "context-add-favorite") + '" data-favorite-type="skill" data-favorite-id="' + skill.id + '" data-swipe-ignore>' + (skill.favorite ? "Remove from Favorites" : "Add to Favorites") + '</button></div>' : "") + '</div>').join("") : "";
        const tools = details ? details.tools.map(tool => '<div class="detail-table-row tool-row" data-favorite-context data-test-tool="' + tool.id + '"><strong>' + tool.label + '</strong>' + (tool.canToggleFavorite ? '<div class="favorite-context-menu" role="menu"><button class="context-action" type="button" role="menuitem" data-action="' + (tool.favorite ? "context-remove-favorite" : "context-add-favorite") + '" data-favorite-type="tool" data-favorite-id="' + tool.id + '" data-swipe-ignore>' + (tool.favorite ? "Remove from Favorites" : "Add to Favorites") + '</button></div>' : "") + '</div>').join("") : "";
        return '<main class="pocket-foundry-root mf-app" data-view="' + data.activeDestination + '"><section class="content" data-swipe-region="character-pane">' + skills + tools + '</section></main>';
      };
      import("/modules/pocket-foundry/scripts/pocket-foundry.js").then(async () => {
        await window.pocketFoundry.mobileShell.mount();
        window.__pocketFoundryFavoriteContextReady = true;
      });
    </script>
  </body>
</html>`;
}
