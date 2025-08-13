import Splitter, { GutterTheme, SplitDirection } from "@devbookhq/splitter";
import Tile from "../components/Tiles/Tile";
import FileExplorer from "../components/Tiles/FileExplorer";
import { useCallback, useEffect, useState } from "react";
import Editor from "../components/Tiles/Editor";
import MenuBar from "../components/Menu/MenuBar";
import "./IDE.css";
import Console from "../components/Tiles/Console";
import { useStore } from "../utilities/StoreContext";
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
import { ErrorIcon, WarningIcon } from "react-toast-plus";
import SwiftMenu from "../components/SwiftMenu";
import { initWebSocketAndStartClient } from "../utilities/lsp-client";

export interface IDEProps {}

type ProjectValidation =
  | "Valid"
  | "Invalid"
  | "UnsupportedFormatVersion"
  | "InvalidPackage"
  | "InvalidToolchain";

export default () => {
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [saveFile, setSaveFile] = useState<(() => void) | null>(null);
  const [theme] = useStore<"light" | "dark">("appearance/theme", "light");
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

  useEffect(() => {
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
  }, [path, selectedToolchain]);

  useEffect(() => {
    setCallbacks({
      save: saveFile ?? (() => {}),
      openFolderDialog,
      newProject: () => navigate("/new"),
      welcomePage: () => navigate("/"),
    });
  }, [saveFile]);

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
    if (
      sourcekitStartup === null &&
      hasIgnoredRam === false &&
      hasLimitedRam === false
    ) {
      setSourcekitStartup(true);
    }
  }, [sourcekitStartup, hasIgnoredRam, hasLimitedRam]);

  useEffect(() => {
    if (!sourcekitStartup) return;
    let startup = async () => {
      try {
        await invoke<number>("stop_sourcekit_server");
      } catch (e) {
        void e;
      }
      let port = await invoke<number>("start_sourcekit_server", {
        toolchainPath: selectedToolchain?.path ?? "",
        folder: path || "",
      });
      initWebSocketAndStartClient(`ws://localhost:${port}`, path || "");
    };
    startup().catch((e) => {
      console.error("Failed to start SourceKit-LSP:", e);
    });
  }, [sourcekitStartup, path, selectedToolchain]);

  const openNewFile = useCallback((file: string) => {
    setOpenFile(file);
    setOpenFiles((oF) => {
      if (!oF.includes(file)) return [file, ...oF];
      return oF;
    });
  }, []);

  return (
    <div className="ide-container">
      <MenuBar callbacks={callbacks} />
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
            setOpenFiles={setOpenFiles}
          />
          <Console />
        </Splitter>
      </Splitter>
      {initialized &&
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
                <div style={{ display: "flex", gap: "var(--padding-sm)" }}>
                  <div style={{ width: "1.25rem" }}>
                    <WarningIcon />
                  </div>
                  <Typography level="h3">Limited Memory</Typography>
                </div>
                <Typography level="body-lg">
                  SourceKit-LSP is used to provide autocomplete, error
                  reporting, and other language features. However, it is
                  extremely memory hungry. Your device does not meet our
                  recommended memory requirements. You can choose to enable it
                  anyways, but it may cause crashes or instability.
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
                  Ok
                </Button>
                <Button
                  onClick={() => {
                    setSourcekitStartup(true);
                    setHasIgnoredRam(true);
                  }}
                  color="danger"
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
      return "This does not appear to be a valid YCode project.";
    case "InvalidPackage":
      return "SwiftPM was unable to parse your package. Please check your Package.swift file.";
    case "UnsupportedFormatVersion":
      return "This project uses an unsupported config format version. You may need to update YCode.";
    case "InvalidToolchain":
      return "Your Swift toolchain appears to be invalid.";
    default:
      return "";
  }
}
