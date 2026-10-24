"""
Opportunity ranker.

Scores each UCSD opportunity from 0 to 100 against a student profile, with a
one-line "why this fits you". Scoring is deterministic and needs no API key.
Gemini can optionally reword the "why" lines for the top results when a client
is already configured; it never changes the order or the scores.
"""

import hashlib
import json
import logging
import math
import re
import time
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple

from models.schemas import StudentProfile
from services.ucsd_catalog import UCSD_OPPORTUNITIES, UCSDOpportunity

logger = logging.getLogger(__name__)

# Points per signal (they add up to 100).
TOPIC_POINTS = 40
YEAR_POINTS = 20
GOAL_TYPE_POINTS = 15
MAJOR_POINTS = 15
LEVEL_POINTS = 10

# How much each part of the profile counts when it names a topic.
SOURCE_WEIGHT = {"interests": 1.0, "goals": 1.0, "skills": 0.5, "major": 0.4, "resume": 0.3}

# Words that signal the student wants a kind of opportunity.
TYPE_WORDS = {
    "research": ["research", "lab", "professor", "phd", "graduate"],
    "internship": ["internship", "intern", "industry", "job", "summer", "career"],
    "club": ["club", "team", "community", "organization"],
    "project": ["project", "build", "hands-on", "team", "hardware"],
    "hackathon": ["hackathon", "hack"],
    "scholarship": ["scholarship", "funding", "financial", "grant", "tuition"],
    "event": ["event", "networking", "fair", "conference", "talk", "workshop"],
}

YEAR_WORDS = (
    (1, ("first", "freshman", "1st", "frosh")),
    (2, ("second", "sophomore", "2nd")),
    (3, ("third", "junior", "3rd")),
    (4, ("fourth", "senior", "4th", "fifth")),
)
TYPE_NOUN = {
    "research": "research position", "internship": "internship", "club": "club or team", "project": "hands-on project",
    "hackathon": "hackathon", "scholarship": "scholarship", "event": "event",
}
YEAR_LABEL = {1: "first-years", 2: "second-years", 3: "third-years", 4: "fourth-years"}
STOPWORDS = {"and", "of", "the", "a", "an", "to", "in", "for", "on", "with", "or"}
_SUFFIXES = ("ics", "ing", "ers", "er", "ed", "es", "s")


@dataclass
class RankedOpportunity:
    opportunity: UCSDOpportunity
    score: int
    why: str
    why_source: str = "rules"


def _stem(word: str) -> str:
    if len(word) > 4:
        for suffix in _SUFFIXES:
            if word.endswith(suffix) and len(word) - len(suffix) >= 3:
                return word[: -len(suffix)]
    return word


def _stems(text: str) -> set:
    words = re.findall(r"[a-z0-9]+(?:\+\+|#)?", (text or "").lower())
    return {_stem(w) for w in words if w not in STOPWORDS}


