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
  const navigate = useNavigate();

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

  return (
    <div className="onboarding">
      <div className="onboarding-header">
        <img src={logo} alt="YCode Logo" className="onboarding-logo" />
        <div>
          <Typography level="h1">Welcome to YCode!</Typography>
          <Typography level="body-sm">
            IDE for iOS Development on Windows and Linux
          </Typography>
        </div>
      </div>
      <div>
        <Typography level="h3" className="onboarding-version" color="warning">
          ⚠️ Early Access Version ⚠️
        </Typography>
        <Typography level="body-md">
          This is an early access version of YCode. Expect bugs. Please report
          any issues you find on{" "}
          <Link
            href="#"
            onClick={(e) => {
              e.preventDefault();
              open("https://github.com/nab138/ycode/issues");
            }}
          >
            github
          </Link>
          .
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

      <Typography level="body-sm">
        {ready
          ? "Use the cards below to manage your YCode setup"
          : "Use the cards below to get setup before using YCode!"}
      </Typography>
      <div className="onboarding-cards">
        {isWindows && (
          <Card variant="soft">
            <Typography level="h3">Windows Subsystem for Linux</Typography>
            <Typography level="body-sm">
              Windows Subsystem for Linux (WSL) is required to use YCode on
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
              . We recommended installing WSL 2 and Ubuntu. Other distributions
              may work, but are not officially supported. YCode will use your
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
                    WSL is not installed on your system. Please follow the guide
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
            </CardContent>
          </Card>
        )}
        <Card variant="soft">
          <Typography level="h3">Swift</Typography>
          <Typography level="body-sm">
            You will need a Swift 6.1 toolchain to use YCode. It is recommended
            to install it using swiftly, but you can also install it manually.
          </Typography>
          <Divider />
          <CardContent>
            <SwiftMenu />
          </CardContent>
        </Card>
        <Card variant="soft">
          <Typography level="h3">Darwin SDK</Typography>
          <Typography level="body-sm">
            YCode requires a special swift SDK to build apps for iOS. It can be
            generated from a copy of Xcode 16 or later. To install it, download
            Xcode.xip using the link below, click the "Install SDK" button, then
            select the downloaded file.
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
