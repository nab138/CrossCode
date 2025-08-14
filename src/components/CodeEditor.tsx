import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as monaco from "monaco-editor";
import "./CodeEditor.css";
import { useColorScheme } from "@mui/joy/styles";
import * as fs from "@tauri-apps/plugin-fs";

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

await initialize({
  ...getTextMateServiceOverride(),
  ...getThemeServiceOverride(),
  ...getLanguagesServiceOverride(),
  ...getEditorServiceOverride(() => {
    return new Promise((resolve) => {
      console.log("hi");
      resolve(undefined);
    });
  }),
  ...getModelServiceOverride(),
});

export interface CodeEditorProps {
  file: string;
  setUnsaved: (unsaved: boolean) => void;
}
export interface CodeEditorHandles {
  file: string;
  saveFile: () => void;
}

const CodeEditor = forwardRef<CodeEditorHandles, CodeEditorProps>(
  ({ file, setUnsaved }, ref) => {
    const [editor, setEditor] =
      useState<monaco.editor.IStandaloneCodeEditor | null>(null);
    const monacoEl = useRef(null);
    const { mode } = useColorScheme();
    const [originalText, setOriginalText] = useState("");
    const [failedReason, setFailedReason] = useState<string | null>(null);

    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

    useEffect(() => {
      editorRef.current = editor;
    }, [editor]);

    const saveFile = useCallback(() => {
      if (editorRef.current) {
        const currentText = editorRef.current.getValue();
        setUnsaved(false);
        fs.writeTextFile(file, currentText).then(() => {
          setOriginalText(currentText);
          setUnsaved(false);
        });
      }
    }, [file, setUnsaved]);

    useImperativeHandle(ref, () => ({
      saveFile,
      file,
    }));

    useEffect(() => {
      if (monacoEl.current && !editor) {
        let colorScheme = mode;
        if (colorScheme === "system") {
          colorScheme = window.matchMedia("(prefers-color-scheme: dark)")
            .matches
            ? "dark"
            : "light";
        }

        const newEditor = monaco.editor.create(monacoEl.current, {
          value: "",
          language: "plaintext",
          theme: "vs-" + colorScheme,
          automaticLayout: true,
        });

        setEditor(newEditor);

        return () => {
          newEditor.dispose();
        };
      }
    }, []);

    useEffect(() => {
      if (!editor) return;

      let colorScheme = mode;
      if (colorScheme === "system") {
        colorScheme = window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
      }

      monaco.editor.setTheme("vs-" + colorScheme);
    }, [mode, editor]);

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

    useEffect(() => {
      (async () => {
        if (editor && file) {
          let uri = monaco.Uri.file(file);
          let modelRef = await monaco.editor.createModelReference(uri);
          modelRef.object.onDidChangeDirty(() => {
            setUnsaved(modelRef.object.isDirty());
          });

          editor.setModel(modelRef.object.textEditorModel);
        }
      })().catch((e) => {
        console.error(e);
        setFailedReason("Failed to load file: " + e.message);
      });
    }, [file, editor]);

    useEffect(() => {
      if (editor && originalText) {
        const model = editor.getModel();
        if (model) {
          const listener = model.onDidChangeContent(() => {
            if (editor.getValue() !== originalText) {
              setUnsaved(true);
            }
          });

          return () => {
            listener.dispose();
          };
        }
      }
    }, [editor, setUnsaved, originalText]);

    if (failedReason !== null) {
      return <div className={"editor-failed"}>{failedReason}</div>;
    }
    return <div className={"code-editor"} ref={monacoEl}></div>;
  }
);

export default CodeEditor;
