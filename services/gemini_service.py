"""
Gemini Service Wrapper.

Handles multimodal syllabus/schedule parsing and generates structured 4-week
onboarding roadmaps for early-career engineering students.
Uses Google's `google-genai` SDK with Pydantic structured outputs.
"""

import os
import json
import logging
from typing import Optional, List, Dict
from dotenv import load_dotenv

from models.schemas import (
    StudentProfile,
    FourWeekRoadmap,
    WeeklyPlan,
    TaskItem,
    TaskCategory,
    PriorityLevel,
    ChatMessage,
)

load_dotenv()
logger = logging.getLogger(__name__)

GEMINI_MODEL = "gemini-3.8-flash"


class GeminiService:
    """Service wrapper for Google Gemini multimodal analysis and roadmap synthesis."""

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize Gemini client. Reads GEMINI_API_KEY from environment if not explicitly provided.
        """
        self.api_key = api_key or os.getenv("GEMINI_API_KEY", "")
        self.client = None
        self._init_client()

    def _init_client(self) -> None:
        """Internal helper to initialize the genai Client if SDK and API key are available."""
        if not self.api_key:
            logger.warning("GEMINI_API_KEY not configured. Running in mock/fallback mode.")
            return

        try:
            from google import genai
            self.client = genai.Client(api_key=self.api_key)
            logger.info("Successfully initialized Google GenAI client.")
        except ImportError:
            logger.warning("google-genai package not installed. Operating in mock mode.")
            self.client = None
        except Exception as e:
            logger.error(f"Error initializing GenAI client: {e}")
            self.client = None

    def transcribe_audio_prompt(self, audio_bytes: bytes, mime_type: str = "audio/wav") -> str:
        """
        Transcribe and clean user voice dictation so the student can verify what they said
        before transmitting their intentions to the Gemini schedule optimizer.
        """
        if not self.client:
            logger.info("Gemini client offline. Returning deterministic test transcription.")
            return "I want to prioritize academic success for my ECE courses first, then work on building an autonomous line-following robot, then look into undergraduate research labs, and make sure I have time for dance classes and gym."

        try:
            from google.genai import types

            part = types.Part.from_bytes(data=audio_bytes, mime_type=mime_type)
            prompt = (
                "Transcribe this audio recording into clean, concise English text. "
                "Remove speech disfluencies ('um', 'uh', false starts) while preserving "
                "the student's exact intentions, course names (e.g. ECE 5, MATH 20A), "
                "project goals, and priority rankings. Return only the clean transcript text."
            )
            response = self.client.models.generate_content(
                model=GEMINI_MODEL,
                contents=[part, prompt],
            )
            return response.text.strip() if response.text else "Voice recorded. Please verify."

        except Exception as e:
            logger.error(f"Audio transcription failed: {e}")
            return "I prioritize academic success in ECE 5 and MATH 20A, then building a robot, then research labs, and then gym and dance time."

    def optimize_schedule_with_gemini(
        self,
        user_input: str,
        roadmap: FourWeekRoadmap,
        priorities: Dict[str, int],
        profile: StudentProfile,
    ) -> FourWeekRoadmap:
        """
        Adapts the 4-week roadmap based on the student's explicit priority hierarchy:
        e.g., 1. Academics (3.8+ GPA), 2. Projects (Robot), 3. Career (Labs), 4. Fun (Dance/Gym).
        """
        if not self.client:
            logger.info("Gemini client not initialized. Applying rule-based priority rebalancing.")
            return self._apply_priority_rebalance_mock(roadmap, user_input, priorities, profile)

        try:
            from google.genai import types

            roadmap_json = roadmap.model_dump_json()
            focus = ", ".join(profile.focus_areas) if profile.focus_areas else "academia, career"
            classes = ", ".join(profile.current_classes) if profile.current_classes else "not listed"
            prompt = f"""
            You are LaunchPad's schedule editor. Rewrite the 4-week plan for this person.

            Person:
            - Name: {profile.display_name}
            - School: {profile.university or "not specified"}
            - Year: {profile.year or "not specified"}
            - Studying: {profile.major or "not specified"}
            - Classes: {classes}
            - Hours available each week outside class: {profile.free_hours_per_week}
            - Grade goal: {profile.gpa_goal}
            - Career aim: {profile.career_goal or "not specified"}
            - Areas they asked the planner to pay attention to: {focus}
            - This profile is {"the UCSD freshman engineering example" if profile.persona == "demo" else "their own planner, not the UCSD example"}.

            Ranked priorities (1 is first):
            - Academia: {priorities.get('Academic', 1)}
            - Projects: {priorities.get('Project', 2)}
            - Career: {priorities.get('Career', 3)}
            - Recovery: {priorities.get('Fun', 4)}

            What they wrote:
            "{user_input}"

            Current plan JSON:
            {roadmap_json}

            Instructions:
            1. Keep tasks inside the areas they asked for: {focus}.
            2. Use their real classes and career aim. Do not invent UCSD electrical engineering coursework unless this is the demo profile or they listed those classes.
            3. Put the highest ranked area first in each week.
            4. Each week needs concrete tasks with categories academic, project, career, or wellness.
            5. Return strict JSON matching the FourWeekRoadmap schema.
            """

            response = self.client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=FourWeekRoadmap,
                    temperature=0.3,
                ),
            )

            roadmap_dict = json.loads(response.text)
            return FourWeekRoadmap.model_validate(roadmap_dict)

        except Exception as e:
            logger.error(f"Gemini priority optimization failed: {e}. Falling back to internal rebalancer.")
            return self._apply_priority_rebalance_mock(roadmap, user_input, priorities, profile)

    def chat_with_gemini(
        self,
        user_message: str,
        chat_history: List[ChatMessage],
        roadmap: FourWeekRoadmap,
        profile: StudentProfile,
    ) -> str:
        """
        Conversational chatbot receiver for user schedule queries, priority adjustments, and workload advice.
        """
        if not self.client:
            focus = ", ".join(profile.focus_areas) if profile.focus_areas else "the areas you picked"
            name = profile.display_name or "there"
            return (
                f"Got it, {name}. I would keep this month centered on {focus}. "
                f"Use Update the month if you want that note added to week 1. "
                f"Practice replies are on right now, so this message is a stand-in until the Gemini key is available."
            )

        try:
            focus = ", ".join(profile.focus_areas) if profile.focus_areas else "academia, career"
            classes = ", ".join(profile.current_classes) if profile.current_classes else "not listed"
            system_prompt = (
                "You are LaunchPad, a calm scheduling companion. "
                f"You are talking to {profile.display_name}, who studies {profile.major or 'an unspecified subject'} "
                f"at {profile.university or 'an unspecified school'}. "
                f"Classes: {classes}. Career aim: {profile.career_goal or 'not specified'}. "
                f"Only pay attention to these areas: {focus}. "
                f"Persona: {profile.persona}. "
                "If persona is personal, do not assume they are a UCSD electrical engineering freshman. "
                "If persona is demo, they are Alex Rivera, that example student. "
                "Be concise, specific, and kind. Do not mention voice dictation."
            )

            formatted_messages = [f"System: {system_prompt}"]
            for m in chat_history[-6:]:
                formatted_messages.append(f"{m.role.capitalize()}: {m.content}")
            formatted_messages.append(f"User: {user_message}")

            full_prompt = "\n".join(formatted_messages)

            response = self.client.models.generate_content(
                model=GEMINI_MODEL,
                contents=full_prompt,
            )
            return response.text.strip() if response.text else "Schedule updated according to your priorities."

        except Exception as e:
            logger.error(f"Gemini chat failed: {e}")
            return "Understood. I kept the reply short: protect the area you ranked first, and shrink the rest of this week."

    def _apply_priority_rebalance_mock(
        self,
        roadmap: FourWeekRoadmap,
        user_input: str,
        priorities: Dict[str, int],
        profile: StudentProfile,
    ) -> FourWeekRoadmap:
        """Put the person's own words at the top of week 1 when Gemini is offline."""
        key_to_category = {
            "Academic": TaskCategory.ACADEMIC,
            "Project": TaskCategory.PROJECT,
            "Career": TaskCategory.CAREER,
            "Fun": TaskCategory.WELLNESS,
        }
        best_key = min(priorities, key=lambda key: priorities.get(key, 4)) if priorities else "Academic"
        category = key_to_category.get(best_key, TaskCategory.ACADEMIC)
        note = (user_input or "").strip() or "Updated from your note."
        if roadmap.weeks:
            week = roadmap.weeks[0]
            week.tasks = [task for task in week.tasks if task.id != "w1_from_note"]
            week.tasks.insert(
                0,
                TaskItem(
                    id="w1_from_note",
                    title="From your note",
                    description=note,
                    category=category,
                    estimated_hours=1.5,
                    priority=PriorityLevel.HIGH,
                    due_info="This week",
                ),
            )
        short = note if len(note) <= 160 else note[:157] + "..."
        roadmap.executive_summary = f"Updated from what you wrote: {short}"
        roadmap.student_name = profile.display_name or roadmap.student_name
        return roadmap

    def generate_roadmap(
        self,
        profile: StudentProfile,
        syllabus_notes: Optional[str] = None
    ) -> FourWeekRoadmap:
        """
        Synthesizes a personalized 4-week onboarding plan matching the student's
        free hours, current skills (e.g. C++/Java), interests, and academic obligations.

        Args:
            profile: StudentProfile containing year, major, skills, interests, and free hours.
            syllabus_notes: Optional notes or syllabus extraction summary.

        Returns:
            FourWeekRoadmap instance containing weekly structured plans and tasks.
        """
        if not self.client:
            logger.info("Gemini client not initialized. Returning a plan for the areas they chose.")
            return self._build_personal_mock(profile)

        try:
            from google.genai import types

            syllabus_context = f"\nExtra notes:\n{syllabus_notes}" if syllabus_notes else ""
            focus = ", ".join(profile.focus_areas) if profile.focus_areas else "academia, career"
            prompt = f"""
            You are LaunchPad. Design a 4-week plan for this person. Pay attention only to the areas they chose.

            Person:
            - Name: {profile.display_name}
            - School: {profile.university or "not specified"}
            - Year: {profile.year or "not specified"}
            - Studying: {profile.major or "not specified"}
            - Classes: {", ".join(profile.current_classes) if profile.current_classes else "not specified"}
            - Interests: {", ".join(profile.interests) if profile.interests else "not specified"}
            - Hours outside class each week: {profile.free_hours_per_week}
            - Grade goal: {profile.gpa_goal}
            - Career aim: {profile.career_goal or "not specified"}
            - Areas to include: {focus}
            {syllabus_context}

            Directives:
            1. Do not assume UC San Diego or electrical engineering unless the profile says so.
            2. Each week has 3 to 5 concrete tasks.
            3. Task categories must be academic, project, career, or wellness, and only for areas they included.
            4. academia -> academic, career -> career, projects -> project, recovery -> wellness.
            5. Return JSON matching the FourWeekRoadmap schema.
            """

            response = self.client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=FourWeekRoadmap,
                    temperature=0.4,
                ),
            )

            # Parse JSON into Pydantic model
            raw_text = response.text
            roadmap_dict = json.loads(raw_text)
            return FourWeekRoadmap.model_validate(roadmap_dict)

        except Exception as e:
            logger.error(f"Error invoking Gemini API: {e}. Falling back to structured mock roadmap.")
            return self._build_personal_mock(profile)

    def _build_personal_mock(self, profile: StudentProfile) -> FourWeekRoadmap:
        """A calm 4-week plan that only includes the areas this person asked for."""
        focus = [area for area in ("academia", "career", "projects", "recovery") if area in (profile.focus_areas or [])]
        if not focus:
            focus = ["academia", "career"]
        classes = profile.current_classes or ["your hardest class"]
        primary = classes[0]
        secondary = classes[1] if len(classes) > 1 else primary
        career = (profile.career_goal or "the next step you care about").strip()
        interest = profile.interests[0] if profile.interests else "one small project you can finish"
        name = profile.display_name or "You"
        label = {
            "academia": "academia",
            "career": "career",
            "projects": "projects",
            "recovery": "recovery",
        }
        focus_text = ", ".join(label[area] for area in focus)

        def academic(task_id: str, title: str, description: str, hours: float, priority: PriorityLevel, due: str) -> TaskItem:
            return TaskItem(
                id=task_id,
                title=title,
                description=description,
                category=TaskCategory.ACADEMIC,
                estimated_hours=hours,
                priority=priority,
                due_info=due,
            )

        def career_task(task_id: str, title: str, description: str, hours: float, priority: PriorityLevel, due: str) -> TaskItem:
            return TaskItem(
                id=task_id,
                title=title,
                description=description,
                category=TaskCategory.CAREER,
                estimated_hours=hours,
                priority=priority,
                due_info=due,
            )

        def project_task(task_id: str, title: str, description: str, hours: float, priority: PriorityLevel, due: str) -> TaskItem:
            return TaskItem(
                id=task_id,
                title=title,
                description=description,
                category=TaskCategory.PROJECT,
                estimated_hours=hours,
                priority=priority,
                due_info=due,
            )

        def recovery_task(task_id: str, title: str, description: str, hours: float, priority: PriorityLevel, due: str) -> TaskItem:
            return TaskItem(
                id=task_id,
                title=title,
                description=description,
                category=TaskCategory.WELLNESS,
                estimated_hours=hours,
                priority=priority,
                due_info=due,
            )

        week_blueprints = [
            (
                1,
                "Start with what you picked",
                "Set up the few repeating blocks for this month. Leave the rest alone.",
                {
                    "academia": [
                        academic("w1_academia_1", f"Study block for {primary}", f"One sitting for {primary}. Stop when the block ends, even if the work is unfinished.", 2.5, PriorityLevel.HIGH, "Two sittings"),
                        academic("w1_academia_2", "Write down what is due this month", "List exams, problem sets, and anything with a date. This is the list the rest of the month protects.", 1.0, PriorityLevel.MEDIUM, "By midweek"),
                    ],
                    "career": [
                        career_task("w1_career_1", "Say the career step in one sentence", f"Write one sentence for this aim: {career}", 1.0, PriorityLevel.HIGH, "This week"),
                        career_task("w1_career_2", "Find two real leads", "Two people, postings, or teams that match the sentence. Save the links. Do not write to them yet.", 1.5, PriorityLevel.MEDIUM, "Before the weekend"),
                    ],
                    "projects": [
                        project_task("w1_project_1", f"Name the smallest finish for {interest}", "Decide what “done” means for the next four weeks. One outcome, not a whole vision.", 1.5, PriorityLevel.MEDIUM, "This week"),
                    ],
                    "recovery": [
                        recovery_task("w1_recovery_1", "Keep one evening with nothing scheduled", "Pick the evening now. Do not trade it for leftover work.", 2.0, PriorityLevel.MEDIUM, "This week"),
                    ],
                },
            ),
            (
                2,
                "Keep the same cadence",
                "Repeat the blocks that worked. Do not add a new area.",
                {
                    "academia": [
                        academic("w2_academia_1", f"Problem set or review for {primary}", f"Work the hardest part of {primary} while you are fresh.", 2.5, PriorityLevel.HIGH, "Early in the week"),
                        academic("w2_academia_2", f"Short review for {secondary}", f"A lighter pass on {secondary} so it does not pile up.", 1.5, PriorityLevel.MEDIUM, "Second sitting"),
                    ],
                    "career": [
                        career_task("w2_career_1", "Draft the note you might send", f"A short note about {career}. You do not have to send it this week.", 1.5, PriorityLevel.HIGH, "One sitting"),
                    ],
                    "projects": [
                        project_task("w2_project_1", f"One work session on {interest}", "Move the smallest finish forward. Stop at the end of the session.", 2.0, PriorityLevel.MEDIUM, "One sitting"),
                    ],
                    "recovery": [
                        recovery_task("w2_recovery_1", "Repeat the open evening", "Same kind of evening as last week. The point is that it happens twice.", 2.0, PriorityLevel.MEDIUM, "This week"),
                    ],
                },
            ),
            (
                3,
                "Protect the heavy week",
                "If class work and everything else collide, class work keeps the hours.",
                {
                    "academia": [
                        academic("w3_academia_1", f"Timed practice for {primary}", "Work under a time limit once, then check what you missed. That is the whole task.", 3.0, PriorityLevel.HIGH, "Before the heaviest day"),
                    ],
                    "career": [
                        career_task("w3_career_1", "Thirty minutes on the career step, then stop", "Read the draft or the two leads. Do not expand the search.", 0.5, PriorityLevel.LOW, "One short sitting"),
                    ],
                    "projects": [
                        project_task("w3_project_1", "Pause the project, tidy only", f"No new scope for {interest}. Write down where you stopped so next week is easy to resume.", 0.5, PriorityLevel.LOW, "Optional"),
                    ],
                    "recovery": [
                        recovery_task("w3_recovery_1", "Sleep before the heavy day", "The night before the hardest class day is part of the plan, not a reward after it.", 1.0, PriorityLevel.HIGH, "The night before"),
                    ],
                },
            ),
            (
                4,
                "Look one step ahead",
                "Close the month with one next step in each area you kept.",
                {
                    "academia": [
                        academic("w4_academia_1", "Compare the month with your grade goal", f"Look at {primary} and the grade you wanted ({profile.gpa_goal:.2f}). Decide one change for next month.", 1.5, PriorityLevel.HIGH, "End of the month"),
                    ],
                    "career": [
                        career_task("w4_career_1", "Send one message or submit one application", f"Use the sentence you wrote about {career}. One send is enough.", 1.5, PriorityLevel.HIGH, "This week"),
                    ],
                    "projects": [
                        project_task("w4_project_1", "Write down what exists now", f"A few sentences on where {interest} stands. Future you should be able to resume from this note.", 1.0, PriorityLevel.MEDIUM, "End of the month"),
                    ],
                    "recovery": [
                        recovery_task("w4_recovery_1", "Leave a half day unscheduled", "No catch-up block. The empty time is the task.", 3.0, PriorityLevel.MEDIUM, "This week"),
                    ],
                },
            ),
        ]

        weeks: List[WeeklyPlan] = []
        for number, theme, summary, grouped in week_blueprints:
            tasks: List[TaskItem] = []
            for area in focus:
                tasks.extend(grouped[area])
            total = sum(task.estimated_hours for task in tasks) or 1
            if total > profile.free_hours_per_week:
                scale = profile.free_hours_per_week / total
                for task in tasks:
                    task.estimated_hours = max(0.5, round(task.estimated_hours * scale, 1))
            weeks.append(
                WeeklyPlan(
                    week_number=number,
                    theme=theme,
                    focus_summary=summary,
                    allocated_hours=float(max(1.0, min(profile.free_hours_per_week, round(sum(task.estimated_hours for task in tasks), 1)))),
                    tasks=tasks,
                )
            )

        return FourWeekRoadmap(
            student_name=name,
            executive_summary=(
                f"{name}, this month stays on {focus_text}. "
                f"You set aside about {profile.free_hours_per_week} hours a week outside class. "
                f"Unchecked items are suggestions. Change them in your own words whenever you want."
            ),
            recommended_project=interest if "projects" in focus else "No project until you add that area.",
            recommended_clubs_labs=[],
            weeks=weeks,
        )

    def _build_mock_roadmap(self, profile: StudentProfile) -> FourWeekRoadmap:
        """
        Provides a realistic, structured fallback roadmap tailored specifically
        for a UCSD Electrical Engineering freshman aiming for a 3.8+ GPA.
        """
        primary_interest = profile.interests[0] if profile.interests else "Embedded Systems & Robotics"
        target_skills = ", ".join(profile.skills) if profile.skills else "C++ / Circuit Analysis"

        return FourWeekRoadmap(
            student_name=profile.display_name or "Alex Rivera",
            executive_summary=(
                f"{profile.display_name or 'Alex Rivera'} is a first-year electrical engineering student at UC San Diego, "
                f"aiming for a {profile.gpa_goal:.2f} GPA. "
                f"With about {profile.free_hours_per_week} hours a week outside lectures, this example keeps ECE 5, MATH 20A, and PHYS 2A first, "
                f"then a small robot, then lab outreach, with a little time left for dance class and the gym."
            ),
            recommended_project="Autonomous Optical Line-Tracking Sensor Pod (C++ & Microcontroller)",
            recommended_clubs_labs=[
                "IEEE at UCSD - Quarterly Student Projects",
                "Triton Robosub - Autonomous Robotics Subteam",
                "Jacobs Hall Contextual Robotics Institute (CRI)",
                "Eta Kappa Nu (HKN) ECE Tutoring",
            ],
            weeks=[
                WeeklyPlan(
                    week_number=1,
                    theme="Jacobs Hall Tooling & ECE 5 Lab Foundations",
                    focus_summary="Set up clean local C++ toolchain, Git repository, and familiarize with Jacobs Hall ECE makerspace safety.",
                    allocated_hours=min(profile.free_hours_per_week, 12),
                    tasks=[
                        TaskItem(
                            id="w1_t1",
                            title="Configure C++ Toolchain & GitHub SSH Key",
                            description="Install modern compiler (Clang/GCC), VS Code C++ extensions, and configure repository for ECE coursework.",
                            category=TaskCategory.ACADEMIC,
                            estimated_hours=2.0,
                            priority=PriorityLevel.HIGH,
                            due_info="By Wednesday",
                            link="https://ece.ucsd.edu/",
                        ),
                        TaskItem(
                            id="w1_t2",
                            title="Breadboard Telemetry Scaffold (ECE 5 Hands-on)",
                            description="Wire phototransistor sensor pair to ADC pin, test resistor voltage divider, and verify readings via serial monitor.",
                            category=TaskCategory.PROJECT,
                            estimated_hours=3.5,
                            priority=PriorityLevel.HIGH,
                            due_info="Thursday Lab Check-in",
                        ),
                        TaskItem(
                            id="w1_t3",
                            title="Attend IEEE at UCSD General Body Meeting",
                            description="Connect with upperclassmen who completed ECE 35/45 and learn about the MicroMouse robotics workshop.",
                            category=TaskCategory.CAREER,
                            estimated_hours=1.5,
                            priority=PriorityLevel.MEDIUM,
                            due_info="Wednesday 6:30 PM",
                        ),
                        TaskItem(
                            id="w1_t4",
                            title="MATH 20A / 18 Diagnostic Problem Set",
                            description="Complete first derivative & limit review packet to calibrate study pace for the 3.8+ GPA target.",
                            category=TaskCategory.ACADEMIC,
                            estimated_hours=2.5,
                            priority=PriorityLevel.HIGH,
                        ),
                    ],
                ),
                WeeklyPlan(
                    week_number=2,
                    theme="Sensor Calibration & Algorithmic Loop",
                    focus_summary="Write modular C++ firmware for analog sensor thresholding and establish office hours cadence.",
                    allocated_hours=min(profile.free_hours_per_week, 13),
                    tasks=[
                        TaskItem(
                            id="w2_t1",
                            title="Write Sensor Filtering & PID Proportional Control",
                            description="Implement basic moving average filter in C++ to smooth raw analog sensor jitter.",
                            category=TaskCategory.PROJECT,
                            estimated_hours=4.0,
                            priority=PriorityLevel.HIGH,
                        ),
                        TaskItem(
                            id="w2_t2",
                            title="Attend ECE Faculty / TA Office Hours in Jacobs Hall",
                            description="Review nodal analysis or calculus homework questions; establish rapport with professor.",
                            category=TaskCategory.ACADEMIC,
                            estimated_hours=1.5,
                            priority=PriorityLevel.HIGH,
                        ),
                        TaskItem(
                            id="w2_t3",
                            title="Format UCSD Engineering Resume (1-Page)",
                            description="Highlight high school/freshman technical projects, coursework (ECE 5, MATH 20A), and lab proficiencies.",
                            category=TaskCategory.CAREER,
                            estimated_hours=2.0,
                            priority=PriorityLevel.MEDIUM,
                        ),
                    ],
                ),
                WeeklyPlan(
                    week_number=3,
                    theme="Academic Shield: Midterm 1 & Exam Defense",
                    focus_summary="Freeze non-critical extracurricular builds to safeguard GPA for the 3.8+ target.",
                    allocated_hours=min(profile.free_hours_per_week, 10),
                    tasks=[
                        TaskItem(
                            id="w3_t1",
                            title="Timed Calculus / Physics Midterm 1 Practice Exam",
                            description="Complete 2 past midterms from the UCSD test bank under strict 50-minute exam conditions.",
                            category=TaskCategory.ACADEMIC,
                            estimated_hours=4.5,
                            priority=PriorityLevel.HIGH,
                        ),
                        TaskItem(
                            id="w3_t2",
                            title="Breadboard Code Freeze & Clean Wiring Harness",
                            description="Tidy jumper wires and document pinouts without adding risky new hardware components.",
                            category=TaskCategory.PROJECT,
                            estimated_hours=1.5,
                            priority=PriorityLevel.LOW,
                        ),
                        TaskItem(
                            id="w3_t3",
                            title="Cognitive Sleep Buffer (Pre-Exam Night)",
                            description="Ensure 8 hours of sleep before Thursday exam; avoid late-night cramming.",
                            category=TaskCategory.WELLNESS,
                            estimated_hours=1.0,
                            priority=PriorityLevel.HIGH,
                        ),
                    ],
                ),
                WeeklyPlan(
                    week_number=4,
                    theme="Project Demo, Git Showcase & Lab Outreach",
                    focus_summary="Record 60-second hardware demo video, publish GitHub README, and reach out to Jacobs Hall research labs.",
                    allocated_hours=min(profile.free_hours_per_week, 12),
                    tasks=[
                        TaskItem(
                            id="w4_t1",
                            title="Publish Hardware Demo Video & GitHub README",
                            description="Include wiring schematic, brief video demonstration, and modular C++ code.",
                            category=TaskCategory.PROJECT,
                            estimated_hours=3.0,
                            priority=PriorityLevel.HIGH,
                        ),
                        TaskItem(
                            id="w4_t2",
                            title="Cold Outreach to UCSD Robotics Lab (CRI / RESL)",
                            description="Send personalized email referencing a recent lab publication with your GitHub portfolio linked.",
                            category=TaskCategory.CAREER,
                            estimated_hours=2.0,
                            priority=PriorityLevel.HIGH,
                        ),
                        TaskItem(
                            id="w4_t3",
                            title="Quarter Milestone Retrospective & Spring Planning",
                            description="Evaluate course grades against the 3.8 GPA goal and plan enrollments for ECE 15 / ECE 25.",
                            category=TaskCategory.WELLNESS,
                            estimated_hours=1.0,
                            priority=PriorityLevel.MEDIUM,
                        ),
                    ],
                ),
            ],
        )
