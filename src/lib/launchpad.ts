/** LaunchPad domain model, demo students, and schedule math. */

export type Category = "academic" | "career" | "project" | "fun";
export type Status = "on-track" | "behind" | "ahead";

export interface CalEvent {
  day: number; // 0 = Mon
  start: number; // hours, e.g. 9.5
  end: number;
  title: string;
  kind: "class" | "task" | "life";
}

export interface CheckItem {
  id: string;
  title: string;
  done?: boolean;
}

export interface CourseGoal {
  id: string;
  title: string;
  horizon: "short" | "long";
}

export interface Course {
  code: string;
  name: string;
  units: number;
  grade?: string;
  subtasks?: CheckItem[];
  goals?: CourseGoal[];
}

export interface Reminder {
  id: string;
  text: string;
  horizon: "month" | "year";
}

export interface Task {
  id: string;
  title: string;
  category: Category;
  due?: string;
  hours?: number;
  /** explicit user priority overrides category order */
  priority?: "highest" | "high" | "low";
  timed: boolean;
  done?: boolean;
  /** Shown on the Working on tab, with its subtasks. */
  pinned?: boolean;
  subtasks?: CheckItem[];
}

/** A short-term aim or a longer-term goal on the student's own profile. */
export interface StudentGoal extends CourseGoal {
  category: Category;
}

export type OpportunityType = "research" | "internship" | "project-team";

/** What the student wants from opportunities; the Opportunities tab can rank against it. */
export interface StudentPreferences {
  workStyle: string;
  opportunityTypes: OpportunityType[];
  location: string;
  protectedTime: string;
}

export interface ResumeEntry {
  title: string;
  org?: string;
  dates?: string;
  bullets: string[];
}

/** Plain resume values. Demo resumes must use placeholders, never real contact details. */
export interface Resume {
  name: string;
  contact: string;
  education: ResumeEntry[];
  coursework: string[];
  projects: ResumeEntry[];
  activities: ResumeEntry[];
  skills: string[];
}

export interface Student {
  id: string;
  name: string;
  major: string;
  year: string;
  school: string;
  gpa: number | null;
  gpaGoal: number;
  status: Status;
  statusNote: string;
  focus: Category[]; // priority order
  courses: Course[];
  events: CalEvent[];
  tasks: Task[];
  weeklyTargets: { label: string; hours: number; done: number }[];
  longTerm: Reminder[];
  /** Optional profile fields. Students without them keep working. */
  demoLabel?: string; // set on invented example students
  interests?: string[];
  skills?: string[];
  freeHoursPerWeek?: number;
  preferences?: StudentPreferences;
  goals?: StudentGoal[]; // short and long horizon; monthly and yearly reminders stay in longTerm
  resume?: Resume;
}

const ece = [
  { code: "ECE 5", name: "Intro to Electrical & Computer Engineering", units: 4 },
  { code: "ECE 17", name: "Object-Oriented Programming", units: 4 },
  { code: "MATH 20C", name: "Calculus & Analytic Geometry", units: 4 },
  { code: "PHYS 2B", name: "Electricity & Magnetism", units: 4 },
];

function classes(): CalEvent[] {
  const e: CalEvent[] = [];
  for (const d of [0, 2, 4]) {
    e.push({ day: d, start: 9, end: 9.83, title: "MATH 20C", kind: "class" });
    e.push({ day: d, start: 10, end: 10.83, title: "ECE 17", kind: "class" });
    e.push({ day: d, start: 13, end: 13.83, title: "PHYS 2B", kind: "class" });
  }
  for (const d of [1, 3]) {
    e.push({ day: d, start: 11, end: 12.33, title: "ECE 5", kind: "class" });
    e.push({ day: d, start: 12.5, end: 13.83, title: "ECE 5 Lab", kind: "class" });
    e.push({ day: d, start: 15, end: 15.83, title: "PHYS 2B Disc", kind: "class" });
  }
  return e;
}

