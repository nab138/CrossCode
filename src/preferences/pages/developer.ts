import { invoke } from "@tauri-apps/api/core";
import { createItems, createPreferencePage } from "../helpers";
import { load } from "@tauri-apps/plugin-store";
import { relaunch } from "@tauri-apps/plugin-process";
import { confirm } from "@tauri-apps/plugin-dialog";

export const developerPage = createPreferencePage(
  "developer",
  "Developer",
  [
    createItems.checkbox(
      "delete-app-ids",
      "Allow deleting app IDs",
      "Reveal the delete button in the app ID page (note: they will still count towards your limit!)"
    ),
    createItems.button(
      "reset-all",
      "Reset All Stored Data",
      "Resets preferences, credentials, etc. This action is irreversible! The app will restart after.",
      "danger",
      "solid",
      async () => {
        if(!await confirm("Are you sure you want to reset all stored data? This action is irreversible!")) return;
        await invoke("delete_stored_credentials");
        await invoke("reset_anisette");

        let storeInstance = await load("preferences.json");
        await storeInstance.clear();

        await relaunch();
      }
    ),
  ],
  {
    description: "Internal developer settings",
    category: "advanced",
  }
);
