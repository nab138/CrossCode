import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-shell";
import "./Onboarding.css";
import { Button, Card, CardContent, Divider, Link, Typography } from "@mui/joy";
import { useIDE } from "../utilities/IDEContext";
import logo from "../assets/logo.png";
import { useNavigate } from "react-router";
import { openUrl } from "@tauri-apps/plugin-opener";
import SwiftMenu from "../components/SwiftMenu";
import SDKMenu from "../components/SDKMenu";
import ErrorIcon from "@mui/icons-material/Error";
import WarningIcon from "@mui/icons-material/Warning";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { useToast } from "react-toast-plus";
import { relaunch } from "@tauri-apps/plugin-process";

export interface OnboardingProps {}

export default ({}: OnboardingProps) => {
  const {
    selectedToolchain,
    toolchains,
    hasWSL,
    isWindows,
    openFolderDialog,
    hasDarwinSDK,
  } = useIDE();
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState<string>("");
  const navigate = useNavigate();
  const { addToast } = useToast();

  useEffect(() => {
    if (toolchains !== null && isWindows !== null && hasWSL !== null) {
      setReady(
        selectedToolchain !== null &&
          (isWindows ? hasWSL : true) &&
          hasDarwinSDK
      );
    } else {
      setReady(false);
    }
  }, [selectedToolchain, toolchains, hasWSL, isWindows, hasDarwinSDK]);

  useEffect(() => {
    const fetchVersion = async () => {
      const version = await getVersion();
      setVersion(version);
    };
    fetchVersion();
  }, []);

  return (
    <div className="onboarding">
      <div className="onboarding-header">
        <img src={logo} alt="CrossCode Logo" className="onboarding-logo" />
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "var(--padding-sm)",
            }}
          >
            <Typography level="h1">Welcome to CrossCode!</Typography>
            {version && <Typography level="body-sm">v{version}</Typography>}
          </div>
          <Typography level="body-sm">
            IDE for iOS Development on Windows and Linux
          </Typography>
        </div>
      </div>
      <div>
        <Typography
          level="h3"
          sx={{
            alignContent: "center",
            display: "flex",
            gap: "var(--padding-sm)",
          }}
          color="warning"
        >
          <WarningIcon sx={{ width: "1.5rem" }} /> Early Access Version{" "}
          <WarningIcon sx={{ width: "1.5rem" }} />
        </Typography>
        <Typography level="body-md">
          This is an early access version of CrossCode. Expect bugs. Please
          report any issues you find on{" "}
          <Link
            href="#"
            onClick={(e) => {
              e.preventDefault();
              open("https://github.com/nab138/CrossCode/issues");
            }}
          >
            github
          </Link>
          . Check the{" "}
          <Link
            href="#"
            onClick={(e) => {
              e.preventDefault();
              open("https://github.com/nab138/CrossCode/wiki/Troubleshooting");
            }}
          >
            troubleshooting guide
          </Link>{" "}
          for known issues and workarounds.
        </Typography>
      </div>
      <div className="onboarding-buttons">
        <Button
          size="lg"
          disabled={!ready}
          className={!ready ? "disabled-button" : ""}
          onClick={() => {
            if (ready) {
              navigate("/new");
            }
          }}
        >
          Create New
        </Button>
        <Button size="lg" disabled={!ready} onClick={openFolderDialog}>
          Open Project
        </Button>
      </div>

      <Typography
        level={ready ? "body-sm" : "body-md"}
        sx={{
          alignContent: "center",
          display: "flex",
          gap: "var(--padding-xs)",
        }}
        color={ready ? undefined : "danger"}
      >
        {ready ? (
          "Use the cards below to manage your CrossCode setup"
        ) : (
          <>
            <ErrorIcon />
            One or more issues need to be resolved before you can use CrossCode
          </>
        )}
      </Typography>
      <div className="onboarding-cards">
        {isWindows && (
          <Card variant="soft">
            <Typography level="h3">Windows Subsystem for Linux</Typography>
            <Typography level="body-sm">
              Windows Subsystem for Linux (WSL) is required to use CrossCode on
              Windows. Learn more about WSL on{" "}
              <Link
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  open("https://learn.microsoft.com/en-us/windows/wsl/");
                }}
              >
                microsoft.com
              </Link>
              . We recommended WSL 2 and Ubuntu 24.04. Other distributions may
              work, but are not officially supported. CrossCode will use your
              default WSL distribution.
            </Typography>
            <Divider />
            <CardContent>
              <Typography level="body-md">
                {hasWSL === null ? (
                  "Checking for wsl..."
                ) : hasWSL ? (
                  "WSL is already installed on your system!"
                ) : (
                  <>
                    WSL is not installed on your system. CrossCode can attempt
                    to automatically install WSL. If it fails, follow the guide
                    on{" "}
                    <Link
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        openUrl(
                          "https://learn.microsoft.com/en-us/windows/wsl/install"
                        );
                      }}
                    >
                      microsoft.com
                    </Link>
                    .
                  </>
                )}
              </Typography>
              {!hasWSL && <Divider />}
              {!hasWSL && (
                <Button
                  onClick={async () => {
                    try {
                      await invoke("install_wsl");
                    } catch (error) {
                      addToast.error(
                        "Failed to launch WSL installation. Please try installing it manually."
                      );
                    }
                  }}
                >
                  Install WSL
                </Button>
              )}
              {!hasWSL && (
                <Button
                  onClick={async () => {
                    try {
                      await relaunch();
                    } catch (error) {
                      addToast.error(
                        "Failed to relaunch CrossCode. Please try manually."
                      );
                    }
                  }}
                >
                  Relaunch CrossCode (post-installation)
                </Button>
              )}
            </CardContent>
          </Card>
        )}
        <Card variant="soft">
          <Typography level="h3">Swift</Typography>
          <Typography level="body-sm">
            You will need a Swift 6.1 toolchain to use CrossCode. It is
            recommended to install it using swiftly, but you can also install it
            manually.
          </Typography>
          <Divider />
          <CardContent>
            <SwiftMenu />
          </CardContent>
        </Card>
        <Card variant="soft">
          <Typography level="h3">Darwin SDK</Typography>
          <Typography level="body-sm">
            CrossCode requires a special swift SDK to build apps for iOS. It can
            be generated from a copy of Xcode 16 or later. To install it,
            download Xcode.xip using the link below, click the "Install SDK"
            button, then select the downloaded file.
          </Typography>
          <Divider />
          <CardContent>
            <SDKMenu />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
