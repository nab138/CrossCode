// https://github.com/CodinGame/monaco-vscode-api/wiki/Getting-started-guide

// lsp-client.ts
import {
  WebSocketMessageReader,
  WebSocketMessageWriter,
  toSocket,
} from "vscode-ws-jsonrpc";
import {
  CloseAction,
  ErrorAction,
  MessageTransports,
} from "vscode-languageclient/browser.js";
import { MonacoLanguageClient } from "monaco-languageclient";
import { Toolchain } from "./IDEContext";
import { invoke } from "@tauri-apps/api/core";
import { Uri } from "monaco-editor";

export const initWebSocketAndStartClient = async (
  url: string,
  folder: string
): Promise<WebSocket> => {
  let workspaceFolder = await invoke<string>("linux_path", { path: folder });
  const webSocket = new WebSocket(url);
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
      documentSelector: ["swift", "c", "cpp", "h", "hpp", "m", "mm"],
      workspaceFolder: { uri: Uri.file(folder), name: folder, index: 0 },
      errorHandler: {
        error: () => ({ action: ErrorAction.Continue }),
        closed: () => ({ action: CloseAction.DoNotRestart }),
      },
      initializationOptions: {
        swiftPM: {
          swiftSDK: "arm64-apple-ios",
        },
      },
      middleware: {
        workspace: {
          configuration: () => {
            return [
              {
                swiftPM: {
                  swiftSDK: "arm64-apple-ios",
                },
              },
            ];
          },
        },
      },
    },
    messageTransports,
  });
};

export const restartServer = async (
  path: string,
  selectedToolchain: Toolchain
) => {
  // this has been replaced with the middleware above
  // await invoke("ensure_lsp_config", {
  //   projectPath: path || "",
  // });
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
