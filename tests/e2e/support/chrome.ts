import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

export type ChromeSession = {
  userDataDir: string;
  process: ChildProcessWithoutNullStreams;
  debuggingPort: number;
  close: () => Promise<void>;
};

export async function launchChrome(url: string): Promise<ChromeSession> {
  const userDataDir = mkdtempSync(resolve(tmpdir(), "pocket-foundry-chrome-"));
  const chromeProcess = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--window-size=1280,900",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    url
  ]);
  const debuggingPort = await waitForDebuggingPort(userDataDir);

  return {
    userDataDir,
    process: chromeProcess,
    debuggingPort,
    close: async () => {
      await stopChrome(chromeProcess);
      removeChromeProfile(userDataDir);
    }
  };
}

async function waitForDebuggingPort(profileDir: string): Promise<number> {
  const activePortPath = resolve(profileDir, "DevToolsActivePort");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const [port] = readFileSync(activePortPath, "utf8").trim().split(/\r?\n/);
      if (port) return Number(port);
    } catch {
      await delay(50);
    }
  }

  throw new Error("Chrome did not expose a DevTools port.");
}

function stopChrome(chromeProcess: ChildProcessWithoutNullStreams): Promise<void> {
  if (chromeProcess.exitCode !== null) return Promise.resolve();

  chromeProcess.kill();
  return new Promise(resolveStop => {
    chromeProcess.once("exit", () => resolveStop());
    setTimeout(() => resolveStop(), 5000);
  });
}

function removeChromeProfile(profileDir: string): void {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      rmSync(profileDir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 9) throw error;
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}
