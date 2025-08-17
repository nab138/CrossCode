// https://github.com/CodinGame/monaco-vscode-api/wiki/Getting-started-guide

// lsp-client.ts
import { WebSocketMessageReader } from "vscode-ws-jsonrpc";
import {
  CloseAction,
  ErrorAction,
  MessageTransports,
} from "vscode-languageclient/browser.js";
import { WebSocketMessageWriter } from "vscode-ws-jsonrpc";
import { toSocket } from "vscode-ws-jsonrpc";
import { MonacoLanguageClient } from "monaco-languageclient";
import { Uri } from "vscode";
import { Toolchain } from "./IDEContext";
import { invoke } from "@tauri-apps/api/core";

export const initWebSocketAndStartClient = async (
  url: string,
  folder: string
): Promise<WebSocket> => {
  const webSocket = new WebSocket(url);
  let workspaceFolder = await invoke<string>("linux_path", {path: folder});
  webSocket.onopen = () => {
    const socket = toSocket(webSocket);
    const reader = new WebSocketMessageReader(socket);
    const writer = new WebSocketMessageWriter(socket);

    const languageClient = createLanguageClient(
      {
        reader,
        writer,
      },
      workspaceFolder
    );
    languageClient.start();
    reader.onClose(() => languageClient.stop());
  };
  return webSocket;
};
const createLanguageClient = (
  messageTransports: MessageTransports,
  folder: string
): MonacoLanguageClient => {
  return new MonacoLanguageClient({
    name: "Swift Language Client",
    clientOptions: {
      documentSelector: ["swift"],
      workspaceFolder: { uri: Uri.file(folder), name: folder, index: 0 },
      errorHandler: {
        error: () => ({ action: ErrorAction.Continue }),
        closed: () => ({ action: CloseAction.DoNotRestart }),
      },
      initializationOptions: {},
    },
    messageTransports,
  });
};

export const restartServer = async (
  path: string,
  selectedToolchain: Toolchain
) => {
  await invoke("ensure_lsp_config", {
    projectPath: path || "",
  });
  try {
    await invoke<number>("stop_sourcekit_server");
  } catch (e) {
    void e;
  }
  let port = await invoke<number>("start_sourcekit_server", {
    toolchainPath: selectedToolchain?.path ?? "",
    folder: path || "",
  });
  await initWebSocketAndStartClient(`ws://localhost:${port}`, path || "");
};