const seojinTasks: Task[] = [
  { id: "t1", title: "Date night", category: "fun", priority: "highest", timed: true, due: "Sat 7pm" },
  { id: "t2", title: "Study for ECE 17 midterm", category: "academic", timed: false, due: "Thu", hours: 8 },
  { id: "t3", title: "Job interview — Qualcomm intern", category: "career", timed: true, due: "Wed 4pm", pinned: true, priority: "high", subtasks: [
    { id: "t3a", title: "Behavioral stories" },
    { id: "t3b", title: "C++ practice" },
    { id: "t3c", title: "Reread the job post" },
  ] },
  { id: "t4", title: "Interview prep (behavioral + C++)", category: "career", timed: false, hours: 3 },
  { id: "t5", title: "IEEE Quarterly Project: line-follower", category: "project", timed: false, hours: 4, due: "Sun" },
  { id: "t6", title: "ECE 5 robot build checkpoint", category: "project", timed: false, hours: 3, due: "Fri" },
  { id: "t7", title: "MATH 20C problem set 4", category: "academic", timed: false, hours: 3, due: "Fri" },
  { id: "t8", title: "Basketball game", category: "fun", timed: true, due: "Fri 7pm" },
  { id: "t9", title: "Dance class", category: "fun", timed: true, due: "Tue 6pm" },
  { id: "t10", title: "Piano practice", category: "fun", timed: false, hours: 2 },
  { id: "t11", title: "Go to the gym 3×", category: "fun", timed: false },
];

const seojinLife: CalEvent[] = [
  { day: 2, start: 16, end: 17, title: "Qualcomm interview", kind: "task" },
  { day: 1, start: 18, end: 19.5, title: "Dance class", kind: "life" },
  { day: 4, start: 19, end: 21, title: "Basketball game", kind: "life" },
  { day: 5, start: 19, end: 22, title: "Date night ♥", kind: "life" },
  { day: 3, start: 19, end: 21, title: "ECE 17 study block", kind: "task" },
  { day: 0, start: 15, end: 17, title: "ECE 17 study block", kind: "task" },
  { day: 6, start: 13, end: 16, title: "IEEE QP build", kind: "task" },
];

