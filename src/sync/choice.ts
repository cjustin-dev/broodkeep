// Which profile was picked in this session. Kept in sessionStorage: it survives a reload (including the one that switching makes) and
// is gone when the app is closed, so a shared tablet asks "who is playing?" at every new start. Every call is guarded: a blocked or
// private window throws, and then the picker is not offered (sync/roster.ts decideStart) and the first profile plays.
import { isProfileIdText } from "./profiles";

const KEY = "bk-profile";

export function readChoice(): number | null {
  try {
    const text = sessionStorage.getItem(KEY);
    return text !== null && isProfileIdText(text) ? Number(text) : null;
  } catch {
    return null;
  }
}

// null forgets the choice. Answers whether the choice could be kept.
export function writeChoice(id: number | null): boolean {
  try {
    if (id === null) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, String(id));
    return true;
  } catch {
    return false;
  }
}

// True when a choice can be kept in this window.
export function canRemember(): boolean {
  try {
    sessionStorage.setItem(`${KEY}-probe`, "1");
    sessionStorage.removeItem(`${KEY}-probe`);
    return true;
  } catch {
    return false;
  }
}
