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

export const initWebSocketAndStartClient = (
  url: string,
  folder: string
): WebSocket => {
  const webSocket = new WebSocket(url);
  webSocket.onopen = () => {
    // creating messageTransport
    const socket = toSocket(webSocket);
    const reader = new WebSocketMessageReader(socket);
    const writer = new WebSocketMessageWriter(socket);
    // creating language client
    const languageClient = createLanguageClient(
      {
        reader,
        writer,
      },
      folder
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
