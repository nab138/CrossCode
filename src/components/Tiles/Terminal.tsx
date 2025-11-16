import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../../utilities/StoreContext";

export default ({ id }: { id: string }) => {
  const elem = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal>();
  const [font] = useStore<string | null>("terminal/font-family", null);

  useEffect(() => {
    if (!elem.current) return;
    if (!window.terminals) window.terminals = {};

    const term = new Terminal({
      fontFamily: font !== "" ? font || undefined : undefined,
    });
    window.terminals[id] = term;
    term.open(elem.current);
    term.onData(async (data) => {
      await invoke("write_terminal", { id: id, data: data });
    });
    termRef.current = term;

    return () => {
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

  return <div ref={elem}></div>;
};
