import assert from "node:assert/strict";
import test from "node:test";
import {
  clearComposerPreferences,
  DEFAULT_COMPOSER_PREFERENCES,
  readComposerPreferences,
  sanitizeIconLibrary,
  sanitizeSelectedIcon,
  writeComposerPreferences,
} from "../app/composer-preferences.ts";

function memoryStorage(initialValue = null) {
  let value = initialValue;
  return {
    getItem() {
      return value;
    },
    setItem(_key, nextValue) {
      value = nextValue;
    },
    removeItem() {
      value = null;
    },
  };
}

test("round-trips every persistent composer preference", () => {
  const storage = memoryStorage();
  const preferences = {
    useMarkdown: true,
    sound: "alarm",
    level: "critical",
    volume: "8",
    autoCopy: true,
    isArchive: false,
    showAdvanced: true,
    iconLibrary: [
      "https://file.space4.ink/759676328_n.jpg",
      "https://example.com/alert.png",
    ],
    selectedIcon: "https://file.space4.ink/759676328_n.jpg",
  };

  writeComposerPreferences(storage, preferences);

  assert.deepEqual(readComposerPreferences(storage), preferences);
});

test("falls back safely when stored composer preferences are invalid", () => {
  const storage = memoryStorage(
    JSON.stringify({
      version: 1,
      useMarkdown: "yes",
      sound: 42,
      level: "urgent",
      volume: "99",
      autoCopy: null,
      isArchive: "false",
      showAdvanced: [],
      iconLibrary: ["javascript:alert(1)", 42],
      selectedIcon: "https://example.com/missing.png",
    }),
  );

  assert.deepEqual(
    readComposerPreferences(storage),
    DEFAULT_COMPOSER_PREFERENCES,
  );
});

test("restores an empty icon selection and removes invalid or duplicate icons", () => {
  const storage = memoryStorage(
    JSON.stringify({
      version: 1,
      iconLibrary: [
        "https://file.space4.ink/759676328_n.jpg",
        "https://file.space4.ink/759676328_n.jpg",
        "data:image/png;base64,invalid",
      ],
      selectedIcon: "",
    }),
  );

  const preferences = readComposerPreferences(storage);

  assert.deepEqual(preferences.iconLibrary, [
    "https://file.space4.ink/759676328_n.jpg",
  ]);
  assert.equal(preferences.selectedIcon, "");
});

test("sanitizes icon URLs restored from a configuration backup", () => {
  const icons = sanitizeIconLibrary([
    "https://file.space4.ink/759676328_n.jpg",
    "https://file.space4.ink/759676328_n.jpg",
    "javascript:alert(1)",
  ]);

  assert.deepEqual(icons, [
    "https://file.space4.ink/759676328_n.jpg",
  ]);
  assert.equal(
    sanitizeSelectedIcon(
      "https://file.space4.ink/759676328_n.jpg",
      icons,
    ),
    "https://file.space4.ink/759676328_n.jpg",
  );
  assert.equal(
    sanitizeSelectedIcon("https://example.com/missing.png", icons),
    "",
  );
});

test("clears composer preferences from storage", () => {
  const storage = memoryStorage();
  writeComposerPreferences(storage, DEFAULT_COMPOSER_PREFERENCES);

  clearComposerPreferences(storage);

  assert.deepEqual(
    readComposerPreferences(storage),
    DEFAULT_COMPOSER_PREFERENCES,
  );
});
