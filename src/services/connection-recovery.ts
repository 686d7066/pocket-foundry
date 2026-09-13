export type ConnectionSocket = {
  connected?: boolean;
  on?(event: "connect" | "disconnect" | "connect_error", callback: () => void): void;
  off?(event: "connect" | "disconnect" | "connect_error", callback: () => void): void;
};

export type ConnectionRecoveryController = {
  dispose(): void;
};

/**
 * Uses Socket.IO's public connection events and browser resume signals to
 * request an authoritative character refresh without replaying writes.
 */
export function createConnectionRecoveryController(options: {
  socket?: ConnectionSocket | null;
  document?: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener"> | null;
  window?: Pick<Window, "addEventListener" | "removeEventListener"> | null;
  onDisconnected: () => void;
  onRecoveryRequested: (isCurrent: () => boolean) => void | Promise<void>;
}): ConnectionRecoveryController {
  const socket = options.socket;
  const documentValue = options.document;
  const windowValue = options.window;
  let disposed = false;
  let recovery: Promise<void> | undefined;
  let recoveryGeneration = 0;
  let trailingRecovery = false;

  /** Coalesces connect and resume signals into one recovery read. */
  function requestRecovery(): void {
    if (disposed || socket?.connected === false) return;
    const generation = ++recoveryGeneration;
    if (recovery) {
      trailingRecovery = true;
      return;
    }
    recovery = Promise.resolve()
      .then(() => options.onRecoveryRequested(() => !disposed && generation === recoveryGeneration))
      .catch(() => undefined)
      .finally(() => {
      recovery = undefined;
      if (trailingRecovery && !disposed) {
        trailingRecovery = false;
        requestRecovery();
      }
    });
  }

  const onDisconnect = (): void => {
    if (!disposed) {
      recoveryGeneration += 1;
      options.onDisconnected();
    }
  };
  const onConnect = (): void => requestRecovery();
  const onConnectError = (): void => onDisconnect();
  const onVisibilityChange = (): void => {
    if (documentValue?.visibilityState === "visible") requestRecovery();
  };
  const onPageShow = (): void => requestRecovery();

  socket?.on?.("disconnect", onDisconnect);
  socket?.on?.("connect", onConnect);
  socket?.on?.("connect_error", onConnectError);
  documentValue?.addEventListener?.("visibilitychange", onVisibilityChange);
  windowValue?.addEventListener?.("pageshow", onPageShow);
  if (socket?.connected === false) onDisconnect();

  return {
    dispose: () => {
      disposed = true;
      recoveryGeneration += 1;
      trailingRecovery = false;
      socket?.off?.("disconnect", onDisconnect);
      socket?.off?.("connect", onConnect);
      socket?.off?.("connect_error", onConnectError);
      documentValue?.removeEventListener?.("visibilitychange", onVisibilityChange);
      windowValue?.removeEventListener?.("pageshow", onPageShow);
    }
  };
}
