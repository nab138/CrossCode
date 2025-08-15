import { path } from "@tauri-apps/api";
import { CodeEditorHandles } from "../CodeEditor";
import "./Editor.css";
import { IconButton, useColorScheme } from "@mui/joy";
import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import CloseIcon from "@mui/icons-material/Close";
import * as monaco from "monaco-editor";

import { initialize } from "@codingame/monaco-vscode-api";
import getLanguagesServiceOverride from "@codingame/monaco-vscode-languages-service-override";
import getThemeServiceOverride from "@codingame/monaco-vscode-theme-service-override";
import getTextMateServiceOverride from "@codingame/monaco-vscode-textmate-service-override";
import getEditorServiceOverride from "@codingame/monaco-vscode-editor-service-override";
import getModelServiceOverride from "@codingame/monaco-vscode-model-service-override";
import "@codingame/monaco-vscode-swift-default-extension";
import "@codingame/monaco-vscode-theme-defaults-default-extension";
import "vscode/localExtensionHost";

// adding worker
export type WorkerLoader = () => Worker;
const workerLoaders: Partial<Record<string, WorkerLoader>> = {
  TextEditorWorker: () =>
    new Worker(
      new URL("monaco-editor/esm/vs/editor/editor.worker.js", import.meta.url),
      { type: "module" }
    ),
  TextMateWorker: () =>
    new Worker(
      new URL(
        "@codingame/monaco-vscode-textmate-service-override/worker",
        import.meta.url
      ),
      { type: "module" }
    ),
};

window.MonacoEnvironment = {
  getWorker: function (_workerId, label) {
    const workerFactory = workerLoaders[label];
    if (workerFactory != null) {
      return workerFactory();
    }
    throw new Error(`Worker ${label} not found`);
  },
};

export interface EditorProps {
  openFiles: string[];
  setOpenFiles: Dispatch<SetStateAction<string[]>>;
  focusedFile: string | null;
  setSaveFile: (save: () => void) => void;
  openNewFile: (file: string) => void;
}

