export type TaskPriority = "urgent" | "high" | "medium" | "low" | null;

const staleDays: Record<Exclude<TaskPriority, null>, number> = {
  urgent: 0,
  high: 2,
  medium: 7,
  low: 15,
};

export function isStaleTask(task: { priority: TaskPriority; updatedAt: string }, now = new Date()) {
  const threshold = staleDays[task.priority ?? "medium"];
  const elapsed = now.getTime() - new Date(task.updatedAt).getTime();
  return elapsed > threshold * 24 * 60 * 60 * 1000;
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function isWithinQuietHours(current: string, start: string, end: string) {
  const currentMinutes = timeToMinutes(current);
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  if (startMinutes === endMinutes) return false;
  if (startMinutes < endMinutes) return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}
