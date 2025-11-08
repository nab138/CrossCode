import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button, Tab, TabList, TabPanel, Tabs } from "@mui/joy";
import TerminalComponent from "./Terminal";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";

declare global {
  interface Window {
    terminals: Record<string, Terminal>;
  }
}

export default function MultiTerminal({}: {}) {
  const [terminals, setTerminals] = useState<string[]>([]);
  const isListening = useRef<boolean>(false);

  const createTerm = useCallback(async () => {
    const id = await invoke<string>("create_terminal");
    setTerminals((old) => {
      return [...old, id];
    });
  }, []);

  useEffect(() => {
    let unlisten: () => void = () => {};
    if (isListening.current) return;
    isListening.current = true;
    (async () => {
      unlisten = await listen("terminal", (event) => {
        const [termId, data] = event.payload as [string, string];
        if (data) {
          if (!window.terminals) window.terminals = {};
          if (window.terminals[termId]) {
            window.terminals[termId].write(data);
          }
        }
      });
    })();

    return () => {
      unlisten();
    };
  }, []);

  return (
    <div id="test">
      <Tabs orientation="vertical" sx={{ height: "100%" }}>
        <TabList>
          {terminals.map((t) => (
            <Tab key={t} value={t}>
              {t}
            </Tab>
          ))}
          <Button variant="outlined" onClick={createTerm}>
            +
          </Button>
        </TabList>
        {terminals.map((t) => (
          <TabPanel
            value={t}
            keepMounted
            key={t}
            sx={{ backgroundColor: "black", padding: "4px" }}
          >
            <TerminalComponent id={t} />
          </TabPanel>
        ))}
      </Tabs>
    </div>
  );
}