export default ({
  openFiles,
  focusedFile,
  setSaveFile,
  setOpenFiles,
  openNewFile,
}: EditorProps) => {
  const [tabs, setTabs] = useState<
    {
      name: string;
      file: string;
    }[]
  >([]);
  const [unsavedFiles, setUnsavedFiles] = useState<string[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropIndicatorIndex, setDropIndicatorIndex] = useState<number | null>(
    null
  );

  const [focused, setFocused] = useState<number>();
  const editors = useRef<(CodeEditorHandles | null)[]>([]);
  const [editor, setEditor] =
    useState<monaco.editor.IStandaloneCodeEditor | null>(null);

  const { mode } = useColorScheme();

  const monacoEl = useRef(null);
  const hasInitialized = useRef(false);
  const currentTabsRef = useRef(tabs);
  const setFocusedRef = useRef(setFocused);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const openNewFileRef = useRef(openNewFile);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    currentTabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    setFocusedRef.current = setFocused;
  }, [setFocused]);

  useEffect(() => {
    openNewFileRef.current = openNewFile;
  }, [openNewFile]);

  useEffect(() => {
    const initializeEditor = async () => {
      if (hasInitialized.current) return;

      hasInitialized.current = true;
      await initialize({
        ...getTextMateServiceOverride(),
        ...getThemeServiceOverride(),
        ...getLanguagesServiceOverride(),
        ...getEditorServiceOverride((modelRef, _options) => {
          return new Promise((resolve) => {
            if (!editorRef.current) return resolve(undefined);

            let path = modelRef.object.textEditorModel.uri.fsPath;

            if (!path) return resolve(undefined);
            let tabIndex = currentTabsRef.current.findIndex(
              (tab) => tab.file === path
            );
            if (tabIndex === -1) {
              openNewFileRef.current(path);
            } else {
              setFocusedRef.current(tabIndex);
            }
            // not sure why this doesn't work...
            // if (options !== undefined) {
            //   const opts = options as ITextEditorOptions | undefined;
            //   if (opts?.selection) {
            //     editorRef.current.setSelection(
            //       {
            //         startLineNumber: opts.selection.startLineNumber,
            //         startColumn: opts.selection.startColumn,
            //         endLineNumber:
            //           opts.selection.endLineNumber ??
            //           opts.selection.startLineNumber,
            //         endColumn:
            //           opts.selection.endColumn ?? opts.selection.startColumn,
            //       },
            //       opts.selectionSource
            //     );
            //     editorRef.current.revealLineNearTop(
            //       opts.selection.startLineNumber,
            //       0
            //     );
            //   }
            // }
            resolve(undefined);
          });
        }),
        ...getModelServiceOverride(),
      });
      hasInitialized.current = true;
    };

    initializeEditor();
  }, []);

  useEffect(() => {
    editors.current = editors.current.slice(0, openFiles.length);
  }, [openFiles]);

  useEffect(() => {
    if (focusedFile !== null) {
      let i = openFiles.indexOf(focusedFile);
      if (i === -1 || focused === i) return;
      setFocused(i);
    }
  }, [focusedFile, openFiles]);

  useEffect(() => {
    if (focused === undefined) return;
    let e = editors.current[focused];
    if (e === undefined || e === null) return;
    setSaveFile(() => e.saveFile);
  }, [focused, tabs]);

  useEffect(() => {
    const fetchTabNames = async () => {
      setTabs(
        await Promise.all(
          openFiles.map(async (file) => ({
            name: await path.basename(file),
            file,
          }))
        )
      );
    };

    fetchTabNames();
  }, [openFiles]);

  useEffect(() => {
    if (monacoEl.current && !editor) {
      let colorScheme = mode;
      if (colorScheme === "system") {
        colorScheme = window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
      }

      const newEditor = monaco.editor.create(monacoEl.current, {
        value: "",
        language: "plaintext",
        theme: "vs-" + colorScheme,
      });

      setEditor(newEditor);

      return () => {
        newEditor.dispose();
      };
    }
  }, []);

  useEffect(() => {
    if (!monacoEl.current || !editor) return;

    const resizeObserver = new ResizeObserver(() => {
      editor.layout();
    });

    resizeObserver.observe(monacoEl.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [editor]);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    if (draggedIndex === null) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    const mouseX = e.clientX;

    let insertIndex;
    if (mouseX < midpoint) {
      insertIndex = index;
    } else {
      insertIndex = index + 1;
    }

    if (insertIndex === draggedIndex || insertIndex === draggedIndex + 1) {
      setDropIndicatorIndex(null);
    } else {
      setDropIndicatorIndex(insertIndex);
    }
  };

  const handleContainerDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    if (draggedIndex === null) return;

    const container = e.currentTarget as HTMLElement;
    const mouseX = e.clientX;

    const lastTab = container.querySelector(".tab-wrapper:last-child");
    if (lastTab) {
      const lastTabRect = lastTab.getBoundingClientRect();
      if (mouseX > lastTabRect.right) {
        setDropIndicatorIndex(tabs.length);
        return;
      }
    }

    const firstTab = container.querySelector(".tab-wrapper:first-child");
    if (firstTab) {
      const firstTabRect = firstTab.getBoundingClientRect();
      if (mouseX < firstTabRect.left) {
        setDropIndicatorIndex(0);
        return;
      }
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const container = e.currentTarget as HTMLElement;
    const relatedTarget = e.relatedTarget as Node;

    if (!container.contains(relatedTarget)) {
      setDropIndicatorIndex(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();

    if (draggedIndex === null || dropIndicatorIndex === null) {
      setDraggedIndex(null);
      setDropIndicatorIndex(null);
      return;
    }

    const newTabs = [...tabs];
    const newOpenFiles = [...openFiles];

    let actualDropIndex = dropIndicatorIndex;
    if (draggedIndex < dropIndicatorIndex) {
      actualDropIndex = dropIndicatorIndex - 1;
    }

    const draggedTab = newTabs.splice(draggedIndex, 1)[0];
    const draggedFile = newOpenFiles.splice(draggedIndex, 1)[0];

    newTabs.splice(actualDropIndex, 0, draggedTab);
    newOpenFiles.splice(actualDropIndex, 0, draggedFile);

    let newFocused = focused;
    if (focused === draggedIndex) {
      newFocused = actualDropIndex;
    } else if (focused !== undefined) {
      if (draggedIndex < focused && actualDropIndex >= focused) {
        newFocused = focused - 1;
      } else if (draggedIndex > focused && actualDropIndex <= focused) {
        newFocused = focused + 1;
      }
    }

    setTabs(newTabs);
    setOpenFiles(newOpenFiles);
    setFocused(newFocused);
    setDraggedIndex(null);
    setDropIndicatorIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDropIndicatorIndex(null);
  };

  return (
    <div className={"editor"}>
      <div
        className="tabsContainer MuiTabList-sizeSm"
        onDragOver={handleContainerDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {tabs.map((tab, index) => (
          <div key={tab.file} className="tab-wrapper">
            {dropIndicatorIndex === index && <div className="drop-indicator" />}
            <button
              className={
                "tab MuiTab-root MuiTab-horizontal MuiTab-variantPlain MuiTab-colorNeutral css-1uqmv8l-JoyTab-root" +
                (focused === index ? " Mui-selected" : "") +
                (draggedIndex === index ? " dragging" : "")
              }
              role="tab"
              draggable={true}
              onClick={() => setFocused(index)}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
            >
              {tab.name}
              <IconButton
                component="span"
                size="xs"
                sx={{ margin: "0px" }}
                onClick={(event) => {
                  event.stopPropagation();
                  setTabs((tabs) => tabs.filter((_, i) => i !== index));
                  setFocused((focused) => {
                    if (focused === index) return 0;
                    return focused;
                  });
                  setOpenFiles((openFiles) =>
                    openFiles.filter((file) => file !== tab.file)
                  );
                }}
              >
                <CloseIcon />
              </IconButton>
            </button>
          </div>
        ))}
        {dropIndicatorIndex === tabs.length && (
          <div className="drop-indicator drop-indicator-end" />
        )}
      </div>
      <div
        className={"code-editor"}
        ref={monacoEl}
        style={tabs.length >= 1 ? {} : { display: "none" }}
      />
    </div>
  );
};