export const STUDENTS: Student[] = [
  {
    id: "seojin", name: "Seojin", major: "Electrical Engineering", year: "Freshman", school: "UC San Diego",
    gpa: null, gpaGoal: 3.8, status: "on-track",
    statusNote: "Maximizing productivity. Academia and career come first.",
    focus: ["academic", "career", "project", "fun"],
    courses: ece.map((course) => course.code === "ECE 17" ? {
      ...course,
      subtasks: [
        { id: "e17a", title: "Redo the last lab" },
        { id: "e17b", title: "Midterm practice set" },
      ],
      goals: [
        { id: "e17s", title: "Ready for the Thursday midterm", horizon: "short" as const },
        { id: "e17l", title: "Finish ECE 17 with an A", horizon: "long" as const },
      ],
    } : course),
    events: [...classes(), ...seojinLife],
    tasks: seojinTasks,
    weeklyTargets: [
      { label: "Study outside class", hours: 20, done: 9 },
      { label: "Career prep", hours: 5, done: 2 },
      { label: "Project build time", hours: 7, done: 3 },
    ],
    longTerm: [
      { id: "s-m1", text: "Join an IEEE project team", horizon: "month" },
      { id: "s-y1", text: "3.8+ GPA by end of freshman year", horizon: "year" },
      { id: "s-y2", text: "Land a summer research or intern role", horizon: "year" },
    ],
  },
  {
    id: "marcus", name: "Marcus", major: "Electrical Engineering", year: "Freshman", school: "UC San Diego",
    gpa: 2.9, gpaGoal: 3.5, status: "behind",
    statusNote: "Behind on two problem sets and midterm prep.",
    focus: ["academic", "fun", "project", "career"],
    courses: ece.map((c, i) => ({ ...c, grade: ["B-", "C+", "B", "C"][i] ?? "B" })),
    events: [
      ...classes(),
      { day: 2, start: 20, end: 23, title: "Gaming w/ friends", kind: "life" },
      { day: 4, start: 20, end: 23, title: "Gaming w/ friends", kind: "life" },
    ],
    tasks: [
      { id: "m1", title: "PHYS 2B HW 3 (overdue)", category: "academic", priority: "high", timed: false, hours: 3, due: "Overdue" },
      { id: "m2", title: "MATH 20C PS 3 (overdue)", category: "academic", priority: "high", timed: false, hours: 3, due: "Overdue" },
      { id: "m3", title: "Study for ECE 17 midterm", category: "academic", timed: false, hours: 10, due: "Thu" },
      { id: "m4", title: "Go to office hours", category: "academic", timed: false },
      { id: "m5", title: "Gym", category: "fun", timed: false },
    ],
    weeklyTargets: [
      { label: "Study outside class", hours: 20, done: 4 },
      { label: "Catch-up homework", hours: 6, done: 0 },
    ],
    longTerm: [
      { id: "m-m1", text: "Build a consistent study routine", horizon: "month" },
      { id: "m-y1", text: "Raise GPA to 3.5", horizon: "year" },
    ],
  },
  {
    id: "priya", name: "Priya", major: "Computer Engineering", year: "Sophomore", school: "UC San Diego",
    gpa: 3.92, gpaGoal: 4.0, status: "ahead",
    statusNote: "Ahead on all coursework and taking on new goals.",
    focus: ["career", "academic", "project", "fun"],
    courses: [
      { code: "ECE 35", name: "Intro to Analog Design", units: 4, grade: "A" },
      { code: "ECE 30", name: "Intro to Computer Engineering", units: 4, grade: "A" },
      { code: "MATH 18", name: "Linear Algebra", units: 4, grade: "A-" },
    ],
    events: [
      ...classes().map((e) => ({ ...e, title: e.title.replace("ECE 17", "ECE 30").replace("ECE 5", "ECE 35") })),
      { day: 1, start: 16, end: 18, title: "Research: lab meeting", kind: "task" },
      { day: 3, start: 16, end: 18, title: "Research: FPGA work", kind: "task" },
      { day: 5, start: 10, end: 12, title: "Hackathon prep", kind: "task" },
    ],
    tasks: [
      { id: "p1", title: "Apply: summer SURF research program", category: "career", timed: false, hours: 3, due: "Fri" },
      { id: "p2", title: "Lead IEEE workshop slides", category: "project", timed: false, hours: 2 },
      { id: "p3", title: "Read FPGA paper for lab", category: "career", timed: false, hours: 2 },
      { id: "p4", title: "Run 15 miles this week", category: "fun", timed: false },
    ],
    weeklyTargets: [
      { label: "Study outside class", hours: 15, done: 14 },
      { label: "Research hours", hours: 10, done: 8 },
    ],
    longTerm: [
      { id: "p-m1", text: "Mentor 2 freshmen", horizon: "month" },
      { id: "p-y1", text: "Publish undergrad research poster", horizon: "year" },
      { id: "p-y2", text: "Internship at a chip company", horizon: "year" },
    ],
  },
];

const CAT_ORDER_DEFAULT: Category[] = ["academic", "career", "project", "fun"];

/** Highest explicit priority first, then category order from the student's focus. */
export function sortTasks(tasks: Task[], focus: Category[] = CAT_ORDER_DEFAULT): Task[] {
  const p = (t: Task) => (t.priority === "highest" ? 0 : t.priority === "high" ? 1 : t.priority === "low" ? 3 : 2);
  return [...tasks].sort((a, b) => p(a) - p(b) || focus.indexOf(a.category) - focus.indexOf(b.category));
}

export interface Gap { day: number; start: number; end: number; type: "free" | "pseudo" | "lazy" }

export const DAY_START = 6;
export const DAY_END = 23;

/**
 * Finds empty time per day. Gaps under 30 min that sit between two classes are
 * "pseudo free" (walking/transition time). Gaps of 2h+ on a "behind" student's
 * weekday are flagged "lazy" — unused time that should go to catch-up work.
 */
