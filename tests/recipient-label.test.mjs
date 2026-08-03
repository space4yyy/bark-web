import assert from "node:assert/strict";
import test from "node:test";
import { formatSendButtonLabel } from "../app/recipient-label.ts";

test("uses the generic send label when no device is selected", () => {
  assert.equal(formatSendButtonLabel([], "zh"), "发送通知");
  assert.equal(formatSendButtonLabel([], "en"), "Send notification");
});

test("shows one device name in the send button", () => {
  assert.equal(formatSendButtonLabel(["test1"], "zh"), "发送给 test1");
});

test("shows both device names when exactly two are selected", () => {
  assert.equal(
    formatSendButtonLabel(["test1", "test2"], "zh"),
    "发送给 test1，test2",
  );
});

test("shows at most two device names when more are selected", () => {
  assert.equal(
    formatSendButtonLabel(["space4", "test", "test3"], "zh"),
    "发送给 space4，test 等",
  );
});

test("formats the compact send label in English", () => {
  assert.equal(
    formatSendButtonLabel(["test1", "test2", "test3"], "en"),
    "Send to test1, test2, etc.",
  );
});
