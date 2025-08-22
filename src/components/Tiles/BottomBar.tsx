import { useEffect, useState } from "react";
import "./BottomBar.css";
import { Input, Tab, TabList, TabPanel, Tabs } from "@mui/joy";
import Console from "./Console";
import CommandConsole from "./CommandConsole";
import CommandButton from "../CommandButton";
import { Terminal, StopCircle } from "@mui/icons-material";
import { useIDE } from "../../utilities/IDEContext";
import { useToast } from "react-toast-plus";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../../utilities/StoreContext";
import Syslog from "./Syslog";

const tabs = [
  {
    name: "Build Output",
    component: <CommandConsole />,
  },
  {
    name: "SourceKit-LSP",
    component: (
      <Console key="lsp-message" channel="lsp-message" jsonPrettyPrint />
    ),
  },
  {
    name: "Syslog",
    component: <Syslog />,
  },
  //{ name: "Terminal", component: <div>Terminal is coming soon!</div> },
];

export default function BottomBar() {
  const [focused, setFocused] = useState<number>();
  const [refreshSyslog, setRefreshSyslog] = useState<number>(0);
  const [runningSyslog, setRunningSyslog] = useState<boolean>(false);
  const [syslogFilter, setSyslogFilter] = useStore<string>("syslog-filter", "");
  const [syslogFilterState, setSyslogFilterState] =
    useState<string>(syslogFilter);
  const { selectedDevice } = useIDE();
  const { addToast } = useToast();

  useEffect(() => {
    const checkSyslog = async () => {
      const isStreaming = await invoke<boolean>("is_streaming_syslog");
      setRunningSyslog(isStreaming);
    };
    checkSyslog();
  }, [focused, refreshSyslog]);

  useEffect(() => {
    if (focused === undefined && tabs.length > 0) {
      setFocused(0);
    }
  }, [focused]);

  useEffect(() => {
    setSyslogFilter(syslogFilterState);
  }, [syslogFilterState]);

  return (
    <div className="bottom-container">
      <Tabs
        sx={{ height: "100%", overflow: "hidden" }}
        value={focused ?? 0}
        onChange={(_, newValue) => {
          if (newValue === null) return;
          setFocused(newValue as number);
        }}
      >
        <TabList
          size="sm"
          sx={{
            minHeight: 33,
            "& .MuiTab-root": {
              fontSize: 12,
              minHeight: 24,
              padding: "2px 8px",
            },
          }}
        >
          {tabs.map((tab, index) => (
            <Tab key={tab.name} value={index} indicatorPlacement="bottom">
              {tab.name}
            </Tab>
          ))}
          {focused === 2 && !runningSyslog && (
            <CommandButton
              disabled={!selectedDevice}
              tooltip="Start syslog (will affect performance!)"
              variant="plain"
              command="start_stream_syslog"
              icon={<Terminal />}
              parameters={{
                device: selectedDevice,
              }}
              validate={() => {
                if (!selectedDevice) {
                  addToast.error(
                    "Please select a device to stream the syslog from"
                  );
                  return false;
                }
                return true;
              }}
              after={() => {
                setRefreshSyslog((prev) => prev + 1);
              }}
              label="Start Syslog"
              sx={{
                marginLeft: "auto",
                marginRight: "var(--padding-xs)",
                fontSize: "12px",
              }}
              size="sm"
            />
          )}
          {focused === 2 && runningSyslog && (
            <Input
              placeholder="Filter syslog..."
              value={syslogFilterState}
              onChange={(e) => {
                setSyslogFilterState(e.target.value);
              }}
              sx={{
                width: "200px",
                marginRight: "var(--padding-xs)",
                marginLeft: "auto",
                fontSize: "12px",
              }}
              size="sm"
            />
          )}
          {focused === 2 && runningSyslog && (
            <CommandButton
              tooltip="Stop syslog"
              variant="plain"
              command="stop_stream_syslog"
              icon={<StopCircle />}
              sx={{
                marginRight: "var(--padding-xs)",
                fontSize: "12px",
              }}
              after={() => {
                setRefreshSyslog((prev) => prev + 1);
              }}
              label="Stop Syslog"
              size="sm"
            />
          )}
        </TabList>
        {tabs.map((tab, index) => (
          <TabPanel
            value={index}
            key={tab.name}
            sx={{ padding: 0 }}
            keepMounted
          >
            {tab.component}
          </TabPanel>
        ))}
      </Tabs>
    </div>
  );
}
