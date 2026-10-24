"""
xAI Grok Service Wrapper.

Handles real-time dynamic schedule triage, crisis rebalancing, and conversational
mentoring for first-time engineering students via xAI's Grok API.
"""

import os
import json
import logging
from typing import List, Optional, Dict, Any
from dotenv import load_dotenv

from models.schemas import (
    ScheduleRebalanceDiff,
    TriageAction,
    FourWeekRoadmap,
    StudentProfile,
    ChatMessage,
    TaskCategory,
)

load_dotenv()
logger = logging.getLogger(__name__)


class GrokService:
    """Service wrapper for xAI Grok dynamic schedule triage and mentoring."""

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize xAI Grok client using OpenAI-compatible SDK interface.
        """
        self.api_key = api_key or os.getenv("XAI_API_KEY", "")
        self.client = None
        self.model_name = "grok-2-latest"
        self._init_client()

    def _init_client(self) -> None:
        """Internal helper to initialize the OpenAI client pointed to xAI endpoint."""
        if not self.api_key:
            logger.warning("XAI_API_KEY not configured. Running GrokService in mock/fallback mode.")
            return

        try:
            from openai import OpenAI
            self.client = OpenAI(
                api_key=self.api_key,
                base_url="https://api.x.ai/v1",
            )
            logger.info("Successfully initialized xAI Grok client.")
        except ImportError:
            logger.warning("openai package not installed. Operating in mock mode.")
            self.client = None
        except Exception as e:
            logger.error(f"Error initializing xAI Grok client: {e}")
            self.client = None

    def triage_schedule(
        self,
        user_query: str,
        current_week: int,
        roadmap: FourWeekRoadmap,
        profile: StudentProfile,
        chat_history: Optional[List[ChatMessage]] = None,
    ) -> ScheduleRebalanceDiff:
        """
        Evaluates a student's schedule conflict or distress signal (e.g. 'Midterm on Thursday, what should I drop?')
        and produces concrete triage recommendations.

        Args:
            user_query: The student's message (e.g. 'I'm behind on Calc and have an exam Thursday').
            current_week: The current active week index (1-4).
            roadmap: The student's current FourWeekRoadmap.
            profile: The student's background and goals.
            chat_history: Optional prior messages in the session.

        Returns:
            ScheduleRebalanceDiff with summary, actions, and mentor note.
        """
        if not self.client:
            logger.info("xAI Grok client not available. Generating intelligent mock triage diff.")
            return self._build_mock_triage(user_query, current_week, roadmap)

        try:
            # Extract current week's active tasks
            week_plan = next((w for w in roadmap.weeks if w.week_number == current_week), None)
            tasks_context = ""
            if week_plan:
                tasks_context = "\n".join(
                    [f"- ID: {t.id} | [{t.category.upper()}] {t.title} ({t.estimated_hours}h, Priority: {t.priority})"
                     for t in week_plan.tasks]
                )

            system_prompt = (
                "You are Grok, an experienced, candid, and supportive Senior Engineering Mentor. "
                "Your job is to triage student workloads when life or midterms disrupt plans. "
                "Core Philosophy: "
                "1. Academic GPA and core prerequisites come first during exam weeks. "
                "2. Extracurricular projects can be paused or postponed without guilt. "
                "3. Recommend specific actions: drop, postpone, keep, or compress. "
                "4. Return strict JSON matching the schema: "
                "{\n"
                '  "summary": "...",\n'
                '  "actions": [{"action": "postpone", "task_id": "...", "task_title": "...", "reason": "...", "new_target_week": 3}],\n'
                '  "mentor_note": "..."\n'
                "}"
            )

            user_prompt = f"""
            Student Background:
            - Major: {profile.major} ({profile.year})
            - GPA Goal: {profile.gpa_goal}
            - Current Week: Week {current_week}

            Current Week Tasks:
            {tasks_context}

            Student Distress / Inquiry:
            "{user_query}"

            Provide triage recommendations to protect their GPA and mental clarity while keeping them on track long-term.
            """

            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.3,
                response_format={"type": "json_object"},
            )

            raw_json = response.choices[0].message.content
            parsed_data = json.loads(raw_json)
            return ScheduleRebalanceDiff.model_validate(parsed_data)

        except Exception as e:
            logger.error(f"Grok triage API call failed: {e}. Falling back to default rebalance.")
            return self._build_mock_triage(user_query, current_week, roadmap)

    def chat_mentor(
        self,
        user_query: str,
        chat_history: List[ChatMessage],
        profile: StudentProfile,
    ) -> str:
        """
        General engineering mentorship chat (study techniques, career paths, imposter syndrome).

        Args:
            user_query: User message.
            chat_history: Ongoing session history.
            profile: StudentProfile context.

        Returns:
            Mentor response string.
        """
        if not self.client:
            return (
                f"Hey {profile.year}! Grok Mentor here. First off, take a deep breath. "
                f"Every engineer faces weeks where coursework feels overwhelming. "
                f"Your priority right now is protecting your fundamental GPA. "
                f"Let me know if you want me to automatically freeze your starter project tasks this week!"
            )

        try:
            messages = [
                {
                    "role": "system",
                    "content": (
                        "You are Grok, an elite engineering mentor assisting a first-time engineering student. "
                        f"Student is a {profile.year} studying {profile.major}. "
                        "Tone: Direct, encouraging, technical, pragmatic, and de-stressing. "
                        "Give actionable, bite-sized engineering advice."
                    ),
                }
            ]

            for msg in chat_history[-6:]:
                messages.append({"role": msg.role, "content": msg.content})

            messages.append({"role": "user", "content": user_query})

            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=messages,
                temperature=0.7,
            )
            return response.choices[0].message.content or "Let's regroup and tackle this one step at a time."

        except Exception as e:
            logger.error(f"Grok chat failed: {e}")
            return "Hang in there! Focus on the immediate priority in front of you. What exam or assignment is closest?"

    def advise(self, user_query: str, tasks: list, profile: StudentProfile) -> ScheduleRebalanceDiff:
        """Pressure-test the current task list. The caller still asks before applying."""
        if not self.client:
            return self._advise_offline(user_query, tasks)
        try:
            task_lines = "\n".join(
                f"- ID: {task.id} | {task.category.value if hasattr(task.category, 'value') else task.category} | "
                f"{task.title} | when={task.when} | {task.estimated_hours}h"
                for task in tasks
            )
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are Grok, a direct scheduling coach. Protect academic and career work. "
                            "Return JSON with summary, mentor_note, and actions. "
                            "Each action has action (postpone, compress, keep, drop), task_id, task_title, reason, new_target_week."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"{profile.display_name} studies {profile.major or 'an unspecified subject'}. "
                            f"Grade goal {profile.gpa_goal}. Career aim: {profile.career_goal or 'unspecified'}.\n"
                            f"Tasks:\n{task_lines}\n\nThey said: {user_query}"
                        ),
                    },
                ],
                temperature=0.3,
                response_format={"type": "json_object"},
            )
            return ScheduleRebalanceDiff.model_validate(json.loads(response.choices[0].message.content))
        except Exception as exc:
            logger.error("Grok advise failed: %s", exc)
            return self._advise_offline(user_query, tasks)

    def _advise_offline(self, user_query: str, tasks: list) -> ScheduleRebalanceDiff:
        lowered = user_query.lower()
        behind = any(word in lowered for word in ("behind", "exam", "midterm", "overwhelmed", "too much"))
        actions = []
        if behind:
            for task in tasks:
                category = task.category.value if hasattr(task.category, "value") else str(task.category)
                if category not in {"academic", "career"} and getattr(task, "when", "this_week") == "this_week":
                    actions.append(
                        TriageAction(
                            action="postpone",
                            task_id=task.id,
                            task_title=task.title,
                            reason="Move this off the week so class and career work keep the hours.",
                            new_target_week=None,
                        )
                    )
            summary = "Keep academia and career on this week. Move the rest to Upcoming."
            note = "Apply this only if you want the week narrowed. Nothing has moved yet."
        else:
            hour_goals = [task for task in tasks if getattr(task, "timing", None) and str(getattr(task.timing, "value", task.timing)) == "hour_goal"]
            if hour_goals:
                largest = max(hour_goals, key=lambda task: task.estimated_hours)
                actions.append(
                    TriageAction(
                        action="compress",
                        task_id=largest.id,
                        task_title=largest.title,
                        reason="Cut the weekly total a little so the free hours can hold it.",
                    )
                )
            summary = "The week can get lighter without touching the fixed class times."
            note = "This is a suggestion. Confirm it before the list changes."
        if not actions:
            actions.append(
                TriageAction(action="keep", task_id=None, task_title="This week", reason="Nothing here needs to move.")
            )
        return ScheduleRebalanceDiff(summary=summary, actions=actions, mentor_note=note)

    def _build_mock_triage(
        self,
        user_query: str,
        current_week: int,
        roadmap: FourWeekRoadmap
    ) -> ScheduleRebalanceDiff:
        """Fallback triage that moves tasks actually present on the selected week."""
        query_lower = user_query.lower()
        week_plan = next((week for week in roadmap.weeks if week.week_number == current_week), None)
        tasks = list(week_plan.tasks) if week_plan else []
        exam_week = any(word in query_lower for word in ("midterm", "exam", "test", "grade", "protect", "priority"))

        actions: List[TriageAction] = []
        if exam_week:
            summary = "Exam week: keep class work on this week, and move the other items forward."
            mentor_note = "The grade is the constraint this week. The other work can wait a few days."
            movable = [task for task in tasks if task.category != TaskCategory.ACADEMIC]
            kept = [task for task in tasks if task.category == TaskCategory.ACADEMIC]
            for task in movable:
                if current_week >= 4:
                    actions.append(
                        TriageAction(
                            action="compress",
                            task_id=task.id,
                            task_title=task.title,
                            reason="This is the last week, so the block is shortened instead of moved.",
                        )
                    )
                else:
                    actions.append(
                        TriageAction(
                            action="postpone",
                            task_id=task.id,
                            task_title=task.title,
                            reason="Move this so the exam has the hours.",
                            new_target_week=min(current_week + 1, 4),
                        )
                    )
            for task in kept:
                actions.append(
                    TriageAction(
                        action="keep",
                        task_id=task.id,
                        task_title=task.title,
                        reason="Keep this. It is the class work.",
                    )
                )
            if not movable:
                mentor_note = "This week is already class work. There is nothing else here to move."
        else:
            summary = "A lighter week: the longest block gets cut down."
            mentor_note = "Shorter blocks are easier to finish. You can add the time back next week."
            if tasks:
                longest = max(tasks, key=lambda task: task.estimated_hours)
                actions.append(
                    TriageAction(
                        action="compress",
                        task_id=longest.id,
                        task_title=longest.title,
                        reason="Cut this block in half so the week fits.",
                    )
                )

        if not actions:
            actions.append(
                TriageAction(
                    action="keep",
                    task_id=None,
                    task_title="Your current list",
                    reason="Nothing on this week needs a change yet.",
                )
            )

        return ScheduleRebalanceDiff(summary=summary, actions=actions, mentor_note=mentor_note)
