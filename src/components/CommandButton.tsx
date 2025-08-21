import { Button, MenuItem } from "@mui/joy";
import { useCommandRunner } from "../utilities/Command";
import { useIDE } from "../utilities/IDEContext";

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
  disabled?: boolean;
  useMenuItem?: boolean;
  shortcut?: React.ReactNode;
  id?: string;
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
  disabled = false,
  useMenuItem = false,
  shortcut,
  id,
}: CommandButtonProps) {
  const { isRunningCommand, currentCommand, runCommand, cancelCommand } =
    useCommandRunner();
  const { setConsoleLines } = useIDE();

  const Component: React.ElementType = useMenuItem ? MenuItem : Button;

  return (
    <Component
      disabled={disabled || (isRunningCommand && currentCommand !== command)}
      loading={
        useMenuItem ? undefined : isRunningCommand && currentCommand === command
      }
      variant={variant}
      size="md"
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
        runCommand(command, parameters);
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
