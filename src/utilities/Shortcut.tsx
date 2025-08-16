import { IKeyboardEvent, KeyCode } from "monaco-editor";

export type Accelerator = "ctrl" | "alt" | "shift" | "super";

export class Shortcut {
  accelerators: Accelerator[];
  key: string;
  monacoKey: KeyCode;

  ctrl = false;
  alt = false;
  shift = false;
  super = false;

  constructor(accelerator: Accelerator[], key: string) {
    this.accelerators = accelerator;
    for (const acc of accelerator) {
      if (acc === "ctrl") this.ctrl = true;
      if (acc === "alt") this.alt = true;
      if (acc === "shift") this.shift = true;
      if (acc === "super") this.super = true;
    }
    this.key = key;
    this.monacoKey =
      KeyCode[`Key${key.toUpperCase()}` as keyof typeof KeyCode] ||
      KeyCode[key.toUpperCase() as keyof typeof KeyCode];
  }

  static fromString(shortcut: string): Shortcut {
    if (!shortcut) throw new Error("Shortcut string is empty");
    if (!shortcut.includes("+")) throw new Error("Shortcut string is invalid");
    const [key, ...accelerators] = shortcut.toLowerCase().split("+").reverse();
    if (accelerators.length === 0)
      throw new Error("Shortcut string is invalid");
    return new Shortcut(accelerators as Accelerator[], key.toLowerCase());
  }

  toString(): string {
    return [...this.accelerators, this.key.toUpperCase()].join("+");
  }

  pressed(event: KeyboardEvent): boolean {
    return (
      this.ctrl === event.ctrlKey &&
      this.alt === event.altKey &&
      this.shift === event.shiftKey &&
      this.super === event.metaKey &&
      event.key.toLowerCase() === this.key
    );
  }

  pressedMonaco(event: IKeyboardEvent): boolean {
    return (
      this.ctrl === event.ctrlKey &&
      this.alt === event.altKey &&
      this.shift === event.shiftKey &&
      this.super === event.metaKey &&
      event.keyCode === this.monacoKey
    );
  }
}

export function acceleratorPresssed(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.altKey || event.shiftKey || event.metaKey;
}

export function acceleratorPresssedMonaco(event: IKeyboardEvent): boolean {
  return event.ctrlKey || event.altKey || event.shiftKey || event.metaKey;
}
