import {
  Button,
  Input,
  Option,
  Select,
  Typography,
  FormControl,
  Checkbox,
} from "@mui/joy";
import { PreferenceItem } from "./types";
import { useStore } from "../utilities/StoreContext";
import { useEffect, useState } from "react";

export interface PreferenceItemRendererProps {
  item: PreferenceItem;
  storeExists: boolean;
  pageName: string;
}

export default function PreferenceItemRenderer({
  item,
  storeExists,
  pageName,
}: PreferenceItemRendererProps) {
  const storeKey = `${pageName}/${item.id}`.toLowerCase();
  const [value, setValue] = useStore(storeKey, item.defaultValue || "");
  const [error, setError] = useState<string | null>(null);

  if (item.type === "info" && typeof item.defaultValue === "function") {
    const [info, setInfo] = useState("");

    useEffect(() => {
      const fetchInfo = async () => {
        const result = await item.defaultValue();
        setInfo(result);
      };
      fetchInfo();
    }, [item.defaultValue]);

    return (
      <FormControl className="prefs-setting">
        <div className="prefs-setting-row">
          <div className="prefs-label">{item.name}: </div>
          <Typography
            level="body-sm"
            sx={{ color: "var(--joy-palette-neutral-500)" }}
          >
            {info}
          </Typography>
        </div>
        {item.description && (
          <Typography
            level="body-xs"
            sx={{ color: "var(--joy-palette-neutral-400)" }}
          >
            {item.description}
          </Typography>
        )}
      </FormControl>
    );
  }

  if (item.type === "custom" && item.customComponent) {
    const CustomComponent = item.customComponent;
    return <CustomComponent />;
  }

  const handleChange = async (newValue: any) => {
    if (item.validation) {
      const validationError = item.validation(newValue);
      setError(validationError);
      if (validationError) return;
    }

    setValue(newValue);
    if (item.onChange) {
      try {
        await item.onChange(newValue);
      } catch (err) {
        console.error(`Error in onChange for ${item.name}:`, err);
        setError(err instanceof Error ? err.message : "An error occurred");
      }
    }
  };

  return (
    <FormControl className="prefs-setting" error={!!error}>
      <div className="prefs-setting-row">
        {item.type !== "button" && (
          <div className="prefs-label">{item.name}</div>
        )}

        <div className="prefs-input">
          {item.type === "text" && (
            <Input
              type="text"
              disabled={!storeExists}
              value={value}
              onChange={(e) => handleChange(e.target.value)}
            />
          )}

          {item.type === "number" && (
            <Input
              type="number"
              disabled={!storeExists}
              value={value}
              onChange={(e) => handleChange(Number(e.target.value))}
            />
          )}

          {item.type === "select" && (
            <Select
              value={value}
              size="sm"
              disabled={!storeExists}
              onChange={(_, newValue) => handleChange(newValue)}
            >
              {item.options?.map((option) => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          )}

          {item.type === "checkbox" && (
            <Checkbox
              checked={value === true || value === "true"}
              disabled={!storeExists}
              onChange={(e) => handleChange(e.target.checked)}
            />
          )}

          {item.type === "button" && (
            <Button
              variant={item.variant || "soft"}
              color={item.color || "primary"}
              disabled={!storeExists}
              onClick={() => handleChange("")}
            >
              {item.name}
            </Button>
          )}

          {item.type === "info" && (
            <Typography
              level="body-sm"
              sx={{ color: "var(--joy-palette-neutral-500)" }}
            >
              {value}
            </Typography>
          )}
        </div>
      </div>

      {error && (
        <Typography level="body-xs" color="danger">
          {error}
        </Typography>
      )}

      {item.description && !error && (
        <Typography
          level="body-xs"
          sx={{ color: "var(--joy-palette-neutral-400)" }}
        >
          {item.description}
        </Typography>
      )}
    </FormControl>
  );
}
