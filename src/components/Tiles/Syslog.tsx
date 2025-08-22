import { useEffect, useRef, useState } from "react";
import "./Console.css";
import { listen } from "@tauri-apps/api/event";
import Convert from "ansi-to-html";
import { Virtuoso } from "react-virtuoso";
import { useStore } from "../../utilities/StoreContext";
import { escapeHtml } from "./Console";

const convert = new Convert();

export default function Syslog() {
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [syslogFilter] = useStore<string>("syslog-filter", "");
  const listenerAdded = useRef(false);
  const unlisten = useRef<() => void>(() => {});

  useEffect(() => {
    if (!listenerAdded.current) {
      (async () => {
        const unlistenFn = await listen("syslog-message", (event) => {
          let line = event.payload as string;
          setConsoleLines((lines) => [...lines, line]);
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
        atBottomThreshold={50}
        followOutput={"auto"}
        data={consoleLines.filter((line) => {
          if (!syslogFilter || syslogFilter === "") return true;
          return line.toLowerCase().includes(syslogFilter.toLowerCase());
        })}
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
