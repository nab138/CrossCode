import { useEffect, useRef } from "react";
import "./Console.css";
import { listen } from "@tauri-apps/api/event";
import Convert from "ansi-to-html";
import { Virtuoso } from "react-virtuoso";
import { useIDE } from "../../utilities/IDEContext";
import { escapeHtml } from "./Console";
import { useParams } from "react-router";

const convert = new Convert();

export default function CommandConsole() {
  const { consoleLines, setConsoleLines } = useIDE();
  const listenerAdded = useRef(false);
  const unlisten = useRef<() => void>(() => {});

  const { path } = useParams<"path">();

  useEffect(() => {
    setConsoleLines([]);
  }, [path]);

  useEffect(() => {
    if (!listenerAdded.current) {
      (async () => {
        const unlistenFn = await listen("build-output", (event) => {
          let line = event.payload as string;
          if (line.includes("command.done")) {
            if (line.split(".")[2] === "999") {
              setConsoleLines((lines) => [...lines, "Command failed"]);
            } else {
              setConsoleLines((lines) => [
                ...lines,
                "Command finished with exit code: " + line.split(".")[2],
              ]);
            }
          } else {
            setConsoleLines((lines) => [...lines, line]);
          }
        });
        unlisten.current = unlistenFn;
      })();
      listenerAdded.current = true;
    }
    return () => {
      unlisten.current();
    };
  }, []);

  return (
    <div className="console-container">
      <Virtuoso
        className="console-tile"
        atBottomThreshold={20}
        followOutput={"auto"}
        data={consoleLines}
        itemContent={(_, line) => (
          <pre
            style={{ margin: 0, width: "fit-content", padding: 0 }}
            dangerouslySetInnerHTML={{
              __html: convert.toHtml(escapeHtml(line)),
            }}
          />
        )}
      />
    </div>
  );
}
