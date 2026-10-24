import type { CalEvent, Category, Status, Student, Task } from "./launchpad";

export type Patch = {
  status?: Status;
  statusNote?: string;
  addEvents?: CalEvent[];
  addTasks?: Task[];
  courses?: Student["courses"];
  longTermAdd?: string[];
  weeklyTargets?: Student["weeklyTargets"];
  /** Task ids moved to next week. Built only by the postpone chips; sanitizePatch never returns it. */
  postpone?: string[];
};

/** The due text a postponed task gets. */
export const POSTPONED_DUE = "Next week";

const STATUSES: Status[] = ["on-track", "behind", "ahead"];
const CATEGORIES: Category[] = ["academic", "career", "project", "fun"];

export function sanitizePatch(input: unknown): Patch | null {
  const raw = asRecord(input);
  if (!raw) return null;
  const patch: Patch = {};
  const status = text(raw, "status");
  if (STATUSES.includes(status as Status)) patch.status = status as Status;
  const statusNote = text(raw, "statusNote");
  if (statusNote) patch.statusNote = statusNote.slice(0, 180);
  const events = eventsOf(raw["addEvents"]);
  if (events.length) patch.addEvents = events;
  const tasks = tasksOf(raw["addTasks"]);
  if (tasks.length) patch.addTasks = tasks;
  const courses = coursesOf(raw["courses"]);
  if (courses.length) patch.courses = courses;
  const longTerm = stringsOf(raw["longTermAdd"]);
  if (longTerm.length) patch.longTermAdd = longTerm;
  const targets = targetsOf(raw["weeklyTargets"]);
  if (targets.length) patch.weeklyTargets = targets;
  return Object.keys(patch).length ? patch : null;
}

export function applyPatch(student: Student, patch: Patch): Student {
  const next: Student = {
    ...student,
    events: [...student.events],
    tasks: [...student.tasks],
    courses: [...student.courses],
    longTerm: [...student.longTerm],
    weeklyTargets: student.weeklyTargets.map((target) => ({ ...target })),
    focus: [...student.focus],
  };
  if (patch.status) next.status = patch.status;
  if (patch.statusNote) next.statusNote = patch.statusNote;
  for (const event of patch.addEvents ?? []) {
    const exists = next.events.some((item) => item.day === event.day && item.start === event.start && item.end === event.end && item.title === event.title);
    if (!exists) next.events.push(event);
  }
  for (const task of patch.addTasks ?? []) {
    if (!next.tasks.some((item) => item.title === task.title)) next.tasks.push(task);
  }
  if (patch.postpone?.length) {
    const ids = new Set(patch.postpone);
    next.tasks = next.tasks.map((task) =>
      ids.has(task.id) ? { ...task, due: POSTPONED_DUE } : task,
    );
  }
  if (patch.courses) next.courses = mergeCourses(next.courses, patch.courses);
  for (const goal of patch.longTermAdd ?? []) {
    if (!next.longTerm.some((item) => item.text === goal)) {
      next.longTerm.push({ id: `lt_${goal.slice(0, 12)}`, text: goal, horizon: "year" });
    }
  }
  if (patch.weeklyTargets) next.weeklyTargets = mergeTargets(next.weeklyTargets, patch.weeklyTargets);
  return next;
}

function mergeCourses(current: Student["courses"], incoming: Student["courses"]): Student["courses"] {
  const next = current.map((course) => ({ ...course }));
  for (const course of incoming) {
    const index = next.findIndex((item) => item.code.toLowerCase() === course.code.toLowerCase());
    if (index >= 0) next[index] = { ...next[index], ...course };
    else next.push(course);
  }
  return next;
}

function mergeTargets(current: Student["weeklyTargets"], incoming: Student["weeklyTargets"]): Student["weeklyTargets"] {
  const next = current.map((target) => ({ ...target }));
  for (const target of incoming) {
    const index = next.findIndex((item) => item.label.toLowerCase() === target.label.toLowerCase());
    if (index >= 0) next[index] = target;
    else next.push(target);
  }
  return next;
}

function eventsOf(value: unknown): CalEvent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const event = asRecord(item);
    if (!event) return [];
    const day = Number(event["day"]);
    const start = Number(event["start"]);
    const end = Number(event["end"]);
    const title = text(event, "title");
    const kindRaw = text(event, "kind");
    const kind = kindRaw === "class" || kindRaw === "life" || kindRaw === "task" ? kindRaw : "task";
    if (!title || !Number.isFinite(day) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
    return [{ day: Math.max(0, Math.min(6, Math.round(day))), start, end, title: title.slice(0, 80), kind }];
  });
}

function tasksOf(value: unknown): Task[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    const task = asRecord(item);
    if (!task) return [];
    const title = text(task, "title");
    if (!title) return [];
    const categoryRaw = text(task, "category");
    const category = CATEGORIES.includes(categoryRaw as Category) ? (categoryRaw as Category) : "academic";
    const priorityRaw = text(task, "priority");
    const hours = Number(task["hours"]);
    const due = text(task, "due");
    const next: Task = {
      id: text(task, "id") || `new_${index}_${title.slice(0, 12)}`,
      title: title.slice(0, 120),
      category,
      timed: Boolean(task["timed"]),
    };
    if (priorityRaw === "highest" || priorityRaw === "high" || priorityRaw === "low") next.priority = priorityRaw;
    if (Number.isFinite(hours) && hours > 0) next.hours = hours;
    if (due) next.due = due.slice(0, 40);
    return [next];
  });
}

function coursesOf(value: unknown): Student["courses"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const course = asRecord(item);
    if (!course) return [];
    const code = text(course, "code");
    const name = text(course, "name");
    if (!code || !name) return [];
    const grade = text(course, "grade");
    const next: Student["courses"][number] = { code: code.slice(0, 16), name: name.slice(0, 80), units: Number(course["units"]) || 4 };
    if (grade) next.grade = grade;
    return [next];
  });
}

function targetsOf(value: unknown): Student["weeklyTargets"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const target = asRecord(item);
    if (!target) return [];
    const label = text(target, "label");
    const hours = Number(target["hours"]);
    const done = Number(target["done"]);
    if (!label || !Number.isFinite(hours) || hours <= 0) return [];
    return [{ label: label.slice(0, 80), hours, done: Number.isFinite(done) ? Math.max(0, done) : 0 }];
  });
}

function stringsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim().slice(0, 140)] : []));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function text(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value.trim() : "";
}
