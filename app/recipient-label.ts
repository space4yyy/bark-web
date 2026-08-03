export type RecipientLabelLocale = "zh" | "en";

export function formatSendButtonLabel(
  deviceNames: string[],
  locale: RecipientLabelLocale,
) {
  if (deviceNames.length === 0) {
    return locale === "zh" ? "发送通知" : "Send notification";
  }

  const visibleNames = deviceNames.slice(0, 2);
  const hasMore = deviceNames.length > visibleNames.length;

  if (locale === "zh") {
    return `发送给 ${visibleNames.join("，")}${hasMore ? " 等" : ""}`;
  }

  return `Send to ${visibleNames.join(", ")}${hasMore ? ", etc." : ""}`;
}
