import logo from "../assets/logo.png";
import { Link, List, ListItem, Typography } from "@mui/joy";
import "./Onboarding.css";
import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";

export default () => {
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    const fetchVersion = async () => {
      const version = await getVersion();
      setVersion(version);
    };
    fetchVersion();
  }, []);

  return (
    <div className="onboarding">
      {version && (
        <>
          <div className="onboarding-header">
            <img src={logo} alt="CrossCode Logo" className="onboarding-logo" />
            <div>
              <Typography level="h1">CrossCode</Typography>
              <Typography level="body-md">
                Version {version}{" "}
                <span style={{ opacity: 0.7 }}>(Early Access)</span>
              </Typography>
            </div>
          </div>
          <List marker="disc">
            <ListItem>
              <Typography level="body-md">MIT License</Typography>
            </ListItem>
            <ListItem>
              <Typography level="body-md">
                GNU cpio 2.14 is included under GPLv3, with its copyright
                holders.{" "}
                <Link
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    openUrl("https://ftp.gnu.org/gnu/cpio/cpio-2.14.tar.gz");
                  }}
                >
                  Source
                </Link>
              </Typography>
            </ListItem>
          </List>
        </>
      )}
    </div>
  );
};
