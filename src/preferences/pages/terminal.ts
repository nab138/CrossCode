import { createItems, createPreferencePage } from "../helpers";

export const terminalPage = createPreferencePage(
  "terminal",
  "Terminal",
  [
    createItems.text(
      "shell",
      "Default Shell",
      "The shell to use (e.x /bin/bash). If unset, defaults to $SHELL on linux/macOS and pwsh.exe on Windows."
    ),
    createItems.text(
      "font-family",
      "Font Family",
      "Recommended to use a monospace font (e.x. monospace)",
      "monospace"
    ),
  ],
  {
    description: "Configure the integrated terminal",
    category: "general",
  }
);
