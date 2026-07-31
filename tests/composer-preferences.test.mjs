import assert from "node:assert/strict";
import test from "node:test";
import {
  clearComposerPreferences,
  DEFAULT_COMPOSER_PREFERENCES,
  readComposerPreferences,
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
    }),
  );

  assert.deepEqual(
    readComposerPreferences(storage),
    DEFAULT_COMPOSER_PREFERENCES,
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
