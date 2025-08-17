import { createPreferencePage, createItems } from "../helpers";

export const sourceKitPage = createPreferencePage(
  "sourcekit",
  "SourceKit LSP",
  [
    createItems.checkbox(
      "startup",
      "Auto-Launch SourceKit",
      "Automatically start sourcekit-lsp when you open a project",
      true
    ),
  ],
  {
    description: "Customize the look and feel of the application",
    category: "general",
  }
);
