import { Terminal } from "@xterm/xterm";
import { FitAddon } from "xterm-addon-fit";
import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../../utilities/StoreContext";

export default ({ id }: { id: string }) => {
  const termElemRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal>();
  const fitAddonRef = useRef<FitAddon>();
  const [font] = useStore<string | null>("terminal/font-family", null);

  useEffect(() => {
    if (!termElemRef.current) return;
    if (!window.terminals) window.terminals = {};

    const term = new Terminal({
      fontFamily: font !== "" ? font || undefined : undefined,
    });
    window.terminals[id] = term;
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);
    term.open(termElemRef.current);

    const resizeObserver = new ResizeObserver(async () => {
      fitAddon.fit();
      void invoke("resize_terminal", {
        id,
        cols: term.cols,
        rows: term.rows,
      });
    });
    resizeObserver.observe(termElemRef.current);

    term.onData(async (data) => {
      await invoke("write_terminal", { id, data });
    });
    termRef.current = term;

    fitAddon.fit();
    void invoke("resize_terminal", {
      id,
      cols: term.cols,
      rows: term.rows,
    });

    return () => {
      resizeObserver.disconnect();
      term.dispose();
    };
  }, [id]);

  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.fontFamily =
        font !== "" ? font || undefined : undefined;
      termRef.current.refresh(0, termRef.current.rows - 1);
    }
  }, [font]);

  return (
    <div
      ref={termElemRef}
      style={{ height: "calc(100% - 0.55em)", width: "100%" }}
    />
  );
};
