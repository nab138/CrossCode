import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";
import { invoke } from "@tauri-apps/api/core";

export default ({ id }: { id: string }) => {
  const elem = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!elem.current) return;
    if (!window.terminals) window.terminals = {};

    const term = new Terminal();
    window.terminals[id] = term;
    term.open(elem.current);
    term.onData(async (data) => {
      console.log(await invoke("write_terminal", { id: id, data: data }));
    });

    return () => {
      term.dispose();
    };
  }, [id]);

  return <div ref={elem}></div>;
};
