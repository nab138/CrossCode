import { useEffect, useRef, useState } from "react";
import "./Console.css";
import { listen } from "@tauri-apps/api/event";
import Convert from "ansi-to-html";
import { Virtuoso } from "react-virtuoso";

const convert = new Convert();

export function escapeHtml(unsafe: string) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export default function Console({
  channel,
  jsonPrettyPrint,
}: {
  channel: string;
  jsonPrettyPrint?: boolean;
}) {
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const listenerAdded = useRef(false);
  const unlisten = useRef<() => void>(() => {});

  useEffect(() => {
    if (!listenerAdded.current) {
      (async () => {
        const unlistenFn = await listen(channel, (event) => {
          let line = event.payload as string;
          if (jsonPrettyPrint) {
            try {
              let parsed = JSON.parse(line);
              line = JSON.stringify(parsed, null, 2);
            } catch (error) {
              console.error(
                "Failed to parse JSON where prettyPrint was enabled:",
                error
              );
            }
          }
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
        atBottomThreshold={30}
        followOutput={"auto"}
        data={consoleLines.filter((l) => l.toLowerCase().includes("banana"))}
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
