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
} from "@mui/joy";
import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import CloseIcon from "@mui/icons-material/Close";

export interface EditorProps {
  openFiles: string[];
  setOpenFiles: Dispatch<SetStateAction<string[]>>;
  focusedFile: string | null;
  setSaveFile: (save: () => void) => void;
}

export default ({
  openFiles,
  focusedFile,
  setSaveFile,
  setOpenFiles,
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
            sx={{ padding: 0 }}
            keepMounted
          >
            <CodeEditor
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
          </TabPanel>
        ))}
      </Tabs>
    </div>
  );
};
