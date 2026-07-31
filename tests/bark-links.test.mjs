import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultServerName,
  parseBarkImportLine,
  parseBarkLink,
} from "../app/bark-links.ts";

test("extracts the server and device key from a full Bark link", () => {
  assert.deepEqual(
    parseBarkLink(
      "https://bark.readonly.space/G9py3QmfMH3ayBiPYRW4tA/这里改成你自己的推送内容",
    ),
    {
      serverUrl: "https://bark.readonly.space",
      key: "G9py3QmfMH3ayBiPYRW4tA",
    },
  );
});

test("ignores notification title and body path segments", () => {
  assert.deepEqual(
    parseBarkLink("https://api.day.app/device-key/title/subtitle/body"),
    {
      serverUrl: "https://api.day.app",
      key: "device-key",
    },
  );
});

test("rejects links without a device key", () => {
  assert.throws(() => parseBarkLink("https://api.day.app/"), /Device Key/);
});

test("parses a device name separated by one space", () => {
  assert.deepEqual(
    parseBarkImportLine(
      "space4 https://bark.readonly.space/G9py3QmfMH3ayBiPYRW4tA/这里改成你自己的推送内容",
    ),
    {
      serverUrl: "https://bark.readonly.space",
      key: "G9py3QmfMH3ayBiPYRW4tA",
      deviceName: "space4",
    },
  );
});

test("rejects irregular whitespace without partially parsing the line", () => {
  assert.throws(
    () =>
      parseBarkImportLine(
        "space4  https://bark.readonly.space/G9py3QmfMH3ayBiPYRW4tA/body",
      ),
    /一个半角空格/,
  );
  assert.throws(
    () =>
      parseBarkImportLine(
        "space4\thttps://bark.readonly.space/G9py3QmfMH3ayBiPYRW4tA/body",
      ),
    /一个半角空格/,
  );
});

test("uses the server address without protocol as the default name", () => {
  assert.equal(
    defaultServerName("https://bark.readonly.space"),
    "bark.readonly.space",
  );
  assert.equal(defaultServerName("https://example.com:8443"), "example.com:8443");
});
