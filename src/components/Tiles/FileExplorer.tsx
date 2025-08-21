import {
  Accordion,
  AccordionDetails,
  AccordionGroup,
  AccordionSummary,
  Button,
  Divider,
  Menu,
  MenuItem,
  Modal,
  ModalDialog,
  Input,
  Typography,
  Box,
} from "@mui/joy";
import "./FileExplorer.css";
import { useCallback, useEffect, useState } from "react";
import { path } from "@tauri-apps/api";
import * as fs from "@tauri-apps/plugin-fs";
import { ClickAwayListener } from "@mui/material";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";
import { useToast } from "react-toast-plus";

interface FileItemProps {
  filePath: string;
  isDirectory: boolean;
  setOpenFile: (file: string) => void;
  openDefault?: boolean;
  refresh?: number;
}

const FileItem: React.FC<FileItemProps> = ({
  filePath,
  isDirectory,
  setOpenFile,
  openDefault = false,
  refresh = 0,
}) => {
  const handleOpenFile = useCallback(async () => {
    if (platform() === "windows") {
      setOpenFile(await invoke<string>("linux_path", { path: filePath }));
    } else {
      setOpenFile(filePath);
    }
  }, [filePath]);

  const [children, setChildren] = useState<
    {
      path: string;
      isDirectory: boolean;
    }[]
  >([]);
  const [name, setName] = useState("");
  const [expanded, setExpanded] = useState(openDefault);

  useEffect(() => {
    (async () => {
      setName(await path.basename(filePath));
      if (!isDirectory || !expanded) return;
      try {
        const files = await fs.readDir(filePath);
        const parsedFilePromises = files.map(async (file) => {
          let pathS = await path.resolve(filePath, file.name);
          return {
            path: pathS,
            isDirectory: file.isDirectory,
          };
        });
        setChildren(
          (await Promise.all(parsedFilePromises)).sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.path.localeCompare(b.path);
          })
        );
      } catch (error) {
        console.error("Failed to read file:", filePath, error);
      }
    })();
  }, [filePath, expanded, refresh]);

  const handleAccordionChange = (
    _: React.SyntheticEvent,
    isExpanded: boolean
  ) => {
    setExpanded(isExpanded);
  };

  if (isDirectory) {
    return (
      <Accordion onChange={handleAccordionChange} defaultExpanded={openDefault}>
        <AccordionSummary
          slotProps={{
            button: {
              "data-path": filePath,
              "data-is-folder": true,
            },
          }}
        >
          {name}
        </AccordionSummary>
        <AccordionDetails>
          <AccordionGroup
            size="sm"
            sx={{
              borderLeft: "1px solid var(--joy-palette-neutral-800, #171A1C)",
            }}
            disableDivider={true}
          >
            {children.map((child) => (
              <FileItem
                key={child.path}
                filePath={child.path}
                isDirectory={child.isDirectory}
                setOpenFile={setOpenFile}
                refresh={refresh}
              />
            ))}
          </AccordionGroup>
        </AccordionDetails>
      </Accordion>
    );
  } else {
    return (
      <Button
        data-is-folder={false}
        size="sm"
        onClick={handleOpenFile}
        variant="plain"
        data-path={filePath}
        sx={{
          justifyContent: "flex-start",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
          overflow: "hidden",
          width: "100%",
          display: "block",
          textAlign: "left",
          paddingLeft: "0.5rem",
        }}
      >
        {name}
      </Button>
    );
  }
};

