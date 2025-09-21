import { path } from "@tauri-apps/api";
import "./Editor.css";
import { IconButton, useColorScheme } from "@mui/joy";
import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import CloseIcon from "@mui/icons-material/Close";
import CircleIcon from "@mui/icons-material/Circle";
import * as monaco from "monaco-editor";
import { initialize, ITextEditorOptions } from "@codingame/monaco-vscode-api";
import getLanguagesServiceOverride from "@codingame/monaco-vscode-languages-service-override";
import getThemeServiceOverride from "@codingame/monaco-vscode-theme-service-override";
import getTextMateServiceOverride from "@codingame/monaco-vscode-textmate-service-override";
import getEditorServiceOverride from "@codingame/monaco-vscode-editor-service-override";
import getModelServiceOverride from "@codingame/monaco-vscode-model-service-override";
import getDebugServiceOverride from "@codingame/monaco-vscode-debug-service-override";
import "@codingame/monaco-vscode-swift-default-extension";
import "@codingame/monaco-vscode-theme-defaults-default-extension";
import { platform } from "@tauri-apps/plugin-os";
import { TabLike } from "../TabLike";
import { useStore } from "../../utilities/StoreContext";
import { useParams } from "react-router";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

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
  setSaveFile: Dispatch<SetStateAction<(() => Promise<void>) | null>>;
  setUndo: Dispatch<SetStateAction<(() => void) | null>>;
  setRedo: Dispatch<SetStateAction<(() => void) | null>>;
  openNewFile: (file: string) => void;
  setEditorUpper: Dispatch<
    SetStateAction<monaco.editor.IStandaloneCodeEditor | null>
  >;
}

let globalInitialized = false;
let globalEditorServiceCallbacks = {
  currentTabsRef: { current: [] as { name: string; file: string }[] },
  setFocusedRef: { current: (() => {}) as any },
  openNewFileRef: { current: (() => {}) as any },
  editorRef: { current: null as monaco.editor.IStandaloneCodeEditor | null },
  selectionOverrideRef: { current: null as ITextEditorOptions | null },
};

