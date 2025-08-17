import { useState } from "react";
import "./BottomBar.css";
import { Tab, TabList, TabPanel, Tabs } from "@mui/joy";
import Console from "./Console";
import CommandConsole from "./CommandConsole";

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
  { name: "Terminal", component: <div>Terminal is coming soon!</div> },
];

export default function BottomBar() {
  const [focused, setFocused] = useState<number>();

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
