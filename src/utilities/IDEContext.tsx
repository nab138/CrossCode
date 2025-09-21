// create a context to store a few state values about the system that are checked at startup
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import { emit, listen } from "@tauri-apps/api/event";
import * as dialog from "@tauri-apps/plugin-dialog";
import { useToast } from "react-toast-plus";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Checkbox,
  Input,
  Modal,
  ModalDialog,
  Typography,
} from "@mui/joy";
import { useCommandRunner } from "./Command";
import { StoreContext, useStore } from "./StoreContext";
import { Operation, OperationState, OperationUpdate } from "./operations";
import OperationView from "../components/OperationView";
import { UpdateContext } from "./UpdateContext";
import { isCompatable } from "../components/SwiftMenu";

let isMainWindow = getCurrentWindow().label === "main";

export interface IDEContextType {
  initialized: boolean;
  ready: boolean | null;
  isWindows: boolean;
  hasWSL: boolean;
  hasDarwinSDK: boolean;
  darwinSDKVersion: string;
  hasLimitedRam: boolean;
  toolchains: ListToolchainResponse | null;
  selectedToolchain: Toolchain | null;
  devices: DeviceInfo[];
  openFolderDialog: () => void;
  consoleLines: string[];
  setConsoleLines: React.Dispatch<React.SetStateAction<string[]>>;
  scanToolchains: () => Promise<void>;
  checkSDK: () => Promise<void>;
  locateToolchain: () => Promise<void>;
  startOperation: (
    operation: Operation,
    params: { [key: string]: any }
  ) => Promise<void>;
  setSelectedToolchain: (
    value: Toolchain | ((oldValue: Toolchain | null) => Toolchain | null) | null
  ) => void;
  selectedDevice: DeviceInfo | null;
  setSelectedDevice: React.Dispatch<React.SetStateAction<DeviceInfo | null>>;
  mountDdi: (ask: boolean) => Promise<boolean>;
}

export type DeviceInfo = {
  name: string;
  id: number;
  uuid: string;
};

export type Toolchain = {
  version: string;
  path: string;
  isSwiftly: boolean;
};

type ListToolchainResponseWithSwiftly = {
  swiftlyInstalled: true;
  swiftlyVersion: string;
  toolchains: Toolchain[];
};

type ListToolchainResponseWithoutSwiftly = {
  swiftlyInstalled: false;
  swiftlyVersion: null;
  toolchains: Toolchain[];
};

export type ListToolchainResponse =
  | ListToolchainResponseWithSwiftly
  | ListToolchainResponseWithoutSwiftly;

export const IDEContext = createContext<IDEContextType | null>(null);

let hasCheckedForUpdates = false;

