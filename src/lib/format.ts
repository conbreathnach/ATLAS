/** Sidebar date grouping, like ChatGPT's chat list. */

export interface ConversationGroup<T> {
  label: string;
  items: T[];
}

export function groupByDate<T extends { updatedAt: number }>(items: T[]): ConversationGroup<T>[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
  const startOfYesterday = startOfToday - 86_400;
  const startOfWeek = startOfToday - 7 * 86_400;

  const groups: ConversationGroup<T>[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 days", items: [] },
    { label: "Older", items: [] },
  ];

  for (const item of items) {
    const group =
      item.updatedAt >= startOfToday
        ? groups[0]
        : item.updatedAt >= startOfYesterday
          ? groups[1]
          : item.updatedAt >= startOfWeek
            ? groups[2]
            : groups[3];
    group.items.push(item);
  }
  return groups.filter((group) => group.items.length > 0);
}

export function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
