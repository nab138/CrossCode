import { createPreferencePage, createItems } from "../helpers";

export const sourceKitPage = createPreferencePage(
  "sourcekit",
  "Language Features",
  [
    createItems.checkbox(
      "startup",
      "Auto-Launch SourceKit",
      "Automatically start sourcekit-lsp when you open a project",
      true
    ),
    createItems.checkbox(
      "format",
      "Format on save",
      "Automatically format your code when you save",
      true
    ),
  ],
  {
    description: "Configure SourceKit-LSP and other language features",
    category: "swift",
  }
);
