export interface PreferenceItem {
  id: string;
  name: string;
  description?: string;
  type:
    | "text"
    | "select"
    | "checkbox"
    | "button"
    | "info"
    | "number"
    | "custom";
  options?: Array<{ label: string; value: string }>;
  defaultValue?: any;
  onChange?: (value: any) => void | Promise<void>;
  validation?: (value: any) => string | null;
  customComponent?: React.ComponentType;
}

export interface PreferencePage {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  category?: string;
  items?: PreferenceItem[];
  customComponent?: React.ComponentType;
  onLoad?: () => void | Promise<void>;
  onSave?: () => void | Promise<void>;
}

export interface PreferenceCategory {
  id: string;
  name: string;
  pages: PreferencePage[];
}
