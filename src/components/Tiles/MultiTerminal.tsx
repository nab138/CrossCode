import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button, Tab, TabList, TabPanel, Tabs } from "@mui/joy";
import TerminalComponent from "./Terminal";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { useStore } from "../../utilities/StoreContext";

declare global {
  interface Window {
    terminals: Record<string, Terminal>;
  }
}

export default function MultiTerminal({}: {}) {
  const [terminals, setTerminals] = useState<string[]>([]);
  const isListening = useRef<boolean>(false);
  const [shell] = useStore<string | null>("terminal/shell", null);

  const createTerm = useCallback(async () => {
    console.log("creating terminal with shell:", shell);
    const id = await invoke<string>("create_terminal", {
      shell: shell !== "" ? shell : null,
    });
    console.log("Created terminal with ID:", id);
    setTerminals((old) => {
      return [...old, id];
    });
  }, [shell]);

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
    <div
      id="terminal-container"
      style={{
        width: "100%",
        height: "100%",
      }}
    >
      <Tabs
        orientation="vertical"
        sx={{
          width: "100%",
          height: "100%",
        }}
      >
        <TabList
          sx={{
            "& .MuiTab-root": {
              whiteSpace: "nowrap",
            },
          }}
        >
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
            sx={{
              backgroundColor: "black",
              padding: "4px",
              height: "100%",
              width: "100%",
            }}
          >
            <TerminalComponent id={t} />
          </TabPanel>
        ))}
      </Tabs>
    </div>
  );
}
