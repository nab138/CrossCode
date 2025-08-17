import { List, ListDivider, ListItem, MenuItem, Typography } from "@mui/joy";

import { Fragment } from "react/jsx-runtime";
import { DeviceInfo } from "../../utilities/IDEContext";

type BaseMenuItem = {
  name: string;
  shortcut?: string;
  ignoreShortcutInMonaco?: boolean;
};

export type MenuItem = BaseMenuItem &
  (
    | { callback: () => void }
    | { callbackName: string }
    | {
        component: React.FC<{
          shortcut?: React.ReactNode;
          selectedDevice?: DeviceInfo | null;
        }>;
        componentId: string;
      }
  );

type MenuGroup = {
  label: string;
  items: MenuItem[];
};

export type MenuBarData = {
  label: string;
  items: MenuGroup[];
}[];

export interface MenuGroupProps {
  groups: MenuGroup[];
  handleKeyDown: (event: React.KeyboardEvent) => void;
  resetMenuIndex: () => void;
  callbacks: Record<string, () => void>;
  selectedDevice: DeviceInfo | null;
}

const renderShortcut = (text: string) => (
  <Typography level="body-sm" textColor="text.tertiary" ml="auto">
    {text}
  </Typography>
);

const MenuGroup: React.FC<MenuGroupProps> = ({
  groups,
  handleKeyDown,
  callbacks,
  resetMenuIndex,
  selectedDevice,
}) => {
  return (
    <>
      {groups.map((group, groupIndex) => (
        <Fragment key={groupIndex}>
          <ListItem nested>
            <List aria-label={group.label}>
              {group.items.map((item, itemIndex) => {
                if ("component" in item) {
                  return (
                    <span key={itemIndex}>
                      {item.component({
                        selectedDevice,
                        shortcut: item.shortcut
                          ? renderShortcut(item.shortcut)
                          : undefined,
                      })}
                    </span>
                  );
                }
                return (
                  <MenuItem
                    key={itemIndex}
                    onClick={() => {
                      resetMenuIndex();
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
                      } else {
                        callback = () => {};
                      }
                      callback();
                    }}
                    onKeyDown={handleKeyDown}
                  >
                    {item.name} {item.shortcut && renderShortcut(item.shortcut)}
                  </MenuItem>
                );
              })}
            </List>
          </ListItem>
          {groupIndex < groups.length - 1 && <ListDivider />}
        </Fragment>
      ))}
    </>
  );
};

export default MenuGroup;
