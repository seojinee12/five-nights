/** LaunchPad domain model, demo students, and schedule math. */

export type Category = "academic" | "career" | "project" | "fun";
export type Status = "on-track" | "behind" | "ahead";

export interface CalEvent {
  day: number; // 0 = Mon
  start: number; // hours, e.g. 9.5
  end: number;
  title: string;
  kind: "class" | "task" | "life";
  /** Fixed blocks such as meals: they occupy time but are never offered up as time to reallocate. */
  fixed?: boolean;
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

/** Seojin's first-year courses: the shared class grid with ECE 17 dropped and the math and physics slots renamed. */
const seojinCourses: Course[] = [
  { code: "ECE 5", name: "Intro to Electrical & Computer Engineering", units: 4 },
  {
    code: "MATH 20A", name: "Calculus for Science & Engineering", units: 4,
    subtasks: [
      { id: "m20a", title: "Redo the last problem set" },
      { id: "m20b", title: "Midterm practice set" },
    ],
    goals: [
      { id: "m20s", title: "Ready for the Thursday midterm", horizon: "short" },
      { id: "m20l", title: "Finish MATH 20A with an A", horizon: "long" },
    ],
  },
  { code: "PHYS 2A", name: "Physics: Mechanics", units: 4 },
];

function seojinClasses(): CalEvent[] {
  return classes()
    .filter((e) => e.title !== "ECE 17")
    .map((e) => ({ ...e, title: e.title.replace("MATH 20C", "MATH 20A").replace("PHYS 2B", "PHYS 2A") }));
}

/** EXAMPLE / DEMO profile data for the invented first-year student. Not a real person's record. */
const seojinProfile: Pick<Student, "demoLabel" | "interests" | "skills" | "freeHoursPerWeek" | "preferences" | "goals" | "resume"> = {
  demoLabel: "EXAMPLE / DEMO DATA: an invented first-year student. Not a real person's record.",
  interests: ["Robotics and embedded systems", "Wearable and sensor hardware", "Undergraduate research"],
  skills: ["C++ (intro level)", "Python (basic scripting)", "Circuit basics", "Arduino basics", "Git"],
  freeHoursPerWeek: 22,
  preferences: {
    workStyle: "Short hands-on builds, 2 to 3 hour focus blocks, a study group once a week",
    opportunityTypes: ["research", "internship", "project-team"],
    location: "On campus at UC San Diego, or remote for internships",
    protectedTime: "One free evening a week and 7+ hours of sleep",
  },
  goals: [
    { id: "sg1", title: "Keep ECE 5, MATH 20A and PHYS 2A at A- or better this quarter", horizon: "short", category: "academic" },
    { id: "sg2", title: "Email two UCSD labs about first-year research help", horizon: "short", category: "career" },
    { id: "sg3", title: "Finish the line-follower with an IEEE quarterly project team", horizon: "short", category: "project" },
    { id: "sg4", title: "Start research at UCSD by spring quarter", horizon: "long", category: "career" },
    { id: "sg5", title: "Land a hardware or embedded summer internship after the first year", horizon: "long", category: "career" },
  ],
  resume: {
    name: "Seojin (EXAMPLE student)",
    contact: "EXAMPLE ONLY: placeholder, no real email, phone, or address",
    education: [
      { title: "B.S. Electrical Engineering (in progress)", org: "UC San Diego, Jacobs School of Engineering", dates: "Fall 2026 to present", bullets: ["First-year student. GPA not yet available."] },
    ],
    coursework: [
      "ECE 5: Introduction to Electrical and Computer Engineering (in progress)",
      "MATH 20A: Calculus for Science and Engineering (in progress)",
      "PHYS 2A: Physics, Mechanics (in progress)",
    ],
    projects: [
      {
        title: "Line-following robot (example project)", dates: "Summer 2026",
        bullets: [
          "Built a two-motor robot car from a starter kit using an Arduino and two infrared sensors.",
          "Wrote the control loop in C++ and tuned it until the robot completed a taped track.",
          "Kept the code and wiring notes in a Git repository.",
        ],
      },
      {
        title: "Room temperature logger (example project)", dates: "Spring 2026",
        bullets: [
          "Read a temperature sensor with a microcontroller and saved readings to a CSV file.",
          "Plotted a week of data with a short Python script.",
        ],
      },
    ],
    activities: [
      {
        title: "Member", org: "High school robotics club (example)", dates: "2024 to 2026",
        bullets: [
          "Helped wire and test sensors for a competition robot.",
          "Presented a short demo of the robot at a school open house.",
        ],
      },
    ],
    skills: ["C++ (intro level)", "Python (basic scripting)", "Arduino", "Breadboard circuits", "Git"],
  },
};

const seojinTasks: Task[] = [
  { id: "t1", title: "Date night", category: "fun", priority: "highest", timed: true, due: "Sat 7pm" },
  { id: "t2", title: "Study for MATH 20A midterm", category: "academic", timed: false, due: "Thu", hours: 8 },
  { id: "t3", title: "Résumé review at the Career Center (example)", category: "career", timed: true, due: "Wed 4pm", pinned: true, priority: "high", subtasks: [
    { id: "t3a", title: "Add the line-follower project" },
    { id: "t3b", title: "List ECE 5, MATH 20A and PHYS 2A" },
    { id: "t3c", title: "Check for placeholder contact details" },
  ] },
  { id: "t4", title: "Internship application prep (behavioral + intro C++)", category: "career", timed: false, hours: 3 },
  { id: "t5", title: "IEEE Quarterly Project: line-follower", category: "project", timed: false, hours: 4, due: "Sun" },
  { id: "t6", title: "ECE 5 robot build checkpoint", category: "project", timed: false, hours: 3, due: "Fri" },
  { id: "t7", title: "MATH 20A problem set 4", category: "academic", timed: false, hours: 3, due: "Fri" },
  { id: "t8", title: "Basketball game", category: "fun", timed: true, due: "Fri 7pm" },
  { id: "t9", title: "Dance class", category: "fun", timed: true, due: "Tue 6pm" },
  { id: "t10", title: "Piano practice", category: "fun", timed: false, hours: 2 },
  { id: "t11", title: "Go to the gym 3×", category: "fun", timed: false },
];

/** Lunch from 2 to 3 PM every day except Sunday. Meals are "life" events, like the rest of the non-class, non-task blocks. */
function seojinLunch(): CalEvent[] {
  return [0, 1, 2, 3, 4, 5].map((day) => ({
    day,
    start: 14,
    end: 15,
    title: "Lunch",
    kind: "life" as const,
    fixed: true,
  }));
}

const seojinLife: CalEvent[] = [
  { day: 2, start: 16, end: 17, title: "Résumé review", kind: "task" },
  { day: 1, start: 18, end: 19.5, title: "Dance class", kind: "life" },
  { day: 4, start: 19, end: 21, title: "Basketball game", kind: "life" },
  { day: 5, start: 19, end: 22, title: "Date night ♥", kind: "life" },
  { day: 3, start: 19, end: 21, title: "MATH 20A study block", kind: "task" },
  { day: 0, start: 15, end: 17, title: "MATH 20A study block", kind: "task" },
  { day: 6, start: 13, end: 16, title: "IEEE QP build", kind: "task" },
];

export const STUDENTS: Student[] = [
  {
    id: "seojin", name: "Seojin", major: "Electrical Engineering", year: "Freshman", school: "UC San Diego",
    gpa: null, gpaGoal: 3.8, status: "on-track",
    statusNote: "Maximizing productivity. Academia and career come first.",
    focus: ["academic", "career", "project", "fun"],
    courses: seojinCourses,
    events: [...seojinClasses(), ...seojinLunch(), ...seojinLife],
    tasks: seojinTasks,
    weeklyTargets: [
      { label: "Study outside class", hours: 20, done: 9 },
      { label: "Career prep", hours: 5, done: 2 },
      { label: "Project build time", hours: 7, done: 3 },
    ],
    longTerm: [
      { id: "s-m1", text: "Join an IEEE project team", horizon: "month" },
      { id: "s-m2", text: "Email two UCSD labs about first-year research help", horizon: "month" },
      { id: "s-m3", text: "Get one résumé review and update the résumé", horizon: "month" },
      { id: "s-y1", text: "3.8+ GPA by end of freshman year", horizon: "year" },
      { id: "s-y2", text: "Start research at UCSD by spring quarter", horizon: "year" },
      { id: "s-y3", text: "Land a hardware or embedded summer internship", horizon: "year" },
    ],
    ...seojinProfile,
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

export {
  DAY_START,
  DAY_END,
  DEFAULT_WINDOW,
  MIN_WINDOW_HOURS,
  sortTasks,
  dueRank,
  findGaps,
  timeUse,
  isValidWindow,
  normalizeWindow,
  windowHours,
  weekHours,
} from "./schedule";
export type { DayWindow } from "./schedule";
export type { Gap } from "./schedule";

export const fmt = (h: number) => {
  const hr = Math.floor(h), m = Math.round((h - hr) * 60);
  const ap = hr % 24 >= 12 ? "p" : "a"; // 24 reads as 12a (midnight)
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
