import { useEffect, useState } from "react";
import "./BottomBar.css";
import { Input, Tab, TabList, TabPanel, Tabs } from "@mui/joy";
import CommandButton from "../CommandButton";
import { Terminal, StopCircle } from "@mui/icons-material";
import { useIDE } from "../../utilities/IDEContext";
import { useToast } from "react-toast-plus";
import { invoke } from "@tauri-apps/api/core";
import CommandConsole from "./CommandConsole";
import Console from "./Console";
import FilteredConsole from "./FilteredConsole";

const staticTabs = [
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
];

export default function BottomBar() {
  const [focused, setFocused] = useState<number>();
  const [refreshSyslog, setRefreshSyslog] = useState<number>(0);
  const [runningSyslog, setRunningSyslog] = useState<boolean>(false);
  const [syslogFilter, setSyslogFilter] = useState<string>("");
  const [stdoutFilter, setStdoutFilter] = useState<string>("");

  useEffect(() => {
    const checkSyslog = async () => {
      const isStreaming = await invoke<boolean>("is_streaming_syslog");
      setRunningSyslog(isStreaming);
    };
    checkSyslog();
  }, [focused, refreshSyslog]);

  useEffect(() => {
    if (focused === undefined && staticTabs.length > 0) {
      setFocused(0);
    }
  }, [focused]);

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
          {staticTabs.map((tab, index) => (
            <Tab key={tab.name} value={index} indicatorPlacement="bottom">
              {tab.name}
            </Tab>
          ))}
          <Tab value={staticTabs.length} indicatorPlacement="bottom">
            Syslog
          </Tab>
          <Tab value={staticTabs.length + 1} indicatorPlacement="bottom">
            App Console
          </Tab>
          {focused === staticTabs.length && (
            <BottomBarFilter
              filter={syslogFilter}
              setFilter={setSyslogFilter}
              setRefresh={setRefreshSyslog}
              displayName="Syslog"
              errorMessage="Please select a device to stream the syslog from."
              startCommand="start_stream_syslog"
              stopCommand="stop_stream_syslog"
              customTooltip="will cause performance issues"
              running={runningSyslog}
            />
          )}
          {focused === staticTabs.length + 1 && (
            <BottomBarFilter
              filter={stdoutFilter}
              setFilter={setStdoutFilter}
              setRefresh={setRefreshSyslog}
              displayName="App Console"
              errorMessage="Please select a device to stream app console from."
              startCommand="start_stream_stdout"
              stopCommand="stop_stream_stdout"
              customTooltip="will launch app automatically"
              running={false}
            />
          )}
        </TabList>
        {staticTabs.map((tab, index) => (
          <TabPanel
            value={index}
            key={tab.name}
            sx={{ padding: 0 }}
            keepMounted
          >
            {tab.component}
          </TabPanel>
        ))}

        <TabPanel value={staticTabs.length} sx={{ padding: 0 }} keepMounted>
          <FilteredConsole filter={syslogFilter} channel={"syslog-message"} />,
        </TabPanel>
        <TabPanel value={staticTabs.length + 1} sx={{ padding: 0 }} keepMounted>
          <FilteredConsole filter={stdoutFilter} channel={"stdout-message"} />,
        </TabPanel>
      </Tabs>
    </div>
  );
}

function BottomBarFilter({
  filter,
  setFilter,
  setRefresh,
  displayName,
  errorMessage,
  startCommand,
  stopCommand,
  running,
  customTooltip,
}: {
  filter: string;
  setFilter: React.Dispatch<React.SetStateAction<string>>;
  setRefresh: React.Dispatch<React.SetStateAction<number>>;
  displayName: string;
  errorMessage: string;
  startCommand: string;
  stopCommand: string;
  running: boolean;
  customTooltip: string;
}) {
  const { selectedDevice } = useIDE();
  const { addToast } = useToast();

  return (
    <>
      {!running && (
        <CommandButton
          disabled={!selectedDevice}
          tooltip={`Start ${displayName} (${customTooltip})`}
          variant="plain"
          command={startCommand}
          icon={<Terminal />}
          parameters={{
            device: selectedDevice,
          }}
          validate={() => {
            if (!selectedDevice) {
              addToast.error(errorMessage);
              return false;
            }
            return true;
          }}
          after={() => {
            setRefresh((prev) => prev + 1);
          }}
          label={`Start ${displayName}`}
          sx={{
            marginLeft: "auto",
            marginRight: "var(--padding-xs)",
            fontSize: "12px",
          }}
          size="sm"
        />
      )}
      {running && (
        <Input
          placeholder={`Filter ${displayName}...`}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
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
      {running && (
        <CommandButton
          tooltip={`Stop ${displayName}`}
          variant="plain"
          command={stopCommand}
          icon={<StopCircle />}
          sx={{
            marginRight: "var(--padding-xs)",
            fontSize: "12px",
          }}
          after={() => {
            setRefresh((prev) => prev + 1);
          }}
          label={`Stop ${displayName}`}
          size="sm"
        />
      )}
    </>
  );
}
