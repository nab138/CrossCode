import Splitter, { GutterTheme, SplitDirection } from "@devbookhq/splitter";
import Tile from "../components/Tiles/Tile";
import FileExplorer from "../components/Tiles/FileExplorer";
import { useCallback, useContext, useEffect, useState } from "react";
import Editor from "../components/Tiles/Editor";
import MenuBar from "../components/Menu/MenuBar";
import "./IDE.css";
import { StoreContext, useStore } from "../utilities/StoreContext";
import { useNavigate, useParams } from "react-router";
import { useIDE } from "../utilities/IDEContext";
import { registerFileSystemOverlay } from "@codingame/monaco-vscode-files-service-override";
import TauriFileSystemProvider from "../utilities/TauriFileSystemProvider";
import { invoke } from "@tauri-apps/api/core";
import {
  Button,
  Divider,
  Modal,
  ModalClose,
  ModalDialog,
  Typography,
} from "@mui/joy";
import { ErrorIcon, useToast, WarningIcon } from "react-toast-plus";
import SwiftMenu from "../components/SwiftMenu";
import { restartServer } from "../utilities/lsp-client";
import BottomBar from "../components/Tiles/BottomBar";
import { open as openFileDialog, save } from "@tauri-apps/plugin-dialog";
import { IStandaloneCodeEditor } from "@codingame/monaco-vscode-api/vscode/vs/editor/standalone/browser/standaloneCodeEditor";
import { DARWIN_SDK_VERSION } from "../utilities/constants";
import { writeFile } from "@tauri-apps/plugin-fs";

export interface IDEProps {}

type ProjectValidation =
  | "Valid"
  | "Invalid"
  | "UnsupportedFormatVersion"
  | "InvalidPackage"
  | "InvalidToolchain";

let autoStartedLsp = "";