export function findGaps(events: CalEvent[], status: Status): Gap[] {
  const gaps: Gap[] = [];
  for (let d = 0; d < 7; d++) {
    const ev = events.filter((e) => e.day === d).sort((a, b) => a.start - b.start);
    let cursor = DAY_START;
    let prev: CalEvent | null = null;
    for (const e of [...ev, null]) {
      const s = e ? e.start : DAY_END;
      const len = s - cursor;
      if (len >= 0.15) {
        const between = prev?.kind === "class" && e?.kind === "class";
        let type: Gap["type"] = between && len < 0.5 ? "pseudo" : "free";
        const beforeFirst = !prev;
        if (type === "free" && !beforeFirst && status === "behind" && len >= 2 && d < 5) type = "lazy";
        if (len >= 0.15 && (type !== "free" || len >= 0.5)) gaps.push({ day: d, start: cursor, end: s, type });
      }
      if (e) { cursor = Math.max(cursor, e.end); prev = e; }
    }
  }
  return gaps;
}

/** Hours already on the clock for a goal, hours to move if off task, and open time left. */
export function timeUse(events: CalEvent[], gaps: Gap[]) {
  const span = (items: CalEvent[]) => items.reduce((sum, event) => sum + Math.max(0, event.end - event.start), 0);
  const gapHours = (type: Gap["type"]) => gaps.filter((gap) => gap.type === type).reduce((sum, gap) => sum + gap.end - gap.start, 0);
  return {
    allocated: span(events.filter((event) => event.kind !== "life")),
    reallocate: span(events.filter((event) => event.kind === "life")) + gapHours("lazy"),
    recompensate: gapHours("free"),
  };
}

export const fmt = (h: number) => {
  const hr = Math.floor(h), m = Math.round((h - hr) * 60);
  const ap = hr >= 12 ? "p" : "a";
  return `${((hr + 11) % 12) + 1}${m ? ":" + String(m).padStart(2, "0") : ""}${ap}`;
};

export const RESEARCH = [
  { name: "Existential Robotics Laboratory", pi: "Nikolay Atanasov", url: "https://erl.ucsd.edu/", what: "Robot perception, mapping, and navigation. The lab site is also published at existentialrobotics.org." },
  { name: "Advanced Robotics and Controls Lab", pi: "Michael Yip", url: "https://ucsdarclab.com/", what: "Surgical robots, biomimetic robots, and robot learning at UC San Diego." },
  { name: "Engineers for Exploration", pi: "Ryan Kastner and Curt Schurgers", url: "https://e4e.ucsd.edu/", what: "Undergraduate research building sensors and robots for field science. New students can apply at e4e.ucsd.edu/join." },
  { name: "San Diego Supercomputer Center", pi: "UC San Diego", url: "https://www.sdsc.edu/education/internships.html", what: "Lists undergraduate and graduate internships, including Research Data Services and HPC training roles." },
  { name: "Qualcomm Institute", pi: "Calit2 at UC San Diego", url: "https://qi.ucsd.edu/education/for-prospective-participants/uc-san-diego/", what: "UC San Diego students can join through the Academic Internship Program and QI research programs, including Engineers for Exploration." },
];

export const PROJECTS = [
  { name: "IEEE at UC San Diego — Quarterly Projects", url: "https://ieeeatucsd.org/projects/quarterly", what: "Ten-week team builds with mentors. Open to new students; the branch sends a new application each quarter." },
  { name: "Triton Robotics", url: "https://tritonrobotics.org/", what: "Student team for the ARC Championship, formerly RoboMaster. Recruitment is closed and reopens in Winter 2027." },
  { name: "Engineers for Exploration", url: "https://e4e.ucsd.edu/open-opportunities", what: "Academic-year project teams for undergraduates. Apply at e4e.ucsd.edu/join." },
  { name: "Jacobs School student organizations", url: "https://jacobs.ucsd.edu/idea/current-undergraduates/undergraduate", what: "Jacobs School directory of undergraduate engineering organizations." },
];
export const SEOJIN: Student = STUDENTS[0] as Student;