export interface FileExplorerProps {
  openFolder: string;
  setOpenFile: (file: string) => void;
}
export default ({ openFolder, setOpenFile }: FileExplorerProps) => {
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    filePath: string;
    isFolder: boolean;
  } | null>(null);

  const { addToast } = useToast();

  const [refresh, setRefresh] = useState(0);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [newTarget, setNewTarget] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteBasename, setDeleteBasename] = useState("");

  const handleContextMenu = (event: React.MouseEvent) => {
    if (event.target instanceof HTMLButtonElement) {
      const path = event.target.getAttribute("data-path");
      if (path) {
        event.preventDefault();

        setContextMenu(
          contextMenu === null
            ? {
                mouseX: event.clientX + 2,
                mouseY: event.clientY - 6,
                filePath: path,
                isFolder:
                  event.target.getAttribute("data-is-folder") === "true",
              }
            : null
        );
      }
    }
  };

  const handleClose = () => {
    setContextMenu(null);
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    const parent = await path.dirname(renameTarget);
    const newPath = await path.resolve(parent, renameValue);
    await fs.rename(renameTarget, newPath);
    setRenameOpen(false);
    setRenameTarget(null);
    setRenameValue("");
    setRefresh((r) => r + 1);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await fs.remove(deleteTarget, { recursive: true });
    setDeleteOpen(false);
    setDeleteTarget(null);
    setRefresh((r) => r + 1);
  };

  const handleNewFile = async () => {
    if (!newTarget) return;
    const newPath = await path.resolve(newTarget, newValue);
    if (await fs.exists(newPath)) {
      addToast.error("File already exists!");
      return;
    }
    await fs.writeTextFile(newPath, "");
    setNewOpen(false);
    setNewTarget(null);
    setNewValue("");
    setRefresh((r) => r + 1);
  };

  return (
    <div className={"file-explorer"} onContextMenu={handleContextMenu}>
      <FileItem
        filePath={openFolder}
        isDirectory={true}
        setOpenFile={setOpenFile}
        openDefault={true}
        refresh={refresh}
      />
      <ClickAwayListener onClickAway={handleClose}>
        <Menu
          size="sm"
          open={contextMenu !== null}
          onClose={handleClose}
          anchorEl={
            contextMenu !== null
              ? ({
                  getBoundingClientRect: () =>
                    ({
                      top: contextMenu.mouseY,
                      left: contextMenu.mouseX,
                      right: contextMenu.mouseX,
                      bottom: contextMenu.mouseY,
                      width: 0,
                      height: 0,
                    } as DOMRect),
                } as any)
              : undefined
          }
          placement="bottom-start"
          sx={{
            pt: 0,
            pb: 0,
          }}
        >
          {contextMenu?.isFolder && (
            <MenuItem
              onClick={async () => {
                handleClose();
                setNewTarget(contextMenu!.filePath);
                setNewValue("");
                setNewOpen(true);
              }}
            >
              New File
            </MenuItem>
          )}
          {contextMenu?.isFolder && <Divider />}
          <MenuItem
            onClick={async () => {
              handleClose();
              await revealItemInDir(contextMenu!.filePath);
            }}
          >
            Open Containing Folder
          </MenuItem>
          <Divider />
          <MenuItem
            onClick={async () => {
              handleClose();
              setRenameTarget(contextMenu!.filePath);
              setRenameValue(await path.basename(contextMenu!.filePath));
              setRenameOpen(true);
            }}
          >
            Rename
          </MenuItem>
          <MenuItem
            onClick={async () => {
              handleClose();
              setDeleteTarget(contextMenu!.filePath);
              setDeleteBasename(await path.basename(contextMenu!.filePath));
              setDeleteOpen(true);
            }}
          >
            Delete
          </MenuItem>
        </Menu>
      </ClickAwayListener>

      {/* New File Modal */}
      <Modal open={newOpen} onClose={() => setNewOpen(false)}>
        <ModalDialog>
          <Typography level="h4" component="h2" sx={{ mb: 2 }}>
            New File
          </Typography>
          <Input
            autoFocus
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter") {
                await handleNewFile();
              }
            }}
          />
          <Box
            sx={{ display: "flex", gap: 1, justifyContent: "flex-end", mt: 2 }}
          >
            <Button onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button onClick={handleNewFile} disabled={!newValue.trim()}>
              Create
            </Button>
          </Box>
        </ModalDialog>
      </Modal>

      {/* Rename Modal */}
      <Modal open={renameOpen} onClose={() => setRenameOpen(false)}>
        <ModalDialog>
          <Typography level="h4" component="h2" sx={{ mb: 2 }}>
            Rename
          </Typography>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter") {
                await handleRename();
              }
            }}
          />
          <Box
            sx={{ display: "flex", gap: 1, justifyContent: "flex-end", mt: 2 }}
          >
            <Button onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button onClick={handleRename} disabled={!renameValue.trim()}>
              Rename
            </Button>
          </Box>
        </ModalDialog>
      </Modal>

      {/* Rename Modal */}
      <Modal open={renameOpen} onClose={() => setRenameOpen(false)}>
        <ModalDialog>
          <Typography level="h4" component="h2" sx={{ mb: 2 }}>
            Rename
          </Typography>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter") {
                await handleRename();
              }
            }}
          />
          <Box
            sx={{ display: "flex", gap: 1, justifyContent: "flex-end", mt: 2 }}
          >
            <Button onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button onClick={handleRename} disabled={!renameValue.trim()}>
              Rename
            </Button>
          </Box>
        </ModalDialog>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <ModalDialog>
          <Typography level="h4" component="h2" sx={{ mb: 2 }}>
            Confirm Delete
          </Typography>
          <Typography sx={{ mb: 2 }}>
            Are you sure you want to delete <b>{deleteBasename}</b>? This action
            cannot be undone.
          </Typography>
          <Box
            sx={{ display: "flex", gap: 1, justifyContent: "flex-end", mt: 2 }}
          >
            <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button color="danger" onClick={handleDelete}>
              Delete
            </Button>
          </Box>
        </ModalDialog>
      </Modal>
    </div>
  );
};
