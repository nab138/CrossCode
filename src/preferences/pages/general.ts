import { createPreferencePage } from "../helpers";
import { getVersion } from "@tauri-apps/api/app";

export const generalPage = createPreferencePage(
  "general",
  "General",
  [
    {
      id: "app-version",
      name: "App Version",
      description: "The current version of YCode.",
      type: "info",
      defaultValue: async () => {
        return await getVersion();
      },
    },
  ],
  {
    description: "General application settings",
    category: "general",
  }
);
