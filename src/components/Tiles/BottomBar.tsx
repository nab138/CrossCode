import { useState } from "react";
import "./BottomBar.css";
import { Tab, TabList, TabPanel, Tabs } from "@mui/joy";
import Console from "./Console";
import CommandConsole from "./CommandConsole";
import CommandButton from "../CommandButton";
import { Terminal, StopCircle } from "@mui/icons-material";
import { useIDE } from "../../utilities/IDEContext";
import { useToast } from "react-toast-plus";

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
    name: "Console",
    component: <Console key="syslog" channel="syslog-message" />,
  },
  //{ name: "Terminal", component: <div>Terminal is coming soon!</div> },
];

export default function BottomBar() {
  const [focused, setFocused] = useState<number>();
  const { selectedDevice } = useIDE();
  const { addToast } = useToast();

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
            minHeight: 28, // adjust as needed
            "& .MuiTab-root": {
              fontSize: 12, // smaller font
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
          <CommandButton
            disabled={!selectedDevice}
            tooltip="Start syslog"
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
              setFocused(2);
              console.log("valid!");
              return true;
            }}
            label="Start Syslog"
            sx={{ marginLeft: "auto", marginRight: 0, fontSize: "12px" }}
          />
          <CommandButton
            tooltip="Stop syslog"
            variant="plain"
            command="stop_stream_syslog"
            icon={<StopCircle />}
            sx={{ marginRight: 0, fontSize: "12px" }}
            label="Stop Syslog"
          />
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
