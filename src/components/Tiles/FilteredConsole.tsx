import { useEffect, useImperativeHandle, useRef, useState } from "react";
import "./Console.css";
import { listen } from "@tauri-apps/api/event";
import Convert from "ansi-to-html";
import { Virtuoso } from "react-virtuoso";
import { escapeHtml } from "./Console";
import React from "react";

const convert = new Convert();

export type FilteredConsoleHandle = {
  clear: () => void;
};

type FilteredConsoleProps = {
  filter: string;
  channel: string;
  doneSignal?: string;
  alertDone?: () => void;
};

export default React.forwardRef<FilteredConsoleHandle, FilteredConsoleProps>(
  ({ filter, channel, doneSignal = "", alertDone }, ref) => {
    const [consoleLines, setConsoleLines] = useState<string[]>([]);
    const listenerAdded = useRef(false);
    const unlisten = useRef<() => void>(() => {});

    useImperativeHandle(ref, () => ({
      clear: () => {
        setConsoleLines([]);
      },
    }));

    useEffect(() => {
      if (!listenerAdded.current) {
        (async () => {
          const unlistenFn = await listen(channel, (event) => {
            let line = event.payload as string;
            if (doneSignal !== "" && line === doneSignal) return alertDone?.();
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
            if (!filter || filter === "") return true;
            return line.toLowerCase().includes(filter.toLowerCase());
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
);
