import { createPreferencePage, createItems } from "../helpers";
import { invoke } from "@tauri-apps/api/core";

export const appleIdPage = createPreferencePage(
  "apple-id",
  "Apple ID",
  [
    createItems.select(
      "anisette-server",
      "Anisette Server",
      [
        { label: "Sidestore (.io)", value: "ani.sidestore.io" },
        { label: "Sidestore (.app)", value: "ani.sidestore.app" },
        { label: "Sidestore (.zip)", value: "ani.sidestore.zip" },
        { label: "Sidestore (.xyz)", value: "ani.846969.xyz" },
        { label: "nythepegasus", value: "ani.npeg.us" },
        { label: "Custom", value: "other", default: "ani.yourserver.com" }
      ],
      "The remote anisette server used. Change this if you are having issues logging in.",
      "ani.sidestore.io"
    ),
    {
      id: "apple-id-email",
      name: "Apple ID",
      description: "The apple ID email you are currently logged in with.",
      type: "info",
      defaultValue: async () => {
        const appleId = await invoke<string>("get_apple_email");
        return appleId || "Not logged in";
      },
    },
    createItems.button(
      "reset-anisette",
      "Reset Anisette",
      "Remove all anisette data (will require 2fa again)",
      "danger",
      "soft",
      async () => {
        await invoke("reset_anisette");
      }
    ),
    createItems.button(
      "reset-credentials",
      "Reset Saved Credentials",
      "Remove saved Apple ID credentials and anisette data",
      "danger",
      "soft",
      async () => {
        await invoke("delete_stored_credentials");
        await invoke("reset_anisette");
      }
    ),
  ],
  {
    description: "Manage your Apple ID authentication",
    category: "apple",
  }
);