export const IDEProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [isWindows, setIsWindows] = useState<boolean>(false);
  const [hasWSL, setHasWSL] = useState<boolean>(false);
  const [toolchains, setToolchains] = useState<ListToolchainResponse | null>(
    null
  );
  const [hasDarwinSDK, setHasDarwinSDK] = useState<boolean>(false);
  const [darwinSDKVersion, setDarwinSDKVersion] = useState<string>("none");
  const [initialized, setInitialized] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [selectedToolchain, setSelectedToolchain] = useStore<Toolchain | null>(
    "swift/selected-toolchain",
    null
  );

  const [hasLimitedRam, setHasLimitedRam] = useState<boolean>(false);

  const [selectedDevice, setSelectedDevice] = useState<DeviceInfo | null>(null);

  const [ddiOpen, setDdiOpen] = useState(false);
  const [ddiProgress, setDdiProgress] = useState(0);

  const { checkForUpdates } = useContext(UpdateContext);
  const { store, storeInitialized } = useContext(StoreContext);

  const { addToast } = useToast();

  const mountDdi = useCallback(
    async (ask: boolean): Promise<boolean> => {
      if (!selectedDevice) {
        addToast.error("No device selected");
        return false;
      }
      try {
        if (await invoke<boolean>("is_ddi_mounted", { device: selectedDevice }))
          return true;

        if (ask) {
          const result = await dialog.ask(
            `This will download & mount the developer disk image on ${selectedDevice.name}. This is required for debugging apps. Do you want to continue?`,
            {
              title: "Mount Developer Disk Image",
            }
          );
          if (!result) {
            return false;
          }
        }
        setDdiProgress(0);
        setDdiOpen(true);

        await invoke("mount_ddi", { device: selectedDevice });
        setDdiOpen(false);
        return true;
      } catch (error) {
        addToast.error("Failed to mount DDI: " + error);
        console.error("Failed to mount DDI:", error);
        setDdiOpen(false);
        return false;
      }
    },
    [selectedDevice]
  );

  const checkSDK = useCallback(async () => {
    try {
      let result = await invoke<string>("has_darwin_sdk", {
        toolchainPath: selectedToolchain?.path || "",
      });
      setHasDarwinSDK(result != "none");
      setDarwinSDKVersion(result);
    } catch (e) {
      console.error("Failed to check for SDK:", e);
      setHasDarwinSDK(false);
      setDarwinSDKVersion("none");
    }
  }, [selectedToolchain]);

  const scanToolchains = useCallback(() => {
    return new Promise<void>(async (resolve) => {
      let response = await invoke<ListToolchainResponse>(
        "get_swiftly_toolchains"
      );
      if (response) {
        setToolchains(response);
        resolve();
      }
    });
  }, []);

  const locateToolchain = useCallback(async () => {
    let path = await dialog.open({
      directory: true,
      multiple: false,
    });
    if (!path) {
      addToast.error("No path selected");
      return;
    }
    if (!(await invoke("validate_toolchain", { toolchainPath: path }))) {
      if (isWindows) {
        if (path?.startsWith("\\\\wsl.localhost\\")) {
          path = path.replace("\\\\wsl.localhost\\", "\\\\wsl$\\");
        }
        path = await invoke<string>("linux_path", {
          path,
        });
        if (!(await invoke("validate_toolchain", { toolchainPath: path }))) {
          addToast.error("Invalid toolchain path");
          return;
        }
      } else {
        addToast.error("Invalid toolchain path");
        return;
      }
    }
    const info = await invoke<Toolchain>("get_toolchain_info", {
      toolchainPath: path,
      isSwiftly: false,
    }).catch((error) => {
      console.error("Error getting toolchain info:", error);
      addToast.error("Failed to get toolchain info");
      return null;
    });
    if (!info) {
      addToast.error("Invalid toolchain path or version not found");
      return;
    }
    if (info) {
      setSelectedToolchain(info);
    }
  }, [isWindows]);

  useEffect(() => {
    if (!initialized) return setReady(null);
    if (toolchains !== null && isWindows !== null && hasWSL !== null) {
      setReady(
        selectedToolchain !== null &&
          isCompatable(selectedToolchain) &&
          (isWindows ? hasWSL : true) &&
          hasDarwinSDK
      );
    } else {
      setReady(false);
    }
  }, [
    selectedToolchain,
    toolchains,
    hasWSL,
    isWindows,
    hasDarwinSDK,
    initialized,
  ]);

  let startedInitializing = useRef(false);

  useEffect(() => {
    if (startedInitializing.current) return;
    startedInitializing.current = true;
    let initPromises: Promise<void>[] = [];
    initPromises.push(scanToolchains());
    initPromises.push(
      invoke("has_wsl").then((response) => {
        setHasWSL(response as boolean);
      })
    );
    initPromises.push(
      invoke("is_windows").then((response) => {
        setIsWindows(response as boolean);
      })
    );
    initPromises.push(
      invoke<string>("has_darwin_sdk", {
        toolchainPath: selectedToolchain?.path ?? "",
      }).then((response) => {
        setHasDarwinSDK(response != "none");
        setDarwinSDKVersion(response);
      })
    );
    initPromises.push(
      invoke("has_limited_ram").then((response) => {
        setHasLimitedRam(response as boolean);
      })
    );

    Promise.all(initPromises)
      .then(() => {
        setInitialized(true);
      })
      .catch((error) => {
        console.error("Error initializing IDE context: ", error);
        alert("An error occurred while initializing the IDE context: " + error);
      });
  }, []);

  useEffect(() => {
    if (!initialized) return;
    let changeWindows = async () => {
      let splash = await Window.getByLabel("splashscreen");
      let main = await Window.getByLabel("main");
      if (splash && main) {
        splash.close();
        await main.show();
        main.setFocus();
      }
    };
    changeWindows();
  }, [initialized]);

  useEffect(() => {
    if (!store || !storeInitialized || !initialized || !checkForUpdates) return;

    let check = async () => {
      if (hasCheckedForUpdates) return;
      if (
        (await store.has("general/check-updates")) &&
        (await store.get("general/check-updates")) === "manual"
      )
        return;

      hasCheckedForUpdates = true;
      checkForUpdates();
    };

    check();
  }, [initialized, checkForUpdates, store, storeInitialized]);

  const listenerAdded = useRef(false);
  const listener2Added = useRef(false);
  const listener3Added = useRef(false);
  const unlisten = useRef<() => void>(() => {});
  const unlisten2fa = useRef<() => void>(() => {});
  const unlistenAppleid = useRef<() => void>(() => {});

  const [tfaOpen, setTfaOpen] = useState(false);
  const tfaInput = useRef<HTMLInputElement | null>(null);
  const [appleIdOpen, setAppleIdOpen] = useState(false);
  const appleIdInput = useRef<HTMLInputElement | null>(null);
  const applePassInput = useRef<HTMLInputElement | null>(null);
  const saveCredentials = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!listenerAdded.current) {
      (async () => {
        const unlistenFn = await listen("idevices", (event) => {
          let devices = event.payload as DeviceInfo[];
          setDevices(devices);
          if (devices.length === 0) {
            addToast.info("No devices found");
          }
        });
        unlisten.current = unlistenFn;
      })();
      listenerAdded.current = true;
    }
    return () => {
      unlisten.current();
    };
  }, []);

  useEffect(() => {
    if (!listener2Added.current) {
      (async () => {
        const unlistenFn = await listen("2fa-required", async () => {
          if (isMainWindow) {
            setTfaOpen(true);
          } else {
            addToast.info("Please complete 2FA in the main window.");
          }
        });
        unlisten2fa.current = unlistenFn;
      })();
      listener2Added.current = true;
    }
    return () => {
      unlisten2fa.current();
    };
  }, []);

  useEffect(() => {
    if (!listener3Added.current) {
      (async () => {
        const unlistenFn = await listen("apple-id-required", () => {
          if (isMainWindow) {
            setAppleIdOpen(true);
          } else {
            addToast.info("Please login to your Apple ID in the main window.");
          }
        });
        unlistenAppleid.current = unlistenFn;
      })();
      listener3Added.current = true;
    }
    return () => {
      unlistenAppleid.current();
    };
  }, []);

  const ddiListenerAdded = useRef(false);
  const ddiUnlisten = useRef<() => void>(() => {});

  useEffect(() => {
    if (!ddiListenerAdded.current) {
      (async () => {
        const unlistenFn = await listen("ddi-mount-progress", (event) => {
          const progress = event.payload as number;
          setDdiProgress(progress);
        });
        ddiUnlisten.current = unlistenFn;
      })();
      ddiListenerAdded.current = true;
    }
    return () => {
      ddiUnlisten.current();
    };
  }, [setDdiProgress]);

  const navigate = useNavigate();

  const openFolderDialog = useCallback(async () => {
    const path = await dialog.open({
      directory: true,
      multiple: false,
    });
    if (path) {
      navigate("/ide/" + encodeURIComponent(path));
    }
  }, []);

  const { cancelCommand } = useCommandRunner();

  const [operationState, setOperationState] = useState<OperationState | null>(
    null
  );

  const startOperation = useCallback(
    async (
      operation: Operation,
      params: { [key: string]: any }
    ): Promise<void> => {
      setOperationState({
        current: operation,
        started: [],
        failed: [],
        completed: [],
      });
      return new Promise<void>(async (resolve, reject) => {
        const unlistenFn = await listen<OperationUpdate>(
          "operation_" + operation.id,
          (event) => {
            setOperationState((old) => {
              if (old == null) return null;
              if (event.payload.updateType === "started") {
                return {
                  ...old,
                  started: [...old.started, event.payload.stepId],
                };
              } else if (event.payload.updateType === "finished") {
                return {
                  ...old,
                  completed: [...old.completed, event.payload.stepId],
                };
              } else if (event.payload.updateType === "failed") {
                return {
                  ...old,
                  failed: [
                    ...old.failed,
                    {
                      stepId: event.payload.stepId,
                      extraDetails: event.payload.extraDetails,
                    },
                  ],
                };
              }
              return old;
            });
          }
        );
        try {
          await invoke(operation.id + "_operation", params);
          unlistenFn();
          resolve();
        } catch (e) {
          unlistenFn();
          reject(e);
        }
      });
    },
    [setOperationState]
  );

  const contextValue = useMemo(
    () => ({
      isWindows,
      hasWSL,
      toolchains,
      initialized,
      devices,
      openFolderDialog,
      consoleLines,
      setConsoleLines,
      selectedToolchain,
      scanToolchains,
      locateToolchain,
      setSelectedToolchain,
      hasDarwinSDK,
      checkSDK,
      startOperation,
      hasLimitedRam,
      selectedDevice,
      setSelectedDevice,
      mountDdi,
      ready,
      darwinSDKVersion,
    }),
    [
      isWindows,
      hasWSL,
      toolchains,
      initialized,
      devices,
      openFolderDialog,
      consoleLines,
      setConsoleLines,
      selectedToolchain,
      scanToolchains,
      locateToolchain,
      setSelectedToolchain,
      hasDarwinSDK,
      checkSDK,
      startOperation,
      hasLimitedRam,
      selectedDevice,
      setSelectedDevice,
      mountDdi,
      ready,
      darwinSDKVersion,
    ]
  );

  return (
    <IDEContext.Provider value={contextValue}>
      {children}
      <Modal
        open={tfaOpen}
        onClose={() => {
          if (!tfaInput.current?.value) {
            addToast.error("Please enter a 2FA code");
            return;
          }
          emit("2fa-recieved", tfaInput.current?.value || "");
          setTfaOpen(false);
        }}
      >
        <ModalDialog>
          <Typography level="body-md">
            A two-factor authentication code has been sent, please enter it
            below.
          </Typography>
          <form
            onSubmit={() => {
              if (!tfaInput.current?.value) {
                addToast.error("Please enter a 2FA code");
                return;
              }
              emit("2fa-recieved", tfaInput.current?.value || "");
              setTfaOpen(false);
              tfaInput.current!.value = ""; // Clear the input after submission
              return false; // Prevent form submission
            }}
          >
            <Input type="number" slotProps={{ input: { ref: tfaInput } }} />
            <Button
              variant="soft"
              sx={{
                margin: "10px 0",
                width: "100%",
              }}
              type="submit"
            >
              Submit
            </Button>
          </form>
        </ModalDialog>
      </Modal>
      <Modal
        open={appleIdOpen}
        onClose={() => {
          setAppleIdOpen(false);
          appleIdInput.current!.value = "";
          applePassInput.current!.value = "";
          emit("login-cancelled");
          cancelCommand();
        }}
      >
        <ModalDialog>
          <Typography level="body-md">
            Login with your apple account to continue
          </Typography>
          <Typography level="body-xs">
            Your credentials will only be sent to apple. In general, never trust
            a third-party app with your Apple ID. We recommend using a burner
            account with CrossCode and other sideloaders. (CrossCode is not very
            secure)
          </Typography>
          <form
            onSubmit={() => {
              if (
                appleIdInput.current?.value &&
                applePassInput.current?.value
              ) {
                setAppleIdOpen(false);
                emit("apple-id-recieved", {
                  appleId: appleIdInput.current.value,
                  applePass: applePassInput.current.value,
                  saveCredentials: saveCredentials.current?.checked || false,
                });
              } else {
                addToast.error("Please enter your Apple ID and password");
              }
              return false;
            }}
          >
            <Input
              type="text"
              slotProps={{ input: { ref: appleIdInput } }}
              placeholder="Apple ID"
              sx={{ marginBottom: "var(--padding-sm)" }}
            />
            <Input
              type="password"
              slotProps={{ input: { ref: applePassInput } }}
              placeholder="Password"
            />
            <Checkbox
              slotProps={{ input: { ref: saveCredentials } }}
              sx={{ marginTop: "var(--padding-sm)", color: "grey" }}
              label="Remember credentials"
              size="sm"
            />
            <Button
              variant="soft"
              sx={{
                margin: "var(--padding-md) 0",
                width: "100%",
                marginBottom: "0",
              }}
              type="submit"
            >
              Submit
            </Button>
            <Button
              variant="soft"
              sx={{
                margin: "var(--padding-md) 0",
                width: "100%",
                marginBottom: "0",
              }}
              onClick={() => {
                setAppleIdOpen(false);
                appleIdInput.current!.value = "";
                applePassInput.current!.value = "";
                emit("login-cancelled");
                cancelCommand();
              }}
              color="neutral"
            >
              Cancel
            </Button>
          </form>
        </ModalDialog>
      </Modal>
      <Modal open={ddiOpen}>
        <ModalDialog>
          <Typography level="h4">Mounting Developer Disk Image...</Typography>
          <Typography level="body-md">
            This may take a few minutes. Please do not disconnect your device or
            close the app.
          </Typography>
          <Typography level="body-sm">
            Progress: {ddiProgress.toFixed(2)}%
          </Typography>
        </ModalDialog>
      </Modal>
      {operationState && (
        <OperationView
          operationState={operationState}
          closeMenu={() => {
            setOperationState(null);
          }}
        />
      )}
    </IDEContext.Provider>
  );
};

export const useIDE = () => {
  const context = React.useContext(IDEContext);
  if (!context) {
    throw new Error("useIDEContext must be used within an IDEContextProvider");
  }
  return context;
};
