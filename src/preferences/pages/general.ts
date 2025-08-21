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
      "What to do when the app starts.",
      "open-last"
    ),
  ],
  {
    description: "General application settings",
    category: "general",
  }
);
