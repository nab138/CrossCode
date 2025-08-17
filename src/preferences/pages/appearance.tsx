import { useContext, useState } from "react";
import { createPreferencePage, createItems } from "../helpers";
import { setTheme } from "@tauri-apps/api/app";
import { StoreContext, useStore } from "../../utilities/StoreContext";
import {
  FormControl,
  Select,
  useColorScheme,
  Option,
  Typography,
} from "@mui/joy";

const ThemeSelector = () => {
  const { store } = useContext(StoreContext);
  const storeExists = store !== null && store !== undefined;
  const storeKey = `appearance/theme`.toLowerCase();
  const [value, setValue] = useStore(storeKey, "light");
  const [error, setError] = useState<string | null>(null);
  const { setMode } = useColorScheme();

  const handleChange = async (newValue: any) => {
    setValue(newValue);
    try {
      await setTheme(newValue as "light" | "dark");
      setMode(newValue as "light" | "dark");
    } catch (err) {
      console.error(`Error in onChange for theme:`, err);
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  };

  return (
    <FormControl className="prefs-setting" error={!!error}>
      <div className="prefs-setting-row">
        <div className="prefs-label">Theme: </div>
        <div className="prefs-input">
          <Select
            value={value}
            size="sm"
            disabled={!storeExists}
            onChange={(_, newValue) => handleChange(newValue)}
          >
            <Option value={"light"}>Light</Option>
            <Option value={"dark"}>Dark</Option>
          </Select>
        </div>
      </div>

      {error && (
        <Typography level="body-xs" color="danger">
          {error}
        </Typography>
      )}
    </FormControl>
  );
};

export const appearancePage = createPreferencePage(
  "appearance",
  "Appearance",
  [createItems.custom("theme", "Theme", ThemeSelector)],
  {
    description: "Customize the look and feel of the application",
    category: "general",
  }
);
