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

export interface CodeEditorProps {
  file: string;
  setUnsaved: (unsaved: boolean) => void;
  editor: monaco.editor.IStandaloneCodeEditor;
}
export interface CodeEditorHandles {
  file: string;
  saveFile: () => void;
}

const CodeEditor = forwardRef<CodeEditorHandles, CodeEditorProps>(
  ({ file, setUnsaved, editor }, ref) => {
    const { mode } = useColorScheme();
    const [failedReason, setFailedReason] = useState<string | null>(null);

    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

    useEffect(() => {
      editorRef.current = editor;
    }, [editor]);

    const saveFile = useCallback(async () => {
      let uri = monaco.Uri.file(file);
      let modelRef = await monaco.editor.createModelReference(uri);
      modelRef.object.save();
    }, [file, setUnsaved, editor]);

    useImperativeHandle(ref, () => ({
      saveFile,
      file,
    }));

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

    if (failedReason !== null) {
      return <div className={"editor-failed"}>{failedReason}</div>;
    }
  }
);

export default CodeEditor;