def _flatten(value: Any) -> str:
    """Turn a string, list, or nested dict (such as a parsed resume) into plain text. Skips '_' keys and contact info."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return " ".join(_flatten(v) for k, v in value.items() if not str(k).startswith("_") and k not in ("contact", "name"))
    if isinstance(value, (list, tuple, set)):
        return " ".join(_flatten(v) for v in value)
    return str(value)


def parse_year(text: str) -> Optional[int]:
    """Read '1', 'First year', 'sophomore', '3rd year' and similar as 1 to 4. Returns None when unknown."""
    lowered = (text or "").lower()
    for year, words in YEAR_WORDS:
        if any(re.search(rf"\b{re.escape(w)}\b", lowered) for w in words):
            return year
    match = re.search(r"\b([1-5])\b", lowered)
    if match:
        return min(int(match.group(1)), 4)
    return None


def _profile_sources(profile: StudentProfile, resume: Any, goals: Any) -> Dict[str, str]:
    """Group the profile text by where it came from, so interests count more than resume lines."""
    return {
        "interests": _flatten(getattr(profile, "interests", [])),
        "goals": " ".join([_flatten(getattr(profile, "career_goal", "")), _flatten(goals)]),
        "skills": _flatten(getattr(profile, "skills", [])),
        "major": " ".join([_flatten(getattr(profile, "major", "")), _flatten(getattr(profile, "current_classes", []))]),
        "resume": " ".join([_flatten(resume if resume is not None else getattr(profile, "resume", "")), _flatten(getattr(profile, "notes", ""))]),
    }


def _topic_matches(opp: UCSDOpportunity, source_stems: Dict[str, set]) -> List[Tuple[float, str, str]]:
    """For each opportunity tag, the best (weight, tag, source) found in the profile."""
    found = []
    for tag in opp.tags:
        tag_stems = _stems(tag)
        if not tag_stems:
            continue
        best = (0.0, "")
        for source, stems in source_stems.items():
            share = len(tag_stems & stems) / len(tag_stems)
            if share == 1:
                strength = 1.0
            elif share >= 0.5 and len(tag_stems) > 1:
                strength = 0.5
            else:
                strength = 0.0
            weight = strength * SOURCE_WEIGHT[source]
            if weight > best[0]:
                best = (weight, source)
        if best[0] > 0:
            found.append((best[0], tag, best[1]))
    return sorted(found, key=lambda item: -item[0])


def _major_fit(opp: UCSDOpportunity, major: str) -> Tuple[float, bool]:
    """(points fraction, explicit match). Unknown major or an any-major opportunity is neutral."""
    if not opp.majors:
        return 0.65, False
    words = re.findall(r"[a-z]+", major.lower())
    if not words:
        return 0.5, False
    if any(w.startswith(k) for k in opp.majors for w in words):
        return 1.0, True
    return 0.0, False


def _year_fit(opp: UCSDOpportunity, year: Optional[int]) -> float:
    if year is None:
        return 0.5
    if opp.min_year <= year <= opp.max_year:
        return 1.0
    gap = opp.min_year - year if year < opp.min_year else year - opp.max_year
    return 0.4 if gap == 1 else 0.0


def _level_fit(opp: UCSDOpportunity, year: Optional[int]) -> float:
    if year is None:
        return 0.6
    early = year <= 2
    if opp.beginner_friendly:
        return 1.0 if early else 0.6
    return 0.2 if early else 1.0


def _type_fit(opp: UCSDOpportunity, intent_stems: Dict[str, set]) -> float:
    """1.0 when the student's goals or interests name this type of opportunity, 0.4 when only the resume does."""
    if not any(intent_stems.values()):
        return 0.4
    words = {_stem(w) for w in TYPE_WORDS.get(opp.type, [opp.type])}
    best = 0.0
    for source, stems in intent_stems.items():
        if words & stems:
            best = max(best, 1.0 if source in ("goals", "interests") else 0.4)
    return best


def _why(opp: UCSDOpportunity, matches, year: Optional[int], major_match: bool, year_fit: float, type_fit: float) -> str:
    parts = []
    grouped: Dict[str, List[str]] = {}
    for _, tag, source in matches[:3]:
        grouped.setdefault(source, []).append(tag)
    topics = [f"your {source} ({', '.join(tags)})" for source, tags in grouped.items()]
    if topics:
        parts.append("Fits " + " and ".join(topics[:2]))
    if type_fit >= 0.9:
        parts.append(f"the kind of {TYPE_NOUN.get(opp.type, opp.type)} you are after")
    beginner = opp.beginner_friendly and (year is None or year <= 2) and year_fit > 0
    if year is not None and year_fit == 1.0:
        parts.append(f"open to {YEAR_LABEL[year]}" + (" and beginner-friendly" if beginner else ""))
    elif year is not None and year_fit == 0.4:
        parts.append("a stretch for your year")
    elif beginner:
        parts.append("beginner-friendly")
    if major_match and len(parts) < 3:
        parts.append("suits your major")
    if not parts:
        return "A general campus opportunity worth a look."
    line = "; ".join(parts)
    return line[0].upper() + line[1:] + "."


