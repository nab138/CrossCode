import { Divider } from "@mui/joy";
import SDKMenu from "../../components/SDKMenu";
import SwiftMenu from "../../components/SwiftMenu";
import { createCustomPreferencePage } from "../helpers";

export const swiftPage = createCustomPreferencePage(
  "swift",
  "Swift Setup",
  () => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--padding-md)",
      }}
    >
      <SwiftMenu />
      <Divider style={{ marginLeft: "-20px" }} />
      <SDKMenu />
    </div>
  ),
  {
    description: "Manage your swift toolchains and Darwin SDK",
    category: "swift",
  }
);
