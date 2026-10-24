"""
LaunchPad Pydantic Schemas.

Defines the core data models for student profiles, roadmap tasks, weekly plans,
dynamic triage recommendations, and Voiskey daily logs.
"""

from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class TaskCategory(str, Enum):
    """Categorization for student roadmap tasks."""
    ACADEMIC = "academic"       # Coursework, study sessions, exam prep
    PROJECT = "project"         # Starter hands-on engineering builds
    CAREER = "career"           # Research labs, student orgs, resume/internships
    WELLNESS = "wellness"       # Burnout prevention, sleep, social recovery


class PriorityLevel(str, Enum):
    """Priority level indicating task urgency and impact."""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class TaskItem(BaseModel):
    """A single actionable task item inside a weekly engineering plan."""
    id: str = Field(description="Unique task identifier, e.g. 'w1_t1'")
    title: str = Field(description="Concise, actionable task title")
    description: str = Field(description="Details, recommendations, or step-by-step guidance")
    category: TaskCategory = Field(default=TaskCategory.PROJECT, description="Category of the task")
    estimated_hours: float = Field(default=2.0, ge=0.5, le=40.0, description="Estimated time commitment in hours")
    priority: PriorityLevel = Field(default=PriorityLevel.MEDIUM, description="Task urgency and weight")
    completed: bool = Field(default=False, description="Whether the student marked the task as completed")
    due_info: Optional[str] = Field(default=None, description="Optional deadline or timing note, e.g. 'Due Thursday before lab'")
    link: Optional[str] = Field(default=None, description="Optional URL to documentation, repo starter, or lab page")
    day_slot: Optional[str] = Field(default="Mon-Wed", description="Target weekly time block")


class WeeklyPlan(BaseModel):
    """Plan for a single week across the 4-week onboarding roadmap."""
    week_number: int = Field(ge=1, le=4, description="Week number between 1 and 4")
    theme: str = Field(description="Guiding weekly theme, e.g., 'Tooling & First C++ Milestone'")
    focus_summary: str = Field(description="High-level narrative explaining what to focus on this week")
    allocated_hours: float = Field(default=10.0, ge=1.0, description="Total target hours for this week")
    tasks: List[TaskItem] = Field(default_factory=list, description="List of tasks scheduled for this week")


class FourWeekRoadmap(BaseModel):
    """Full 4-week structured engineering plan returned by Gemini."""
    student_name: Optional[str] = Field(default="UCSD EE Cadet", description="Student preferred name")
    executive_summary: str = Field(description="Overview of the 4-week growth path and career alignment")
    recommended_project: str = Field(description="Suggested beginner project title aligned with interests")
    recommended_clubs_labs: List[str] = Field(default_factory=list, description="Target university labs or student engineering clubs")
    weeks: List[WeeklyPlan] = Field(default_factory=list, description="List of 4 weekly plans")


class StudentProfile(BaseModel):
    """Profile data for the signed-in planner, or for the freshman engineering example."""
    display_name: str = Field(default="You", description="Name shown in the planner")
    focus_areas: List[str] = Field(
        default_factory=lambda: ["academia", "career"],
        description="Areas the planner should pay attention to: academia, career, projects, recovery",
    )
    persona: str = Field(default="personal", description="'personal' for the signed-in planner, 'demo' for the example student")
    notes: str = Field(default="", description="Free-form notes the person keeps on the career page")
    class_grades: Dict[str, str] = Field(default_factory=dict, description="Letter grade target keyed by class name")
    university: str = Field(default="", description="School, if they chose to enter one")
    school_catalog: str = Field(default="", description="Catalog source, used by the example student")
    year: str = Field(default="", description="Academic year, in their words")
    major: str = Field(default="", description="What they are studying")
    current_classes: List[str] = Field(default_factory=list, description="Classes they want on the plan")
    skills: List[str] = Field(default_factory=list, description="Current skills")
    interests: List[str] = Field(default_factory=list, description="Projects or subjects they want time for")
    free_hours_per_week: int = Field(default=10, ge=1, le=80, description="Hours available outside class each week")
    current_gpa: Optional[float] = Field(default=None, description="Current GPA, if they have one")
    gpa_goal: float = Field(default=3.8, ge=0.0, le=4.0, description="Grade goal")
    career_goal: Optional[str] = Field(default="", description="Career step they want the plan to respect")


class TriageAction(BaseModel):
    """Specific triage modification to the student's schedule suggested by Grok."""
    action: str = Field(description="Action verb: 'drop', 'postpone', 'compress', 'keep', 'add'")
    task_id: Optional[str] = Field(default=None, description="ID of the task to modify, if applicable")
    task_title: str = Field(description="Name or description of the affected task")
    reason: str = Field(description="Pedagogical reason for the adjustment (e.g., protect GPA for upcoming exam)")
    new_target_week: Optional[int] = Field(default=None, description="Postponed week target if moved")


