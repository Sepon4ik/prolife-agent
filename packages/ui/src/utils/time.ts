export function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "сейчас";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} дн`;
  return date.toLocaleDateString("ru-RU", { month: "short", day: "numeric" });
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("ru-RU", {
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(date: Date): string {
  return date.toLocaleString("ru-RU", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
