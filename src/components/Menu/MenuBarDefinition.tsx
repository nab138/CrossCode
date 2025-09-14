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
import { restartServer } from "../../utilities/lsp-client";
import { open } from "@tauri-apps/plugin-dialog";
import { useContext } from "react";
import { UpdateContext } from "../../utilities/UpdateContext";

export default [
  {
    label: "File",
    items: [
      {
        label: "New",
        items: [
          // {
          //   name: "New File...",
          //   shortcut: "Ctrl+N",
          //   callback: () => {
          //     alert("Not implemented yet :(");
          //   },
          // },
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
            callbackName: "openFile",
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
              alert("Not implemented yet :(");
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
            ignoreShortcutInMonaco: true,
            callbackName: "undo",
          },
          {
            name: "Redo",
            shortcut: "Ctrl+Shift+Z",
            ignoreShortcutInMonaco: true,
            callbackName: "redo",
          },
        ],
      },
      {
        label: "Icon",
        items: [
          {
            name: "Import Icon",
            component: () => {
              const { path } = useParams<"path">();
              const { addToast } = useToast();
              return (
                <MenuItem
                  onClick={async () => {
                    if (!path) return;
                    const iconPath = await open({
                      title: "Select Icon",
                      multiple: false,
                      directory: false,
                      filters: [
                        {
                          name: "Images",
                          extensions: ["png", "jpg", "jpeg", "gif"],
                        },
                      ],
                    });
                    addToast.promise(
                      invoke("import_icon", {
                        projectPath: path,
                        iconPath: iconPath,
                      }),
                      {
                        pending: "Importing icon...",
                        success: "Successfully imported icon!",
                        error: "Failed to import icon",
                      }
                    );
                  }}
                  id="startLSPMenuBtn"
                >
                  Import Icon
                </MenuItem>
              );
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
                    if (!selectedToolchain || !path) return;
                    restartServer(path, selectedToolchain).catch((e) => {
                      console.error("Failed to restart SourceKit-LSP:", e);
                    });
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
        label: "About CrossCode",
        items: [
          {
            name: "View Github",
            callback: () => {
              openUrl("https://github.com/nab138/CrossCode");
            },
          },
          {
            name: "Report Issue",
            callback: () => {
              openUrl("https://github.com/nab138/CrossCode/issues");
            },
          },
          {
            name: "Troubleshooting",
            callback: () => {
              openUrl(
                "https://github.com/nab138/CrossCode/wiki/Troubleshooting"
              );
            },
          },
        ],
      },
      {
        label: "Debug",
        items: [
          {
            name: "Open Devtools",
            shortcut: "Ctrl+Shift+I",
            ignoreShortcutInMonaco: true,
            callback: () => {
              invoke("open_devtools");
            },
          },
        ],
      },
      {
        label: "Updates",
        items: [
          {
            name: "Check for Updates",
            component: () => {
              const { checkForUpdates } = useContext(UpdateContext);
              return (
                <MenuItem
                  onClick={async () => {
                    await checkForUpdates();
                  }}
                  id="checkForUpdatesMenuBtn"
                >
                  Check for Updates
                </MenuItem>
              );
            },
          },
        ],
      },
    ],
  },
] as MenuBarData;
