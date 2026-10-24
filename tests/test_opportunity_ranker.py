"""Tests for services.opportunity_ranker. Run: python -m unittest discover -s tests -v (from the repo root). No API key or network needed."""

import json
import sys
import unittest
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from models.schemas import StudentProfile  # noqa: E402
from services.opportunity_ranker import _WHY_CACHE, parse_year, rank_opportunities, refine_reasons  # noqa: E402
from services.ucsd_catalog import OPPORTUNITY_TYPES, UCSD_OPPORTUNITIES  # noqa: E402

DEMO = json.loads((ROOT / "tests" / "fixtures" / "demo_profile.json").read_text())


def demo_ranking():
    profile = StudentProfile.model_validate(DEMO["profile"])
    goals = [g["title"] for g in DEMO["goals"]] + DEMO["preferences"]["opportunity_types"]
    return rank_opportunities(profile, resume=DEMO["resume"], goals=goals)


def bioe_ranking():
    profile = StudentProfile(
        year="Sophomore", major="Bioengineering", skills=["Python", "Lab safety", "PCR"],
        interests=["Medical devices", "Tissue engineering"], career_goal="Biotech internship next summer",
    )
    return rank_opportunities(profile)


def cs_ranking():
    profile = StudentProfile(
        year="1", major="Computer Science", skills=["Python", "JavaScript"],
        interests=["Web development", "Hackathons", "Machine learning"], career_goal="Software internship",
    )
    return rank_opportunities(profile)


class RankerTests(unittest.TestCase):
    def test_catalog_has_every_type_and_valid_fields(self):
        self.assertEqual({o.type for o in UCSD_OPPORTUNITIES}, set(OPPORTUNITY_TYPES))
        self.assertEqual(len({o.id for o in UCSD_OPPORTUNITIES}), len(UCSD_OPPORTUNITIES))
        for opp in UCSD_OPPORTUNITIES:
            self.assertLessEqual(opp.min_year, opp.max_year)

    def test_scores_in_range_sorted_and_explained(self):
        for ranked in (demo_ranking(), bioe_ranking(), cs_ranking()):
            scores = [r.score for r in ranked]
            self.assertEqual(scores, sorted(scores, reverse=True))
            self.assertTrue(all(0 <= s <= 100 for s in scores))
            self.assertTrue(all(r.why.strip() and r.opportunity.type for r in ranked))
            self.assertEqual(len(ranked), len(UCSD_OPPORTUNITIES))

    def test_demo_freshman_ee_gets_hardware_robotics_and_research_first(self):
        ranked = demo_ranking()
        top_ids = [r.opportunity.id for r in ranked[:6]]
        for expected in ("robosub", "e4e", "ieee-projects", "hardware-intern", "ug-research"):
            self.assertIn(expected, top_ids)
        by_id = {r.opportunity.id: r.score for r in ranked}
        # Beginner-open research outranks lab research aimed at upper years
        self.assertGreater(by_id["ug-research"], by_id["cosman"])
        # A bioengineering lab ranks below the robotics ones for an EE student
        self.assertGreater(by_id["robosub"], by_id["bioe-research"] + 30)

    def test_rankings_differ_sensibly_between_profiles(self):
        bioe = [r.opportunity.id for r in bioe_ranking()[:5]]
        self.assertIn("bioe-research", bioe)
        self.assertIn("biomed-intern", bioe)
        self.assertNotIn("robosub", bioe)
        cs = [r.opportunity.id for r in cs_ranking()[:6]]
        self.assertIn("acm-hack-school", cs)
        self.assertIn("diamondhacks", cs)
        self.assertNotIn("bioe-research", cs)

    def test_year_changes_eligibility(self):
        by_year = {}
        for year in ("First year", "Junior"):
            profile = StudentProfile(year=year, major="Electrical Engineering", interests=["Robotics research"])
            by_year[year] = {r.opportunity.id: r for r in rank_opportunities(profile)}
        self.assertGreater(by_year["Junior"]["cri"].score, by_year["First year"]["cri"].score)
        self.assertIn("stretch", by_year["First year"]["cri"].why)
        self.assertNotIn("stretch", by_year["Junior"]["cri"].why)

    def test_empty_and_missing_profile_does_not_crash(self):
        for profile in (None, StudentProfile(), StudentProfile(year="???", major="", interests=[], skills=[], career_goal=None, notes="")):
            ranked = rank_opportunities(profile)
            self.assertEqual(len(ranked), len(UCSD_OPPORTUNITIES))
            self.assertTrue(all(0 <= r.score <= 100 for r in ranked))

    def test_resume_text_and_goals_are_optional_inputs(self):
        profile = StudentProfile(year="Second year", major="Electrical Engineering")
        plain = {r.opportunity.id: r.score for r in rank_opportunities(profile)}
        with_resume = {r.opportunity.id: r.score for r in rank_opportunities(profile, resume="Built a line following robot with Arduino and C++")}
        self.assertGreater(with_resume["robosub"], plain["robosub"])

    def test_parse_year(self):
        self.assertEqual(parse_year("First year"), 1)
        self.assertEqual(parse_year("sophomore"), 2)
        self.assertEqual(parse_year("3rd year"), 3)
        self.assertEqual(parse_year("Senior"), 4)
        self.assertEqual(parse_year("2"), 2)
        self.assertIsNone(parse_year(""))
        self.assertIsNone(parse_year("grad student"))


class RefineTests(unittest.TestCase):
    def setUp(self):
        self.profile = StudentProfile.model_validate(DEMO["profile"])
        self.ranked = demo_ranking()
        _WHY_CACHE.clear()

    def test_no_client_leaves_rankings_unchanged(self):
        self.assertIs(refine_reasons(self.ranked, self.profile, None), self.ranked)
        self.assertIs(refine_reasons(self.ranked, self.profile, SimpleNamespace(client=None)), self.ranked)

    def test_failing_client_falls_back_to_rule_based_lines(self):
        def boom(**_):
            raise RuntimeError("network down")

        client = SimpleNamespace(models=SimpleNamespace(generate_content=boom))
        out = refine_reasons(self.ranked, self.profile, SimpleNamespace(client=client))
        self.assertEqual([(r.score, r.why, r.why_source) for r in out], [(r.score, r.why, r.why_source) for r in self.ranked])

    def test_gemini_text_replaces_why_only_and_keeps_order(self):
        top_id = self.ranked[0].opportunity.id
        reply = SimpleNamespace(text=json.dumps({top_id: "Matches your embedded interest.", "unknown": "ignored"}))
        client = SimpleNamespace(models=SimpleNamespace(generate_content=lambda **_: reply))
        # Stand-in for the google-genai SDK so the test needs neither the package nor a key.
        types_mod = ModuleType("google.genai.types")
        types_mod.GenerateContentConfig = lambda **kw: SimpleNamespace(**kw)
        genai_mod = ModuleType("google.genai")
        genai_mod.types = types_mod
        google_mod = ModuleType("google")
        google_mod.genai = genai_mod
        fake = {"google": google_mod, "google.genai": genai_mod, "google.genai.types": types_mod}
        with mock.patch.dict(sys.modules, fake):
            out = refine_reasons(self.ranked, self.profile, SimpleNamespace(client=client))
        self.assertEqual(out[0].why, "Matches your embedded interest.")
        self.assertEqual(out[0].why_source, "gemini")
        self.assertEqual([r.opportunity.id for r in out], [r.opportunity.id for r in self.ranked])
        self.assertEqual([r.score for r in out], [r.score for r in self.ranked])


if __name__ == "__main__":
    unittest.main()
