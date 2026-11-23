// What a profile is, and the rules for its name, shared by the browser (src/sync, src/ui) and the server (functions/), so both agree on them.
// (docs/profiles-plan.md.) A profile belongs to an account. It is an adult or a kid, and it has its own game.

export const PROFILE_KINDS = ["adult", "kid"] as const;
export type ProfileKind = (typeof PROFILE_KINDS)[number];

export interface Profile {
  id: number;
  name: string;
  kind: ProfileKind;
}

export const MAX_PROFILES = 8; // per account
export const NAME_MIN = 1;
export const NAME_MAX = 20;
export const MAX_PROFILE_ID = 9_999_999_999; // ten digits: the ids a database hands out are far below this

export const isProfileKind = (value: unknown): value is ProfileKind => value === "adult" || value === "kid";

// What both sides do to a name before checking or storing it: composed form (so "é" typed two ways is one name), no spaces at the
// ends, and a run of spaces counted as one.
export const normalizeName = (raw: string): string => raw.normalize("NFC").trim().replace(/ {2,}/g, " ");

// A name that is already normalized: 1 to 20 characters (an emoji counts as one) that are letters, marks, digits, a space, an apostrophe,
// a hyphen or a period. That leaves out control and invisible characters (a zero width space, a right to left override) and emoji.
const NAME_SHAPE = /^[\p{L}\p{M}\p{Nd} '.-]+$/u; // (Nd: decimal digits of any script; not superscripts, fractions or numerals)
export const isValidName = (name: string): boolean => {
  const length = [...name].length;
  return length >= NAME_MIN && length <= NAME_MAX && NAME_SHAPE.test(name);
};

// What both sides say when a name is not allowed.
export const NAME_HELP = `Choose a name of ${NAME_MIN} to ${NAME_MAX} letters, numbers, spaces, apostrophes, hyphens or periods.`;

// The text two names are compared by: the same name in another case is the same name. (SQLite's own NOCASE only folds ASCII.)
export const nameKey = (name: string): string => normalizeName(name).toLowerCase();

// A profile id as it arrives in a query string: digits only, no leading zero, ten digits at most.
export const isProfileIdText = (text: string): boolean => /^[1-9][0-9]{0,9}$/.test(text);

// A profile id as it arrives in a JSON body.
export const isProfileId = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_PROFILE_ID;

// What the server sends for the list of profiles, checked before it is trusted.
export function parseProfile(raw: unknown): Profile | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { id, name, kind } = raw as Partial<Profile>;
  if (!isProfileId(id) || typeof name !== "string" || !isValidName(name) || !isProfileKind(kind)) return null;
  return { id, name, kind };
}

export function parseProfileList(raw: unknown): Profile[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_PROFILES) return null;
  const list: Profile[] = [];
  for (const item of raw) {
    const profile = parseProfile(item);
    if (!profile || list.some((other) => other.id === profile.id)) return null;
    list.push(profile);
  }
  return list;
}
