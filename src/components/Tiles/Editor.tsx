import { path } from "@tauri-apps/api";
import CodeEditor, { CodeEditorHandles } from "../CodeEditor";
import "./Editor.css";
import {
  IconButton,
  ListItemDecorator,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  useColorScheme,
} from "@mui/joy";
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
        ...getEditorServiceOverride((modelRef) => {
          return new Promise((resolve) => {
            if (!editorRef.current) return resolve(undefined);
            editorRef.current.setModel(modelRef.object.textEditorModel);
            let path = editorRef.current.getModel()?.uri.fsPath;
            if (!path) return resolve(undefined);
            let tabIndex = currentTabsRef.current.findIndex(
              (tab) => tab.file === path
            );
            if (tabIndex === -1) {
              openNewFileRef.current(path);
            }
            setFocusedRef.current(tabIndex);
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

  return (
    <div className={"editor"}>
      <Tabs
        sx={{ height: "100%", overflow: "hidden" }}
        size="sm"
        className={"editor-tabs"}
        value={focused ?? 0}
        onChange={(_, newValue) => {
          if (newValue === null) return;
          setFocused(newValue as number);
        }}
      >
        <TabList>
          {tabs.map((tab, index) => (
            <Tab key={tab.file} value={index} indicatorPlacement="bottom">
              {tab.name}
              {unsavedFiles.indexOf(tab.file) != -1 ? " •" : ""}
              <ListItemDecorator>
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
              </ListItemDecorator>
            </Tab>
          ))}
        </TabList>
        {tabs.map((tab, index) => (
          <TabPanel
            value={index}
            key={tab.file}
            sx={{ padding: 0, width: 0, height: 0 }}
          >
            {editor && (
              <CodeEditor
                editor={editor}
                ref={(el) => (editors.current[index] = el)}
                key={tab.file}
                file={tab.file}
                setUnsaved={(unsaved: boolean) => {
                  if (unsaved)
                    setUnsavedFiles((unsaved) => [...unsaved, tab.file]);
                  else
                    setUnsavedFiles((unsaved) =>
                      unsaved.filter((unsavedFile) => unsavedFile !== tab.file)
                    );
                }}
              />
            )}
          </TabPanel>
        ))}
        <div
          className={"code-editor"}
          ref={monacoEl}
          style={tabs.length >= 1 ? {} : { display: "none" }}
        />
      </Tabs>
    </div>
  );
};