def rank_opportunities(
    profile: Optional[StudentProfile],
    resume: Any = None,
    goals: Any = None,
    opportunities: Optional[Iterable[UCSDOpportunity]] = None,
) -> List[RankedOpportunity]:
    """
    Score and sort opportunities for a student, highest first.

    resume and goals may be text or nested data; both are optional. Missing or
    empty profile fields get a neutral score instead of an error.
    """
    profile = profile or StudentProfile()
    pool = list(opportunities) if opportunities is not None else list(UCSD_OPPORTUNITIES)
    sources = _profile_sources(profile, resume, goals)
    source_stems = {k: _stems(v) for k, v in sources.items()}
    intent_stems = {k: source_stems[k] for k in ("goals", "interests", "resume")}
    year = parse_year(getattr(profile, "year", ""))
    major = getattr(profile, "major", "") or ""

    ranked = []
    for opp in pool:
        matches = _topic_matches(opp, source_stems)
        topic = 1 - math.exp(-sum(m[0] for m in matches) / 2.5)
        major_fit, major_match = _major_fit(opp, major)
        year_fit = _year_fit(opp, year)
        type_fit = _type_fit(opp, intent_stems)
        total = (
            TOPIC_POINTS * topic
            + YEAR_POINTS * year_fit
            + GOAL_TYPE_POINTS * type_fit
            + MAJOR_POINTS * major_fit
            + LEVEL_POINTS * _level_fit(opp, year)
        )
        if opp.majors and major.strip() and not major_match:
            total *= 0.6  # built for a different major
        if year_fit == 0.0:
            total *= 0.7  # outside the years it is open to
        ranked.append(RankedOpportunity(opp, int(round(max(0, min(100, total)))), _why(opp, matches, year, major_match, year_fit, type_fit)))
    ranked.sort(key=lambda r: (-r.score, r.opportunity.title))
    return ranked


# ---- Optional Gemini wording -------------------------------------------------

_WHY_CACHE: Dict[str, Tuple[float, Dict[str, str]]] = {}
_RETRY_AFTER_SECONDS = 60  # a failed or empty Gemini reply is not retried on every rerun


def refine_reasons(
    ranked: List[RankedOpportunity],
    profile: Optional[StudentProfile],
    gemini_service: Any = None,
    top_n: int = 6,
) -> List[RankedOpportunity]:
    """
    Let Gemini reword the "why" line for the top results. Only runs when the
    service already has a live client. Any problem leaves the rule-based lines
    untouched. Scores and order never change.
    """
    client = getattr(gemini_service, "client", None)
    if client is None or not ranked:
        return ranked
    profile = profile or StudentProfile()
    top = ranked[:top_n]
    facts = {
        "year": profile.year, "major": profile.major, "skills": profile.skills, "interests": profile.interests,
        "career_goal": profile.career_goal, "notes": (profile.notes or "")[:600],
    }
    key = hashlib.sha1(json.dumps([facts, [(r.opportunity.id, r.score) for r in top]], sort_keys=True, default=str).encode()).hexdigest()
    cached = _WHY_CACHE.get(key)
    if cached is None or (not cached[1] and time.time() - cached[0] > _RETRY_AFTER_SECONDS):
        items = [{"id": r.opportunity.id, "title": r.opportunity.title, "type": r.opportunity.type,
                  "about": r.opportunity.summary, "score": r.score, "reason": r.why} for r in top]
        prompt = (
            "You write one-line reasons an opportunity fits a student. Use only the facts given. "
            "Each reason is one sentence of at most 22 words, plain and specific, with no hype.\n"
            f"Student: {json.dumps(facts, default=str)}\nOpportunities: {json.dumps(items)}\n"
            'Return JSON only, shaped like {"<id>": "<reason>"}.'
        )
        try:
            from google.genai import types
            from services.gemini_service import GEMINI_MODEL

            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0.3),
            )
            data = json.loads(response.text)
            reasons = {k: v.strip() for k, v in data.items() if isinstance(v, str) and v.strip()} if isinstance(data, dict) else {}
        except Exception as exc:  # any failure keeps the rule-based lines
            logger.warning("Gemini reason refinement skipped: %s", exc)
            reasons = {}
        if len(_WHY_CACHE) > 32:
            _WHY_CACHE.clear()
        _WHY_CACHE[key] = (time.time(), reasons)
        cached = _WHY_CACHE[key]
    reasons = cached[1]
    refined = []
    for r in ranked:
        text = reasons.get(r.opportunity.id)
        if text and len(text) <= 240:
            refined.append(RankedOpportunity(r.opportunity, r.score, text, "gemini"))
        else:
            refined.append(r)
    return refined
