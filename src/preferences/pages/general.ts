import { createItems, createPreferencePage } from "../helpers";
import { getVersion } from "@tauri-apps/api/app";

export const generalPage = createPreferencePage(
  "general",
  "General",
  [
    {
      id: "app-version",
      name: "App Version",
      description: "The current version of CrossCode.",
      type: "info",
      defaultValue: async () => {
        return await getVersion();
      },
    },
    createItems.select(
      "startup",
      "Startup Behavior",
      [
        {
          label: "Open last project",
          value: "open-last",
        },
        {
          label: "Show welcome page",
          value: "welcome",
        },
      ],
      "",
      "open-last"
    ),
    createItems.select(
      "check-updates",
      "Check for Updates",
      [
        {
          label: "On Startup",
          value: "auto",
        },
        {
          label: "Manually",
          value: "manual",
        },
      ],
      "",
      "auto"
    ),
  ],
  {
    description: "General application settings",
    category: "general",
  }
);