class ScheduleRebalanceDiff(BaseModel):
    """Structured response from xAI Grok triage engine."""
    summary: str = Field(description="Immediate executive advice for the student's situation")
    actions: List[TriageAction] = Field(default_factory=list, description="List of concrete schedule triage adjustments")
    mentor_note: str = Field(description="Supportive engineering mentor feedback and perspective")


class ChatMessage(BaseModel):
    """Representation of a chat interaction in the triage/mentor tab."""
    role: str = Field(description="'user', 'assistant', or 'system'")
    content: str = Field(description="Message body text")
    timestamp: Optional[str] = Field(default=None, description="ISO timestamp of message")


class TaskTiming(str, Enum):
    """How a task sits on the week."""
    CLOCK = "clock"          # A real block on the weekly calendar
    HOUR_GOAL = "hour_goal"  # A weekly total, not pinned to a clock time
    UNTIMED = "untimed"      # No clock time, such as "go to the gym"


class CalendarEvent(BaseModel):
    """A fixed block imported from Google Calendar or written into the example week."""
    id: str
    title: str
    day: str = Field(description="Monday through Sunday")
    start: str = Field(default="", description="HH:MM, empty when all_day")
    end: str = Field(default="", description="HH:MM, empty when all_day")
    location: str = ""
    kind: str = Field(default="class", description="class, commitment, or focus")
    all_day: bool = False
    source: str = "google_calendar"


class WorkTask(BaseModel):
    """A task for this week or for later. Clock tasks also appear on the weekly calendar."""
    id: str
    title: str
    description: str = ""
    category: TaskCategory = TaskCategory.ACADEMIC
    priority: PriorityLevel = PriorityLevel.MEDIUM
    explicit_priority: bool = Field(default=False, description="True when the person set High, Medium, or Low themselves")
    timing: TaskTiming = TaskTiming.UNTIMED
    when: str = Field(default="this_week", description="this_week or upcoming")
    estimated_hours: float = Field(default=1.0, ge=0.0, le=80.0)
    hours_logged: float = Field(default=0.0, ge=0.0, le=80.0)
    day: Optional[str] = None
    start: Optional[str] = None
    end: Optional[str] = None
    location: str = ""
    completed: bool = False


class Goal(BaseModel):
    """A short-term aim, or a monthly/yearly reminder."""
    id: str
    title: str
    detail: str = ""
    horizon: str = Field(default="short", description="short or long")
    category: TaskCategory = TaskCategory.ACADEMIC


class FeatureSettings(BaseModel):
    """Which parts of the planner stay visible."""
    productivity_bar: bool = True
    weekly_calendar: bool = True
    this_week_tasks: bool = True
    upcoming_tasks: bool = True
    short_goals: bool = True
    long_goals: bool = True
    classes: bool = True
    career: bool = True
    assistant: bool = True
    bring_in: bool = True


class Planner(BaseModel):
    """The live week: calendar, tasks, and goals."""
    summary: str = ""
    productivity_aim: str = "Use the real free time for the work that matters."
    events: List[CalendarEvent] = Field(default_factory=list)
    tasks: List[WorkTask] = Field(default_factory=list)
    short_goals: List[Goal] = Field(default_factory=list)
    long_goals: List[Goal] = Field(default_factory=list)
    settings: FeatureSettings = Field(default_factory=FeatureSettings)
    show_hour_tracker: bool = False
    day_start: str = "08:00"
    day_end: str = "21:30"


class PlanProposal(BaseModel):
    """A change Gemini or Grok may make only after the person confirms it."""
    summary: str
    why: str = ""
    replace_tasks: bool = False
    tasks: List[WorkTask] = Field(default_factory=list)
    replace_short_goals: bool = False
    short_goals: List[Goal] = Field(default_factory=list)
    replace_long_goals: bool = False
    long_goals: List[Goal] = Field(default_factory=list)
    add_events: List[CalendarEvent] = Field(default_factory=list)
    gpa_goal: Optional[float] = None
    career_goal: Optional[str] = None
    classes: Optional[List[str]] = None
    focus_areas: Optional[List[str]] = None
    free_hours_per_week: Optional[int] = None
    show_hour_tracker: Optional[bool] = None
    productivity_bar_visible: Optional[bool] = None
    productivity_aim: Optional[str] = None


class GeminiTurn(BaseModel):
    """What Gemini says, plus an optional change that still needs a yes."""
    reply: str
    needs_confirmation: bool = False
    proposal: Optional[PlanProposal] = None
