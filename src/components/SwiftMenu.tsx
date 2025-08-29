import {
  Button,
  FormControl,
  Link,
  Radio,
  RadioGroup,
  Typography,
} from "@mui/joy";
import { Toolchain, useIDE } from "../utilities/IDEContext";
import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import ErrorIcon from "@mui/icons-material/Error";
import { invoke } from "@tauri-apps/api/core";

export default () => {
  const {
    selectedToolchain,
    setSelectedToolchain,
    toolchains,
    scanToolchains,
    locateToolchain,
    isWindows,
    hasWSL,
  } = useIDE();

  const isWindowsReady = !isWindows || hasWSL;

  const [allToolchains, setAllToolchains] = useState<Toolchain[]>([]);
  useEffect(() => {
    let loadAllToolchains = async () => {
      let all: Toolchain[] = [];
      if (toolchains !== null && toolchains.toolchains) {
        all = [...toolchains.toolchains];
      }
      if (
        selectedToolchain &&
        !all.some(
          (t) => stringifyToolchain(t) === stringifyToolchain(selectedToolchain)
        ) &&
        (await invoke("validate_toolchain", {
          toolchainPath: selectedToolchain.path,
        }))
      ) {
        all.push(selectedToolchain);
      }
      setAllToolchains(all);
    };
    loadAllToolchains();
  }, [selectedToolchain, toolchains]);

  return (
    <div
      style={{
        width: "fit-content",
        display: "flex",
        flexDirection: "column",
        gap: "var(--padding-md)",
      }}
    >
      {!selectedToolchain && (
        <Typography
          level="body-md"
          color="danger"
          sx={{
            alignContent: "center",
            display: "flex",
            gap: "var(--padding-xs)",
          }}
        >
          <ErrorIcon />
          No toolchain selected
        </Typography>
      )}
      <Typography level="body-sm">
        {toolchains === null
          ? "Checking for Swift..."
          : toolchains.swiftlyInstalled
          ? `Swiftly Detected: ${toolchains.swiftlyVersion}`
          : "CrossCode was unable to detect Swiftly."}
      </Typography>
      {!isWindowsReady && toolchains !== null && allToolchains.length === 0 && (
        <Typography level="body-md" color="danger">
          Install WSL before swift, as you need to install swift inside of WSL.
        </Typography>
      )}
      {isWindowsReady && toolchains !== null && allToolchains.length === 0 && (
        <Typography level="body-md" color="warning">
          No Swift toolchains found. You can get one by installing swiftly
          {isWindows && " in WSL"} and running "
          <span
            style={{
              fontFamily: "monospace",
            }}
          >
            swiftly install 6.1
          </span>
          " or manually. If you have already done so, but it is not showing up,
          your toolchain installation may be broken. For help, refer to the{" "}
          <Link
            href="#"
            onClick={(e) => {
              e.preventDefault();
              openUrl(
                "https://github.com/nab138/CrossCode/wiki/Troubleshooting#swift-toolchain-not-detected"
              );
            }}
          >
            troubleshooting guide
          </Link>
          .
        </Typography>
      )}
      {toolchains !== null && allToolchains.length > 0 && (
        <div>
          <Typography level="body-md">Select a toolchain:</Typography>
          <RadioGroup
            value={stringifyToolchain(selectedToolchain)}
            sx={{
              marginTop: "var(--padding-xs)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--padding-md)",
            }}
          >
            {allToolchains.map((toolchain) => (
              <FormControl key={stringifyToolchain(toolchain)}>
                <Radio
                  label={
                    toolchain.version +
                    (isCompatable(toolchain) ? "" : " - Not Compatable")
                  }
                  disabled={!isCompatable(toolchain) || !isWindowsReady}
                  value={stringifyToolchain(toolchain)}
                  variant="outlined"
                  overlay
                  onChange={() => setSelectedToolchain(toolchain)}
                />
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--padding-xs)",
                  }}
                >
                  <Typography level="body-sm">{toolchain.path}</Typography>
                  <Typography level="body-sm" color="primary">
                    {toolchain.isSwiftly ? "(Swiftly)" : "(Manually Installed)"}
                  </Typography>
                </div>
              </FormControl>
            ))}
          </RadioGroup>
        </div>
      )}
      <div
        style={{
          display: "flex",
          gap: "var(--padding-md)",
        }}
      >
        {toolchains?.swiftlyInstalled === false &&
          selectedToolchain === null && (
            <Button
              disabled={!isWindowsReady}
              variant="soft"
              onClick={() => {
                openUrl("https://www.swift.org/install/linux");
              }}
            >
              Download Swift
            </Button>
          )}
        {
          <Button
            disabled={!isWindowsReady}
            variant="soft"
            onClick={() => {
              scanToolchains();
            }}
          >
            Scan Again
          </Button>
        }
        {
          <Button
            variant="soft"
            onClick={locateToolchain}
            disabled={!isWindowsReady}
          >
            Locate Existing Toolchain
          </Button>
        }
      </div>
    </div>
  );
};

function isCompatable(toolchain: Toolchain | null): boolean {
  if (!toolchain) return false;
  return toolchain.version.startsWith("6.1");
}

function stringifyToolchain(toolchain: Toolchain | null): string | null {
  if (!toolchain) return null;
  return `${toolchain.path}:${toolchain.version}:${toolchain.isSwiftly}`;
}