export default ({
  openFiles,
  focusedFile,
  setSaveFile,
  setUndo,
  setRedo,
  setOpenFiles,
  openNewFile,
  setEditorUpper,
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
  const [editor, setEditor] =
    useState<monaco.editor.IStandaloneCodeEditor | null>(null);

  const { mode } = useColorScheme();

  const monacoEl = useRef(null);
  const [initialized, setInitialized] = useState(false);
  const currentTabsRef = useRef(tabs);
  const setFocusedRef = useRef(setFocused);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const openNewFileRef = useRef(openNewFile);
  const selectionOverrideRef = useRef<ITextEditorOptions | null>(null);
  const hasInitializedRef = useRef(false);
  const scrollStates = useRef<{
    [key: string]: [number, number];
  }>({});
  const [hoveredOnBtn, setHoveredOnBtn] = useState<number | null>(null);
  const [formatOnSave] = useStore<boolean>("sourcekit/format", true);

  const { path: filePath } = useParams<"path">();
  const hasAttemptedToReadOpenFiles = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!filePath || hasAttemptedToReadOpenFiles.current === filePath) return;
      const savePath = await path.join(
        filePath,
        ".crosscode",
        "openFiles.json"
      );
      try {
        let text = await readTextFile(savePath);
        if (!text) return;
        let data = JSON.parse(text) as { files: string[]; focused: number };
        if (
          !data ||
          typeof data !== "object" ||
          !Array.isArray(data.files) ||
          typeof data.focused !== "number"
        )
          return;
        data.files = data.files.filter((file) => typeof file === "string");
        if (data.files.length === 0) return;
        if (data.focused < 0 || data.focused >= data.files.length) {
          data.focused = 0;
        }
        setOpenFiles(data.files);
        setTimeout(() => {
          setFocused(data.focused);
        }, 100);
      } catch (e) {
        void e;
      } finally {
        hasAttemptedToReadOpenFiles.current = filePath;
      }
    })();
  }, [filePath, setOpenFiles, setFocused]);

  useEffect(() => {
    (async () => {
      if (!filePath || hasAttemptedToReadOpenFiles.current !== filePath) return;
      const savePath = await path.join(
        filePath,
        ".crosscode",
        "openFiles.json"
      );
      let data = {
        files: openFiles,
        focused: focused ?? 0,
      };
      writeTextFile(savePath, JSON.stringify(data)).catch((err) => {
        console.error("Error writing openFiles.json:", err);
      });
    })();
  }, [openFiles, filePath, focused]);

  useEffect(() => {
    globalEditorServiceCallbacks.currentTabsRef = currentTabsRef;
    globalEditorServiceCallbacks.setFocusedRef = setFocusedRef;
    globalEditorServiceCallbacks.editorRef = editorRef;
    globalEditorServiceCallbacks.openNewFileRef = openNewFileRef;
    globalEditorServiceCallbacks.selectionOverrideRef = selectionOverrideRef;
  });

  useEffect(() => {
    editorRef.current = editor;
    setEditorUpper(editor);
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
      if (globalInitialized && !hasInitializedRef.current) {
        setInitialized(true);
        hasInitializedRef.current = true;
        return;
      }

      globalInitialized = true;
      await initialize({
        ...getTextMateServiceOverride(),
        ...getThemeServiceOverride(),
        ...getLanguagesServiceOverride(),
        ...getDebugServiceOverride(),
        ...getEditorServiceOverride((modelRef, options) => {
          return new Promise((resolve) => {
            if (!globalEditorServiceCallbacks.editorRef.current)
              return resolve(undefined);

            let path =
              platform() === "windows"
                ? modelRef.object.textEditorModel.uri.path
                : modelRef.object.textEditorModel.uri.fsPath;

            if (!path) return resolve(undefined);
            let tabIndex =
              globalEditorServiceCallbacks.currentTabsRef.current.findIndex(
                (tab) => tab.file === path
              );
            if (options !== undefined) {
              const opts = options as ITextEditorOptions | undefined;
              if (opts?.selection) {
                globalEditorServiceCallbacks.selectionOverrideRef.current =
                  opts;
              }
            }
            if (tabIndex === -1) {
              globalEditorServiceCallbacks.openNewFileRef.current(path);
            } else {
              globalEditorServiceCallbacks.setFocusedRef.current(tabIndex);
            }

            resolve(undefined);
          });
        }),
        ...getModelServiceOverride(),
      });
      setInitialized(true);
      hasInitializedRef.current = true;
    };

    initializeEditor();
  }, []);

  useEffect(() => {
    if (focusedFile !== null) {
      let i = openFiles.indexOf(focusedFile);
      if (i === -1 || focused === i) return;
      setFocused(i);
    }
  }, [focusedFile, openFiles]);

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
    if (!monacoEl.current || editor || !initialized) return;

    const newEditor = monaco.editor.create(monacoEl.current, {
      value: "",
      language: "plaintext",
      theme: mode === "dark" ? "vs-dark" : "vs",
    });

    setUndo(() => () => {
      newEditor.trigger("keyboard", "undo", null);
    });

    setRedo(() => () => {
      newEditor.trigger("keyboard", "redo", null);
    });

    setEditor(newEditor);

    return () => {
      newEditor.dispose();
    };
  }, [initialized]);

  useEffect(() => {
    if (editor === null) return;
    let listener = editor.onDidScrollChange((e) => {
      if (focused !== undefined) {
        scrollStates.current[tabs[focused].file] = [e.scrollTop, e.scrollLeft];
      }
    });
    return () => {
      listener.dispose();
    };
  }, [editor, focused, tabs]);

  useEffect(() => {
    if (!editor || !initialized) return;
    monaco.editor.setTheme(mode === "dark" ? "vs-dark" : "vs");
  }, [mode, editor, initialized, openFiles]);

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

  useEffect(() => {
    let switchFile = async () => {
      if (!editor || focused === undefined || !tabs[focused]) return;
      let filePath = tabs[focused]?.file;
      let file = monaco.Uri.file(filePath);
      let modelRef = await monaco.editor.createModelReference(file);
      modelRef.object.onDidChangeDirty(() => {
        setUnsavedFiles((files) => {
          if (modelRef.object.isDirty()) {
            return [...files, tabs[focused]?.file];
          } else {
            return files.filter((f) => f !== tabs[focused]?.file);
          }
        });
      });

      setSaveFile(() => async () => {
        if (formatOnSave) {
          await editor.getAction("editor.action.formatDocument")?.run();
        }
        await modelRef.object.save();
      });

      editor.setModel(modelRef.object.textEditorModel);

      if (scrollStates.current && scrollStates.current[filePath]) {
        const [scrollTop, scrollLeft] = scrollStates.current[filePath];
        editor.setScrollTop(scrollTop);
        editor.setScrollLeft(scrollLeft);
      }

      // I don't love doing it like this but it seems to improve consistency over just running it directly
      requestAnimationFrame(() => {
        if (
          selectionOverrideRef.current &&
          selectionOverrideRef.current.selection
        ) {
          editor.setSelection(
            {
              startLineNumber:
                selectionOverrideRef.current.selection.startLineNumber,
              startColumn: selectionOverrideRef.current.selection.startColumn,
              endLineNumber:
                selectionOverrideRef.current.selection.endLineNumber ??
                selectionOverrideRef.current.selection.startLineNumber,
              endColumn:
                selectionOverrideRef.current.selection.endColumn ??
                selectionOverrideRef.current.selection.startColumn,
            },
            selectionOverrideRef.current.selectionSource
          );
          editor.revealLineNearTop(
            selectionOverrideRef.current.selection.startLineNumber,
            0
          );
          selectionOverrideRef.current = null;
        }
      });
    };
    switchFile();
  }, [focused, editor, tabs, formatOnSave]);

  return (
    <div className={"editor"}>
      <div
        className="tabsContainer MuiTabList-sizeSm"
        onDragOver={handleContainerDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onWheel={(e) => {
          if (e.deltaY !== 0) {
            e.currentTarget.scrollLeft += e.deltaY;
            e.preventDefault();
          }
        }}
      >
        {tabs.map((tab, index) => {
          let unsaved = unsavedFiles.includes(tab.file);
          return (
            <div key={tab.file} className="tab-wrapper">
              {dropIndicatorIndex === index && (
                <div className="drop-indicator" />
              )}
              <TabLike
                className={
                  (focused === index ? " Mui-selected" : "") +
                  (draggedIndex === index ? " dragging" : "")
                }
                role="tab"
                draggable={true}
                onClick={() => {
                  setFocused(index);
                }}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
              >
                {tab.name}
                <IconButton
                  component="span"
                  onMouseEnter={() => setHoveredOnBtn(index)}
                  onMouseLeave={() => setHoveredOnBtn(null)}
                  size="xs"
                  sx={{ margin: "0px", marginLeft: "2px" }}
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
                  {!unsaved || hoveredOnBtn === index ? (
                    <CloseIcon />
                  ) : (
                    <CircleIcon
                      sx={{ width: "10px", height: "10px", padding: "0 3px" }}
                    />
                  )}
                </IconButton>
              </TabLike>
            </div>
          );
        })}
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