export default () => {
  const { storeInitialized, store } = useContext(StoreContext);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [saveFile, setSaveFile] = useState<(() => Promise<void>) | null>(null);
  const [undo, setUndo] = useState<(() => void) | null>(null);
  const [redo, setRedo] = useState<(() => void) | null>(null);
  const [theme] = useStore<"light" | "dark">("appearance/theme", "dark");
  const { path } = useParams<"path">();
  const {
    openFolderDialog,
    selectedToolchain,
    hasLimitedRam,
    initialized,
    ready,
    darwinSDKVersion,
    screenshot,
    setScreenshot,
  } = useIDE();
  const [sourcekitStartup, setSourcekitStartup] = useStore<boolean | null>(
    "sourcekit/startup",
    null
  );
  const [hasIgnoredRam, setHasIgnoredRam] = useStore<boolean>(
    "has-ignored-ram",
    false
  );

  const [hasIgnoredDarwinSDK, setHasIgnoredDarwinSDK] = useStore<boolean>(
    "has-ignored-darwin-sdk",
    false
  );

  if (!path) {
    throw new Error("Path parameter is required in IDE component");
  }

  const [callbacks, setCallbacks] = useState<
    Record<string, (() => void) | (() => Promise<void>)>
  >({});
  const navigate = useNavigate();
  const [projectValidation, setProjectValidation] =
    useState<ProjectValidation | null>(null);
  const [editor, setEditor] = useState<IStandaloneCodeEditor | null>(null);
  const { addToast } = useToast();

  useEffect(() => {
    if (ready === false && initialized) {
      console.log(
        "IDE not ready, returning to welcome page",
        ready,
        initialized
      );
      navigate("/");
    }
  }, [ready, initialized, navigate]);

  useEffect(() => {
    (async () => {
      if (!store || !storeInitialized || !path) return;
      await store.set("last-opened-project", encodeURIComponent(path!));
    })();
  }, [path, store, storeInitialized]);

  useEffect(() => {
    if (
      path === undefined ||
      path === null ||
      selectedToolchain === null ||
      !initialized
    )
      return;
    setProjectValidation(null);
    (async () => {
      if (path) {
        const toolchainPath = selectedToolchain?.path ?? "";
        const validation = await invoke<ProjectValidation>("validate_project", {
          projectPath: path,
          toolchainPath: toolchainPath,
        });
        if (validation) {
          setProjectValidation(validation);
        }
      }
    })();
  }, [path, selectedToolchain, initialized]);

  useEffect(() => {
    if (openFiles.length === 0) {
      setOpenFile(null);
    }
    if (!openFiles.includes(openFile!)) {
      setOpenFile(openFiles[0]);
    }
  }, [openFiles]);

  useEffect(() => {
    let dispose = () => {};

    if (path) {
      const provider = new TauriFileSystemProvider(false);
      const overlayDisposable = registerFileSystemOverlay(1, provider);
      dispose = () => {
        overlayDisposable.dispose();
        provider.dispose();
      };
    }
    return () => {
      dispose();
    };
  }, [path]);

  useEffect(() => {
    let autoEnable = async () => {
      if (initialized && sourcekitStartup === null && hasLimitedRam === false) {
        setSourcekitStartup(true);
      }
    };
    autoEnable();
  }, [hasLimitedRam, initialized, sourcekitStartup]);

  useEffect(() => {
    if (!sourcekitStartup || selectedToolchain == null) return;
    requestAnimationFrame(async () => {
      try {
        if (autoStartedLsp === path) return;
        autoStartedLsp = path;
        await restartServer(path, selectedToolchain);
      } catch (e) {
        console.error("Failed to start SourceKit-LSP:", e);
        addToast.error(
          "Failed to start SourceKit-LSP (see devtools for details). Some language features may not be available."
        );
      }
    });
  }, [sourcekitStartup, path, selectedToolchain]);

  const openNewFile = useCallback((file: string) => {
    setOpenFile(file);
    setOpenFiles((oF) => {
      if (!oF.includes(file)) return [file, ...oF];
      return oF;
    });
  }, []);

  const selectFile = useCallback(async () => {
    const file = await openFileDialog({ multiple: false, directory: false });
    if (file) {
      openNewFile(file);
    }
  }, [openNewFile]);

  useEffect(() => {
    setCallbacks({
      save: saveFile ?? (async () => {}),
      openFolderDialog,
      newProject: () => navigate("/new"),
      welcomePage: () => navigate("/"),
      openFile: selectFile,
      undo: undo ?? (() => {}),
      redo: redo ?? (() => {}),
    });
  }, [saveFile, openFolderDialog, navigate, selectFile, undo, redo]);

  return (
    <div className="ide-container">
      <MenuBar callbacks={callbacks} editor={editor} />
      <Splitter
        gutterTheme={theme === "dark" ? GutterTheme.Dark : GutterTheme.Light}
        direction={SplitDirection.Horizontal}
        initialSizes={screenshot ? [20, 50, 30] : [20, 80]}
      >
        <Tile className="file-explorer-tile">
          <FileExplorer openFolder={path} setOpenFile={openNewFile} />
        </Tile>
        <Splitter
          gutterTheme={theme === "dark" ? GutterTheme.Dark : GutterTheme.Light}
          direction={SplitDirection.Vertical}
          initialSizes={[70, 30]}
        >
          <Editor
            openFiles={openFiles}
            focusedFile={openFile}
            setSaveFile={setSaveFile}
            setUndo={setUndo}
            setRedo={setRedo}
            setOpenFiles={setOpenFiles}
            openNewFile={openNewFile}
            setEditorUpper={setEditor}
          />
          <BottomBar />
        </Splitter>
        {screenshot && (
          <div className="screenshot-tile">
            <div>
              <Typography level="h3">Screenshot</Typography>
              <Button
                variant="outlined"
                onClick={async () => {
                  const blob = await (await fetch(screenshot)).blob();
                  const arrayBuffer = await blob.arrayBuffer();
                  const uint8Array = new Uint8Array(arrayBuffer);
                  const savePath = await save({
                    title: "Save Screenshot",
                    defaultPath: "screenshot.png",
                    filters: [
                      { name: "PNG Image", extensions: ["png"] },
                      { name: "All Files", extensions: ["*"] },
                    ],
                  });
                  if (!savePath) return;
                  await writeFile(savePath, uint8Array);
                  addToast.success("Saved screenshot to " + savePath);
                }}
              >
                Save
              </Button>
              <Button variant="outlined" onClick={() => setScreenshot(null)}>
                Close
              </Button>
            </div>
            <div className="screenshot-img-container">
              <img src={screenshot} alt="screenshot" />
            </div>
          </div>
        )}
      </Splitter>
      {initialized &&
        selectedToolchain !== null &&
        projectValidation !== null &&
        projectValidation !== "Valid" && (
          <Modal
            open={true}
            onClose={() => {
              setProjectValidation(null);
            }}
          >
            <ModalDialog sx={{ maxWidth: "90vw" }}>
              <ModalClose />
              <div>
                <div style={{ display: "flex", gap: "var(--padding-sm)" }}>
                  <div style={{ width: "1.25rem" }}>
                    <ErrorIcon />
                  </div>
                  <Typography level="h3">Failed to load project</Typography>
                </div>
                <Typography level="body-lg">
                  {getValidationMsg(projectValidation)} Some features may not
                  work as expected.
                </Typography>
              </div>

              <Divider sx={{ mb: "var(--padding-xs)" }} />
              <div style={{ display: "flex", gap: "var(--padding-lg)" }}>
                {projectValidation === "InvalidToolchain" && <SwiftMenu />}
                {projectValidation !== "InvalidToolchain" && (
                  <>
                    <Button
                      onClick={() => {
                        navigate("/new");
                      }}
                    >
                      Create New
                    </Button>
                    <Button onClick={openFolderDialog}>
                      Open Other Project
                    </Button>
                    <Button
                      onClick={() => {
                        setProjectValidation(null);
                      }}
                      variant="outlined"
                    >
                      Ignore
                    </Button>
                  </>
                )}
              </div>
            </ModalDialog>
          </Modal>
        )}
      {initialized &&
        selectedToolchain !== null &&
        sourcekitStartup === null &&
        hasIgnoredRam === false &&
        hasLimitedRam && (
          <Modal
            open={true}
            onClose={() => {
              setHasIgnoredRam(true);
            }}
          >
            <ModalDialog sx={{ maxWidth: "90vw" }}>
              <ModalClose />
              <div>
                <div style={{ display: "flex", gap: "var(--padding-md)" }}>
                  <div style={{ width: "1.25rem" }}>
                    <WarningIcon />
                  </div>
                  <Typography level="h3">Limited Memory</Typography>
                </div>
                <Typography level="body-lg">
                  SourceKit-LSP is used to provide autocomplete, error
                  reporting, and other language features. However, it uses a
                  large amount of memory. Your device does not meet our
                  recommended memory requirements. You can choose to enable it
                  anyways, but it may cause crashes or instability.
                </Typography>
                <Typography
                  level="body-lg"
                  style={{ marginTop: "var(--padding-sm)" }}
                >
                  You can change this at any time in Edit {">"} Preferences{" "}
                  {">"} SourceKit LSP {">"} Auto-Launch SourceKit.
                </Typography>
                <Typography
                  level="body-lg"
                  style={{ marginTop: "var(--padding-sm)" }}
                >
                  You can also enable SourceKit temporarily with Build {">"}{" "}
                  Restart LSP.
                </Typography>
              </div>

              <Divider sx={{ mb: "var(--padding-xs)" }} />
              <div style={{ display: "flex", gap: "var(--padding-lg)" }}>
                <Button
                  onClick={() => {
                    setSourcekitStartup(false);
                    setHasIgnoredRam(true);
                  }}
                >
                  Keep disabled
                </Button>
                <Button
                  onClick={() => {
                    setSourcekitStartup(true);
                    setHasIgnoredRam(true);
                  }}
                  color="danger"
                  variant="outlined"
                >
                  Enable Anyway
                </Button>
              </div>
            </ModalDialog>
          </Modal>
        )}
      {initialized &&
        selectedToolchain !== null &&
        hasIgnoredDarwinSDK === false &&
        darwinSDKVersion !== DARWIN_SDK_VERSION && (
          <Modal
            open={true}
            onClose={() => {
              setHasIgnoredDarwinSDK(true);
            }}
          >
            <ModalDialog sx={{ maxWidth: "90vw" }}>
              <ModalClose />
              <div>
                <div style={{ display: "flex", gap: "var(--padding-md)" }}>
                  <div style={{ width: "1.25rem" }}>
                    <WarningIcon />
                  </div>
                  <Typography level="h3">Incompatible SDK Version</Typography>
                </div>
                <Typography level="body-lg">
                  This version of CrossCode is designed to work with Darwin SDK{" "}
                  {DARWIN_SDK_VERSION}, but you have version {darwinSDKVersion}{" "}
                  installed. Things may still work, but you will miss out on
                  newer features (like liquid glass) and may run into issues.
                </Typography>
              </div>

              <Divider sx={{ mb: "var(--padding-xs)" }} />
              <div style={{ display: "flex", gap: "var(--padding-lg)" }}>
                <Button
                  onClick={() => {
                    navigate("/#install-sdk");
                  }}
                >
                  Install Correct SDK
                </Button>
                <Button
                  onClick={() => {
                    setHasIgnoredDarwinSDK(true);
                  }}
                  variant="outlined"
                >
                  Ignore
                </Button>
              </div>
            </ModalDialog>
          </Modal>
        )}
    </div>
  );
};

function getValidationMsg(validation: ProjectValidation): string {
  switch (validation) {
    case "Invalid":
      return "This does not appear to be a valid CrossCode project.";
    case "InvalidPackage":
      return "SwiftPM was unable to parse your package. Please check your Package.swift file.";
    case "UnsupportedFormatVersion":
      return "This project uses an unsupported config format version. You may need to update CrossCode.";
    case "InvalidToolchain":
      return "Your Swift toolchain appears to be invalid.";
    default:
      return "";
  }
}
