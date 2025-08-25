import { Button, MenuItem } from "@mui/joy";
import { useCommandRunner } from "../utilities/Command";
import { useIDE } from "../utilities/IDEContext";
import { useToast } from "react-toast-plus";

export interface CommandButtonProps {
  command: string;
  parameters?: Record<string, unknown>;
  label?: string;
  tooltip?: string;
  icon?: React.ReactNode;
  variant?: "plain" | "outlined" | "soft" | "solid";
  sx?: React.CSSProperties;
  clearConsole?: boolean;
  validate?: () => boolean;
  after?: () => void;
  disabled?: boolean;
  useMenuItem?: boolean;
  shortcut?: React.ReactNode;
  id?: string;
  size?: "sm" | "md" | "lg";
}

export default function CommandButton({
  command,
  parameters,
  label,
  icon,
  variant,
  tooltip,
  sx = {},
  clearConsole = true,
  validate = () => true,
  after = () => {},
  disabled = false,
  useMenuItem = false,
  size = "md",
  shortcut,
  id,
}: CommandButtonProps) {
  const { isRunningCommand, currentCommand, runCommand, cancelCommand } =
    useCommandRunner();
  const { setConsoleLines } = useIDE();

  const Component: React.ElementType = useMenuItem ? MenuItem : Button;
  const { addToast } = useToast();

  return (
    <Component
      disabled={disabled || (isRunningCommand && currentCommand !== command)}
      loading={
        useMenuItem ? undefined : isRunningCommand && currentCommand === command
      }
      variant={variant}
      size={size}
      sx={
        useMenuItem
          ? {}
          : {
              marginRight: "var(--padding-md)",
              padding: "0 var(--padding-md)",
              ...sx,
            }
      }
      title={tooltip}
      onClick={() => {
        if (!validate()) {
          return;
        }
        if (clearConsole) {
          setConsoleLines([]);
        }
        if (isRunningCommand) {
          if (currentCommand === command) {
            cancelCommand();
          }
          return;
        }
        runCommand(command, parameters)
          .then(after)
          .catch((e) => {
            addToast.error(e);
            console.error(e);
          });
      }}
      id={id}
    >
      <div
        style={{
          display: "flex",
          gap: "var(--padding-xs)",
          alignItems: "center",
        }}
      >
        {icon !== undefined && icon}
        {label != "" && label != undefined && label}
      </div>
      {shortcut !== undefined && " "}
      {shortcut}
    </Component>
  );
}
