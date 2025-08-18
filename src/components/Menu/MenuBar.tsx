import Menu from "@mui/joy/Menu";
import List from "@mui/joy/List";
import ListItem from "@mui/joy/ListItem";
import { useCallback, useEffect, useRef, useState } from "react";
import MenuBarButton from "./MenuBarButton";
import MenuGroup from "./MenuGroup";
import {
  Shortcut,
  acceleratorPresssed,
  acceleratorPresssedMonaco,
} from "../../utilities/Shortcut";
import CommandButton from "../CommandButton";
import {
  Construction,
  PhonelinkSetup,
  Refresh,
  CleaningServices,
  Terminal,
  StopCircle,
} from "@mui/icons-material";
import { useParams } from "react-router-dom";
import { Divider, Option, Select } from "@mui/joy";
import { DeviceInfo, useIDE } from "../../utilities/IDEContext";
import { useStore } from "../../utilities/StoreContext";
import { useToast } from "react-toast-plus";
import bar from "./MenuBarDefinition";
import { IStandaloneCodeEditor } from "@codingame/monaco-vscode-api/vscode/vs/editor/standalone/browser/standaloneCodeEditor";

export interface MenuBarProps {
  callbacks: Record<string, () => void>;
  editor: IStandaloneCodeEditor | null;
}
export default function MenuBar({ callbacks, editor }: MenuBarProps) {
  const menus = useRef<Array<HTMLButtonElement>>([]);
  const [menuIndex, setMenuIndex] = useState<null | number>(null);

  const resetMenuIndex = useCallback(() => setMenuIndex(null), []);
  const { path } = useParams<"path">();
  const { devices, selectedToolchain } = useIDE();
  const [anisetteServer] = useStore<string>(
    "apple-id/anisette-server",
    "ani.sidestore.io"
  );
  const { addToast } = useToast();

  useEffect(() => {
    const items: {
      shortcut: Shortcut;
      callback: () => void;
      ignoreShortcutInMonaco: boolean;
    }[] = [];

    for (const menu of bar) {
      for (const group of menu.items) {
        for (const item of group.items) {
          if (item.shortcut) {
            const shortcut = Shortcut.fromString(item.shortcut);
            let callback;
            if (
              "callbackName" in item &&
              typeof item.callbackName === "string"
            ) {
              callback = callbacks[item.callbackName];
            } else if (
              "callback" in item &&
              typeof item.callback === "function"
            ) {
              callback = item.callback;
            } else if (
              "component" in item &&
              "componentId" in item &&
              typeof item.componentId === "string"
            ) {
              // This whole thing needs to be reworked because this is disgusting, too bad I'm lazy!
              callback = () => {
                const element = document.getElementById(
                  item.componentId as string
                );
                if (element) {
                  (element as HTMLButtonElement).click();
                }
              };
            } else {
              callback = () => {};
            }
            items.push({
              shortcut,
              callback,
              ignoreShortcutInMonaco: item.ignoreShortcutInMonaco ?? false,
            });
          }
        }
      }
    }

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (!acceleratorPresssed(event)) return;

      for (const item of items) {
        if (item.shortcut.pressed(event)) {
          event.preventDefault();
          item.callback();
        }
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown);

    const monacoItems = items.filter((item) => !item.ignoreShortcutInMonaco);
    let dispose = editor?.onKeyDown((event) => {
      if (!acceleratorPresssedMonaco(event)) return;

      for (const item of monacoItems) {
        if (item.shortcut.pressedMonaco(event)) {
          event.preventDefault();
          item.callback();
        }
      }
    });

    return () => {
      document.removeEventListener("keydown", handleGlobalKeyDown);
      dispose?.dispose();
    };
  }, [bar, callbacks, editor]);

  const openNextMenu = () => {
    if (typeof menuIndex === "number") {
      if (menuIndex === menus.current.length - 1) {
        setMenuIndex(0);
      } else {
        setMenuIndex(menuIndex + 1);
      }
    }
  };

  const openPreviousMenu = () => {
    if (typeof menuIndex === "number") {
      if (menuIndex === 0) {
        setMenuIndex(menus.current.length - 1);
      } else {
        setMenuIndex(menuIndex - 1);
      }
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowRight") {
      openNextMenu();
    }
    if (event.key === "ArrowLeft") {
      openPreviousMenu();
    }
  };

  const createHandleButtonKeyDown =
    (index: number) => (event: React.KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        if (index === menus.current.length - 1) {
          menus.current[0]?.focus();
        } else {
          menus.current[index + 1]?.focus();
        }
      }
      if (event.key === "ArrowLeft") {
        if (index === 0) {
          menus.current[menus.current.length]?.focus();
        } else {
          menus.current[index - 1]?.focus();
        }
      }
    };

  const [selectedDevice, setSelectedDevice] = useState<DeviceInfo | null>(null);

  useEffect(() => {
    if (devices.length > 0) {
      setSelectedDevice(devices[0]);
    } else {
      setSelectedDevice(null);
    }
  }, [devices]);

  return (
    <List
      size="sm"
      orientation="horizontal"
      aria-label="YCode menu bar"
      role="menubar"
      sx={{
        bgcolor: "background.body",
        width: "100%",
        borderColor: "divider",
        borderBottomWidth: "1px",
        borderBottomStyle: "solid",
        paddingRight: 0,
      }}
    >
      {bar &&
        bar.map((menu, index) => (
          <ListItem key={index}>
            <MenuBarButton
              open={menuIndex === index}
              onOpen={() => {
                setMenuIndex((prevMenuIndex) =>
                  prevMenuIndex === null ? index : null
                );
              }}
              onKeyDown={createHandleButtonKeyDown(1)}
              onMouseEnter={() => {
                if (typeof menuIndex === "number") {
                  setMenuIndex(index);
                }
              }}
              ref={(instance) => {
                menus.current[index] = instance!;
              }}
              menu={
                <Menu
                  keepMounted
                  size="sm"
                  onClose={() => {
                    menus.current[index]?.focus();
                  }}
                >
                  <MenuGroup
                    handleKeyDown={handleKeyDown}
                    resetMenuIndex={resetMenuIndex}
                    groups={menu.items}
                    selectedDevice={selectedDevice}
                    callbacks={callbacks}
                  />
                </Menu>
              }
            >
              {menu.label}
            </MenuBarButton>
          </ListItem>
        ))}
      <CommandButton
        disabled={!selectedDevice}
        tooltip="Start syslog"
        variant="plain"
        command="start_stream_syslog"
        icon={<Terminal />}
        parameters={{
          device: selectedDevice,
        }}
        validate={() => {
          if (!selectedDevice) {
            addToast.error("Please select a device to stream the syslog from");
            return false;
          }
          return true;
        }}
        sx={{ marginLeft: "auto", marginRight: 0 }}
      />
      <CommandButton
        tooltip="Stop syslog"
        variant="plain"
        command="stop_stream_syslog"
        icon={<StopCircle />}
        sx={{ marginRight: 0 }}
      />
      <Divider orientation="vertical" />
      <CommandButton
        variant="plain"
        command="clean_swift"
        icon={<CleaningServices />}
        parameters={{
          folder: path,
          toolchainPath: selectedToolchain?.path ?? "",
        }}
        tooltip="Clean"
        sx={{ marginRight: 0 }}
      />
      <CommandButton
        variant="plain"
        command="build_swift"
        icon={<Construction />}
        parameters={{
          folder: path,
          toolchainPath: selectedToolchain?.path ?? "",
          debug: true,
        }}
        tooltip="Build .ipa"
        sx={{ marginRight: 0 }}
      />
      <Divider orientation="vertical" />
      <div style={{ display: "flex", alignItems: "center" }}>
        <CommandButton
          variant="plain"
          command="refresh_idevice"
          icon={<Refresh />}
          tooltip="Refresh Devices"
          parameters={{}}
          sx={{ marginLeft: 0, marginRight: 0 }}
          clearConsole={false}
        />
        <Select
          size="sm"
          title="Select Device"
          value={selectedDevice?.id.toString() ?? "none"}
          onChange={(_, value) => {
            setSelectedDevice(
              devices.find((d) => d.id.toString() === value) || null
            );
          }}
          placeholder="Select Device..."
        >
          {devices.length < 1 && (
            <Option disabled value="none">
              No devices connected
            </Option>
          )}
          {devices.map((device, index) => (
            <Option key={index} value={device.id.toString()}>
              {device.name}
            </Option>
          ))}
        </Select>
        <CommandButton
          disabled={!selectedDevice}
          tooltip="Build & Install"
          variant="plain"
          command="deploy_swift"
          icon={<PhonelinkSetup />}
          parameters={{
            folder: path,
            anisetteServer,
            device: selectedDevice,
            toolchainPath: selectedToolchain?.path ?? "",
            debug: true,
          }}
          validate={() => {
            if (!selectedDevice) {
              addToast.error("Please select a device to deploy to.");
              return false;
            }
            return true;
          }}
          sx={{ marginRight: 0 }}
        />
      </div>
    </List>
  );
}
