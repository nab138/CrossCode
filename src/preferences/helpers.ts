import { PreferencePage, PreferenceItem } from "./types";
import { preferenceRegistry } from "./registry";

export function createPreferencePage(
  id: string,
  name: string,
  items: PreferenceItem[],
  options?: {
    description?: string;
    category?: string;
    onLoad?: () => void | Promise<void>;
    onSave?: () => void | Promise<void>;
  }
): PreferencePage {
  const page: PreferencePage = {
    id,
    name,
    items,
    description: options?.description,
    category: options?.category,
    onLoad: options?.onLoad,
    onSave: options?.onSave,
  };

  preferenceRegistry.registerPage(page);
  return page;
}

export function createCustomPreferencePage(
  id: string,
  name: string,
  component: React.ComponentType,
  options?: {
    description?: string;
    category?: string;
    onLoad?: () => void | Promise<void>;
    onSave?: () => void | Promise<void>;
  }
): PreferencePage {
  const page: PreferencePage = {
    id,
    name,
    customComponent: component,
    description: options?.description,
    category: options?.category,
    onLoad: options?.onLoad,
    onSave: options?.onSave,
  };

  preferenceRegistry.registerPage(page);
  return page;
}

export const createItems = {
  text: (
    id: string,
    name: string,
    description?: string,
    defaultValue?: string,
    onChange?: (value: string) => void | Promise<void>
  ): PreferenceItem => ({
    id,
    name,
    description,
    type: "text",
    defaultValue,
    onChange,
  }),

  select: (
    id: string,
    name: string,
    options: Array<{ label: string; value: string, default?: string }>,
    description?: string,
    defaultValue?: string,
    onChange?: (value: string) => void | Promise<void>
  ): PreferenceItem => ({
    id,
    name,
    description,
    type: "select",
    options,
    defaultValue,
    onChange,
  }),

  checkbox: (
    id: string,
    name: string,
    description?: string,
    defaultValue?: boolean,
    onChange?: (value: boolean) => void | Promise<void>
  ): PreferenceItem => ({
    id,
    name,
    description,
    type: "checkbox",
    defaultValue,
    onChange,
  }),

  button: (
    id: string,
    name: string,
    description: string,
    color: "primary" | "danger" | "neutral" | "success" | "warning" = "primary",
    variant: "solid" | "outlined" | "soft" | "plain" = "soft",
    onClick: () => void | Promise<void>
  ): PreferenceItem => ({
    id,
    name,
    description,
    type: "button",
    onChange: onClick,
    color,
    variant,
  }),

  number: (
    id: string,
    name: string,
    description?: string,
    defaultValue?: number,
    onChange?: (value: number) => void | Promise<void>
  ): PreferenceItem => ({
    id,
    name,
    description,
    type: "number",
    defaultValue,
    onChange,
  }),

  custom: (
    id: string,
    name: string,
    customComponent: React.ComponentType
  ): PreferenceItem => ({
    name,
    id,
    type: "custom",
    customComponent,
  }),
};
