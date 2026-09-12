import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import {
  closeShellActionErrorDialog,
  getShellActionErrorMessage,
  reportShellActionError
} from "../src/core/mobile-shell/controller-helpers-ui.ts";

const originalConsole = globalThis.console;

afterEach(() => {
  Reflect.deleteProperty(globalThis, "document");
  Reflect.deleteProperty(globalThis, "ui");
  Object.defineProperty(globalThis, "console", {
    configurable: true,
    value: originalConsole
  });
});

test("shell action errors show a friendly message with expandable technical details", () => {
  const root = createElement("div");
  const notifications: string[] = [];
  installDom();
  Object.defineProperty(globalThis, "ui", {
    configurable: true,
    value: {
      notifications: {
        error: (message: string) => notifications.push(message)
      }
    }
  });
  Object.defineProperty(globalThis, "console", {
    configurable: true,
    value: {
      error: () => undefined
    }
  });

  reportShellActionError(root as unknown as HTMLElement, new Error("Exploded test failure"), { kind: "journal", action: "test-action" });

  assert.deepEqual(notifications, [getShellActionErrorMessage("journal")]);
  assert.equal(root.findText("p"), getShellActionErrorMessage("journal"));
  assert.equal(root.findText("summary"), "Detailed information");
  assert.match(root.findText("pre"), /Exploded test failure/);
  assert.doesNotMatch(root.findText("p"), /Exploded test failure/);
  assert.equal(root.querySelectorAll("[data-shell-action-error-dialog='shell-action-error']").length, 1);
});

test("shell action error dialogs can be closed by the delegated shell action", () => {
  const root = createElement("div");
  installDom();
  Object.defineProperty(globalThis, "console", {
    configurable: true,
    value: {
      error: () => undefined
    }
  });

  reportShellActionError(root as unknown as HTMLElement, "Raw detail", { kind: "navigation", action: "test-action" });
  assert.equal(root.querySelectorAll("[data-shell-action-error-dialog='shell-action-error']").length, 1);

  closeShellActionErrorDialog(root as unknown as HTMLElement);

  assert.equal(root.querySelectorAll("[data-shell-action-error-dialog='shell-action-error']").length, 0);
});

type TestElement = {
  tagName: string;
  className: string;
  dataset: Record<string, string>;
  textContent: string;
  children: TestElement[];
  parent?: TestElement;
  type: string;
  append: (...elements: TestElement[]) => void;
  setAttribute: (name: string, value: string) => void;
  querySelector: <T>(selector: string) => T | null;
  querySelectorAll: <T>(selector: string) => T[];
  remove: () => void;
  focus: () => void;
  findText: (tagName: string) => string;
};

function installDom(): void {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: (tagName: string) => createElement(tagName)
    }
  });
}

function createElement(tagName: string): TestElement {
  return {
    tagName,
    className: "",
    dataset: {},
    textContent: "",
    children: [],
    type: "",
    append(...elements) {
      for (const element of elements) {
        element.parent = this;
        this.children.push(element);
      }
    },
    setAttribute(name, value) {
      if (name === "class") this.className = value;
    },
    querySelector<T>(selector: string): T | null {
      return findElement(this, selector) as T | null;
    },
    querySelectorAll<T>(selector: string): T[] {
      return findElements(this, selector) as T[];
    },
    remove() {
      if (!this.parent) return;
      this.parent.children = this.parent.children.filter(child => child !== this);
      this.parent = undefined;
    },
    focus() {
      return undefined;
    },
    findText(tag) {
      return findByTag(this, tag)?.textContent ?? "";
    }
  };
}

function findElement(root: TestElement, selector: string): TestElement | null {
  return findElements(root, selector)[0] ?? null;
}

function findElements(root: TestElement, selector: string): TestElement[] {
  const matches: TestElement[] = [];
  for (const child of root.children) {
    if (matchesSelector(child, selector)) matches.push(child);
    matches.push(...findElements(child, selector));
  }
  return matches;
}

function matchesSelector(element: TestElement, selector: string): boolean {
  if (selector === ".pocket-foundry-root") return element.className.split(/\s+/).includes("pocket-foundry-root");
  const dataMatch = selector.match(/^\[data-([a-z-]+)='([^']+)'\]$/);
  if (!dataMatch) return false;
  const key = dataMatch[1]?.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase()) ?? "";
  return element.dataset[key] === dataMatch[2];
}

function findByTag(root: TestElement, tagName: string): TestElement | null {
  for (const child of root.children) {
    if (child.tagName === tagName) return child;
    const match = findByTag(child, tagName);
    if (match) return match;
  }
  return null;
}
