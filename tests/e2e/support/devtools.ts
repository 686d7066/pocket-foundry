type CdpResponse = {
  id?: number;
  result?: unknown;
  error?: { message: string };
  method?: string;
  params?: unknown;
};

export type CdpClient = {
  send: (method: string, params?: object) => Promise<unknown>;
  getDialogMessages: () => readonly string[];
  getConsoleMessages: () => readonly unknown[];
  close: () => Promise<void>;
};

export async function connectToPage(debuggingPort: number): Promise<CdpClient> {
  const pageSocketUrl = await waitForPageSocket(debuggingPort);
  const client = await connectCdp(pageSocketUrl);
  await client.send("Runtime.enable");
  await client.send("Page.enable");
  return client;
}

export async function click(cdp: CdpClient, selector: string): Promise<void> {
  await evaluate(cdp, `document.querySelector(${JSON.stringify(selector)}).click()`);
}

export async function evaluate(cdp: CdpClient, expression: string): Promise<unknown> {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  }) as { result?: { value?: unknown }; exceptionDetails?: unknown };

  if (result.exceptionDetails) throw new Error(`Browser evaluation failed: ${expression}`);
  return result.result?.value;
}

export async function waitForRuntimeFlag(cdp: CdpClient, expression: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate(cdp, expression)) return;
    await delay(50);
  }

  throw new Error(`Timed out waiting for browser expression: ${expression}`);
}

async function waitForPageSocket(debuggingPort: number): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const pages = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`).then(response => response.json()) as Array<{
      type: string;
      webSocketDebuggerUrl: string;
    }>;
    const page = pages.find(candidate => candidate.type === "page");
    if (page) return page.webSocketDebuggerUrl;
    await delay(50);
  }

  throw new Error("Chrome did not expose a page target.");
}

async function connectCdp(url: string): Promise<CdpClient> {
  const socket = new WebSocket(url);
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: unknown) => void }>();
  const dialogMessages: string[] = [];
  const consoleMessages: unknown[] = [];
  let nextId = 1;

  socket.addEventListener("message", event => {
    const message = JSON.parse(String(event.data)) as CdpResponse;
    if (message.method === "Runtime.consoleAPICalled") {
      consoleMessages.push(message.params);
      return;
    }
    if (message.method === "Page.javascriptDialogOpening") {
      const params = message.params as { message?: string } | undefined;
      dialogMessages.push(params?.message ?? "");
      void client.send("Page.handleJavaScriptDialog", { accept: false });
      return;
    }
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  await new Promise<void>((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", () => resolveOpen(), { once: true });
    socket.addEventListener("error", error => rejectOpen(error), { once: true });
  });

  const client: CdpClient = {
    send(method: string, params: object = {}): Promise<unknown> {
      const id = nextId;
      nextId += 1;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolveRequest, rejectRequest) => pending.set(id, { resolve: resolveRequest, reject: rejectRequest }));
    },
    getDialogMessages: () => [...dialogMessages],
    getConsoleMessages: () => [...consoleMessages],
    close(): Promise<void> {
      socket.close();
      return Promise.resolve();
    }
  };

  return client;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}
