import { Mutex } from "async-mutex";
import { invoke } from "@tauri-apps/api/core";
import { useState, createContext, useContext } from "react";

const commandRunnerMutex = new Mutex();

// Create a context for sharing command state
const CommandContext = createContext<{
  isRunningCommand: boolean;
  currentCommand: string | null;
  setIsRunningCommand: React.Dispatch<React.SetStateAction<boolean>>;
  setCurrentCommand: React.Dispatch<React.SetStateAction<string | null>>;
} | null>(null);

export function CommandProvider({ children }: { children: React.ReactNode }) {
  const [isRunningCommand, setIsRunningCommand] = useState(false);
  const [currentCommand, setCurrentCommand] = useState<string | null>(null);

  return (
    <CommandContext.Provider
      value={{
        isRunningCommand,
        currentCommand,
        setIsRunningCommand,
        setCurrentCommand,
      }}
    >
      {children}
    </CommandContext.Provider>
  );
}

// Modified hook that returns command functions with the context baked in
export function useCommandRunner() {
  const context = useContext(CommandContext);
  if (!context) {
    throw new Error("useCommandRunner must be used within a CommandProvider");
  }

  const {
    isRunningCommand,
    currentCommand,
    setIsRunningCommand,
    setCurrentCommand,
  } = context;

  // Define the run command function inside the hook
  const runCommand = (
    command: string,
    parameters?: Record<string, unknown>
  ) => {
    return new Promise<any>(async (resolve) => {
      const release = await commandRunnerMutex.acquire();
      setIsRunningCommand(true);
      setCurrentCommand(command);
      try {
        let res = await invoke(command, parameters);
        resolve(res as any);
      } finally {
        release();
        setIsRunningCommand(false);
        setCurrentCommand(null);
      }
    });
  };

  // Define the cancel command function inside the hook
  const cancelCommand = async () => {
    try {
      commandRunnerMutex.cancel();
      commandRunnerMutex.release();
    } finally {
      setIsRunningCommand(true);
      setCurrentCommand(null);
      // try {
      //   await invoke("cancel_command");
      // } finally {
      setIsRunningCommand(false);
    }
    //}
  };

  return {
    isRunningCommand,
    currentCommand,
    runCommand,
    cancelCommand,
  };
}
