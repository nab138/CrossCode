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
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { IStandaloneCodeEditor } from "@codingame/monaco-vscode-api/vscode/vs/editor/standalone/browser/standaloneCodeEditor";

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
  const [saveFile, setSaveFile] = useState<(() => void) | null>(null);
  const [undo, setUndo] = useState<(() => void) | null>(null);
  const [redo, setRedo] = useState<(() => void) | null>(null);
  const [theme] = useStore<"light" | "dark">("appearance/theme", "dark");
  const { path } = useParams<"path">();
  const { openFolderDialog, selectedToolchain, hasLimitedRam, initialized } =
    useIDE();
  const [sourcekitStartup, setSourcekitStartup] = useStore<boolean | null>(
    "sourcekit/startup",
    null
  );
  const [hasIgnoredRam, setHasIgnoredRam] = useStore<boolean>(
    "has-ignored-ram",
    false
  );

  if (!path) {
    throw new Error("Path parameter is required in IDE component");
  }

  const [callbacks, setCallbacks] = useState<Record<string, () => void>>({});
  const navigate = useNavigate();
  const [projectValidation, setProjectValidation] =
    useState<ProjectValidation | null>(null);
  const [editor, setEditor] = useState<IStandaloneCodeEditor | null>(null);
  const { addToast } = useToast();

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
      save: saveFile ?? (() => {}),
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
        initialSizes={[20, 80]}
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
