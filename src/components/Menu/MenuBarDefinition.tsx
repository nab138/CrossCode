import { openUrl } from "@tauri-apps/plugin-opener";
import { MenuBarData } from "./MenuGroup";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useParams } from "react-router-dom";
import { useIDE } from "../../utilities/IDEContext";
import CommandButton from "../CommandButton";
import { useStore } from "../../utilities/StoreContext";
import { useToast } from "react-toast-plus";
import { MenuItem } from "@mui/joy";
import { invoke } from "@tauri-apps/api/core";
import { initWebSocketAndStartClient } from "../../utilities/lsp-client";

export default [
  {
    label: "File",
    items: [
      {
        label: "New",
        items: [
          {
            name: "New File...",
            shortcut: "Ctrl+N",
            callback: () => {
              console.log("New File!");
            },
          },
          {
            name: "New Project...",
            callbackName: "newProject",
          },
        ],
      },
      {
        label: "Open",
        items: [
          {
            name: "Open File...",
            shortcut: "Ctrl+O",
            callback: () => {
              console.log("Open File!");
            },
          },
          {
            name: "Open Folder...",
            callbackName: "openFolderDialog",
          },
        ],
      },
      {
        label: "Save",
        items: [
          {
            name: "Save",
            shortcut: "Ctrl+S",
            callbackName: "save",
          },
          {
            name: "Save As...",
            shortcut: "Ctrl+Shift+S",
            callback: () => {
              console.log("Save As!");
            },
          },
        ],
      },
    ],
  },
  {
    label: "Edit",
    items: [
      {
        label: "Timeline",
        items: [
          {
            name: "Undo",
            shortcut: "Ctrl+Z",
            callback: () => {
              console.log("Undo!");
            },
          },
          {
            name: "Redo",
            shortcut: "Ctrl+Shift+Z",
            callback: () => {
              console.log("Redo!");
            },
          },
        ],
      },
      {
        label: "Settings",
        items: [
          {
            name: "Preferences...",
            callback: async () => {
              let prefsWindow = await WebviewWindow.getByLabel("prefs");
              if (prefsWindow) {
                prefsWindow.show();
                prefsWindow.center();
                prefsWindow.setFocus();
                return;
              }

              const appWindow = new WebviewWindow("prefs", {
                title: "Preferences",
                resizable: false,
                width: 800,
                height: 600,
                url: "/preferences/general",
              });
              appWindow.once("tauri://created", function () {
                appWindow.center();
              });
              appWindow.once("tauri://error", function (e) {
                console.error("Error creating window:", e);
              });
            },
          },
        ],
      },
    ],
  },
  {
    label: "View",
    items: [
      {
        label: "Navigation",
        items: [
          {
            name: "Show Welcome Page",
            callbackName: "welcomePage",
          },
        ],
      },
      {
        label: "Debug",
        items: [
          {
            name: "Reload Window",
            callback: async () => {
              window.location.reload();
            },
            shortcut: "Ctrl+R",
          },
        ],
      },
    ],
  },
  {
    label: "Build",
    items: [
      {
        label: "Build",
        items: [
          {
            name: "Build .ipa (Debug)",
            shortcut: "Ctrl+B",
            component: ({ shortcut }) => {
              const { path } = useParams<"path">();
              const { selectedToolchain } = useIDE();
              return (
                <CommandButton
                  shortcut={shortcut}
                  command="build_swift"
                  parameters={{
                    folder: path,
                    toolchainPath: selectedToolchain?.path ?? "",
                    debug: true,
                  }}
                  label="Build .ipa (Debug)"
                  useMenuItem
                  id="buildDebugMenuBtn"
                />
              );
            },
            componentId: "buildDebugMenuBtn",
          },
          {
            name: "Build .ipa (Release)",
            shortcut: "Ctrl+Shift+B",
            component: ({ shortcut }) => {
              const { path } = useParams<"path">();
              const { selectedToolchain } = useIDE();
              return (
                <CommandButton
                  shortcut={shortcut}
                  command="build_swift"
                  parameters={{
                    folder: path,
                    toolchainPath: selectedToolchain?.path ?? "",
                    debug: false,
                  }}
                  label="Build .ipa (Release)"
                  useMenuItem
                  id="buildReleaseMenuBtn"
                />
              );
            },
            componentId: "buildReleaseMenuBtn",
          },
          {
            name: "Build & Install",
            shortcut: "Ctrl+I",
            component: ({ selectedDevice, shortcut }) => {
              const { path } = useParams<"path">();
              const { selectedToolchain } = useIDE();
              const [anisetteServer] = useStore<string>(
                "apple-id/anisette-server",
                "ani.sidestore.io"
              );
              const { addToast } = useToast();
              return (
                <CommandButton
                  shortcut={shortcut}
                  command="deploy_swift"
                  parameters={{
                    folder: path,
                    anisetteServer,
                    device: selectedDevice,
                    toolchainPath: selectedToolchain?.path ?? "",
                    debug: true,
                  }}
                  label="Build & Install"
                  validate={() => {
                    if (!selectedDevice) {
                      addToast.error("Please select a device to deploy to.");
                      return false;
                    }
                    return true;
                  }}
                  useMenuItem
                  id="deployMenuBtn"
                />
              );
            },
            componentId: "deployMenuBtn",
          },
        ],
      },
      {
        label: "Clean",
        items: [
          {
            name: "Clean",
            shortcut: "Ctrl+Shift+C",
            component: ({ shortcut }) => {
              const { path } = useParams<"path">();
              const { selectedToolchain } = useIDE();
              return (
                <CommandButton
                  shortcut={shortcut}
                  command="clean_swift"
                  parameters={{
                    folder: path,
                    toolchainPath: selectedToolchain?.path ?? "",
                  }}
                  label="Clean"
                  useMenuItem
                  id="cleanMenuBtn"
                />
              );
            },
            componentId: "cleanMenuBtn",
          },
        ],
      },
      {
        label: "Start LSP",
        items: [
          {
            name: "Restart LSP",
            component: () => {
              const { path } = useParams<"path">();
              const { selectedToolchain } = useIDE();
              return (
                <MenuItem
                  onClick={async () => {
                    try {
                      await invoke<number>("stop_sourcekit_server");
                    } catch (e) {
                      void e;
                    }
                    let port = await invoke<number>("start_sourcekit_server", {
                      toolchainPath: selectedToolchain?.path ?? "",
                      folder: path || "",
                    });
                    initWebSocketAndStartClient(
                      `ws://localhost:${port}`,
                      path || ""
                    );
                  }}
                  id="startLSPMenuBtn"
                >
                  Restart LSP
                </MenuItem>
              );
            },
            componentId: "startLSPMenuBtn",
          },
          {
            name: "Stop LSP",
            component: () => {
              return (
                <MenuItem
                  onClick={async () => {
                    await invoke<number>("stop_sourcekit_server");
                  }}
                  id="stopLSPMenuBtn"
                >
                  Stop LSP
                </MenuItem>
              );
            },
            componentId: "stopLSPMenuBtn",
          },
        ],
      },
    ],
  },
  {
    label: "Help",
    items: [
      {
        label: "About YCode",
        items: [
          {
            name: "View Github",
            callback: () => {
              openUrl("https://github.com/nab138/YCode");
            },
          },
          {
            name: "Report Issue",
            callback: () => {
              openUrl("https://github.com/nab138/YCode/issues");
            },
          },
        ],
      },
    ],
  },
] as MenuBarData;
