export type ComposerPreferences = {
  useMarkdown: boolean;
  sound: string;
  level: "active" | "timeSensitive" | "passive" | "critical";
  volume: string;
  autoCopy: boolean;
  isArchive: boolean;
  showAdvanced: boolean;
  iconLibrary: string[];
  selectedIcon: string;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const STORAGE_KEY = "bark-console-composer-preferences-v1";

const SOUND_VALUES = new Set([
  "",
  "alarm",
  "anticipate",
  "bell",
  "birdsong",
  "calypso",
  "chime",
  "electronic",
  "glass",
  "minuet",
  "multiwayinvitation",
  "newmail",
  "newsflash",
  "noir",
  "paymentsuccess",
  "shake",
  "sherwoodforest",
  "silence",
]);

const LEVEL_VALUES = new Set<ComposerPreferences["level"]>([
  "active",
  "timeSensitive",
  "passive",
  "critical",
]);

export const DEFAULT_COMPOSER_PREFERENCES: ComposerPreferences = {
  useMarkdown: false,
  sound: "",
  level: "active",
  volume: "5",
  autoCopy: false,
  isArchive: true,
  showAdvanced: false,
  iconLibrary: [],
  selectedIcon: "",
};

function booleanOrDefault(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function sanitizeIconLibrary(value: unknown): string[] {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter(isHttpUrl)))
    : [];
}

export function sanitizeSelectedIcon(
  value: unknown,
  iconLibrary: string[],
): string {
  return typeof value === "string" && iconLibrary.includes(value) ? value : "";
}

export function readComposerPreferences(
  storage: StorageLike,
): ComposerPreferences {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_COMPOSER_PREFERENCES;

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.version !== 1) return DEFAULT_COMPOSER_PREFERENCES;

    const level = LEVEL_VALUES.has(
      parsed.level as ComposerPreferences["level"],
    )
      ? (parsed.level as ComposerPreferences["level"])
      : DEFAULT_COMPOSER_PREFERENCES.level;
    const iconLibrary = sanitizeIconLibrary(parsed.iconLibrary);
    const selectedIcon = sanitizeSelectedIcon(
      parsed.selectedIcon,
      iconLibrary,
    );

    return {
      useMarkdown: booleanOrDefault(
        parsed.useMarkdown,
        DEFAULT_COMPOSER_PREFERENCES.useMarkdown,
      ),
      sound:
        typeof parsed.sound === "string" && SOUND_VALUES.has(parsed.sound)
          ? parsed.sound
          : DEFAULT_COMPOSER_PREFERENCES.sound,
      level,
      volume:
        typeof parsed.volume === "string" &&
        /^(?:[0-9]|10)$/.test(parsed.volume)
          ? parsed.volume
          : DEFAULT_COMPOSER_PREFERENCES.volume,
      autoCopy: booleanOrDefault(
        parsed.autoCopy,
        DEFAULT_COMPOSER_PREFERENCES.autoCopy,
      ),
      isArchive: booleanOrDefault(
        parsed.isArchive,
        DEFAULT_COMPOSER_PREFERENCES.isArchive,
      ),
      showAdvanced: booleanOrDefault(
        parsed.showAdvanced,
        DEFAULT_COMPOSER_PREFERENCES.showAdvanced,
      ),
      iconLibrary,
      selectedIcon,
    };
  } catch {
    return DEFAULT_COMPOSER_PREFERENCES;
  }
}

export function writeComposerPreferences(
  storage: StorageLike,
  preferences: ComposerPreferences,
) {
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: 1, ...preferences }),
  );
}

export function clearComposerPreferences(storage: StorageLike) {
  storage.removeItem(STORAGE_KEY);
}
