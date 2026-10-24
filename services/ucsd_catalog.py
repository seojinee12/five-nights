"""
UCSD Course Catalog Service.

Provides structured course data, prerequisite graphs, and degree requirements
specifically curated for UC San Diego (Jacobs School of Engineering) Electrical Engineering.
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class UCSDCourse(BaseModel):
    """Course representation from the UCSD Department of Electrical and Computer Engineering (ECE)."""
    code: str = Field(description="Course code, e.g. 'ECE 5'")
    title: str = Field(description="Official catalog title")
    units: int = Field(default=4, description="Credit unit value")
    description: str = Field(description="Course summary and scope")
    prerequisites: List[str] = Field(default_factory=list, description="Prerequisite courses")
    typical_quarter: str = Field(description="Recommended quarter (Fall, Winter, Spring)")
    estimated_weekly_workload_hours: float = Field(default=10.0, description="Average weekly hours required")
    difficulty_rating: str = Field(default="Medium", description="Difficulty tier: Foundational, Moderate, Rigorous")
    category: str = Field(default="Major Core", description="Major Core, Math/Science, or GE")


# Curated catalog of UCSD freshman/sophomore courses for Electrical Engineering (EC27)
UCSD_EE_CATALOG: Dict[str, UCSDCourse] = {
    "ECE 5": UCSDCourse(
        code="ECE 5",
        title="Introduction to Electrical and Computer Engineering",
        units=4,
        description="Hands-on introduction to ECE disciplines. Students build circuits on breadboards, program microcontrollers (sensors, motors), and work in collaborative lab teams.",
        prerequisites=[],
        typical_quarter="Freshman Fall / Winter",
        estimated_weekly_workload_hours=9.0,
        difficulty_rating="Foundational",
        category="Major Core",
    ),
    "ECE 15": UCSDCourse(
        code="ECE 15",
        title="Engineering Computation",
        units=4,
        description="C programming with emphasis on algorithmic thinking, memory management, pointers, dynamic allocation, bitwise operations, and data structures for embedded systems.",
        prerequisites=["None"],
        typical_quarter="Freshman Winter / Spring",
        estimated_weekly_workload_hours=12.0,
        difficulty_rating="Moderate",
        category="Major Core",
    ),
    "ECE 25": UCSDCourse(
        code="ECE 25",
        title="Introduction to Digital Design",
        units=4,
        description="Boolean algebra, combinational logic design, sequential circuits, finite state machines (FSM), timing diagrams, and basic introduction to Verilog HDL.",
        prerequisites=["None"],
        typical_quarter="Freshman Spring",
        estimated_weekly_workload_hours=11.0,
        difficulty_rating="Moderate",
        category="Major Core",
    ),
    "ECE 35": UCSDCourse(
        code="ECE 35",
        title="Introduction to Analog Design",
        units=4,
        description="Foundational circuit analysis: Ohm's and Kirchhoff's laws, Thevenin/Norton equivalents, operational amplifiers, first and second-order RLC transient response, sinusoidal steady-state.",
        prerequisites=["MATH 20B", "PHYS 2B (concurrent)"],
        typical_quarter="Sophomore Fall",
        estimated_weekly_workload_hours=16.0,
        difficulty_rating="Rigorous",
        category="Major Core",
    ),
    "MATH 18": UCSDCourse(
        code="MATH 18",
        title="Linear Algebra",
        units=4,
        description="Matrix algebra, Gaussian elimination, determinants, vector spaces, subspaces, eigenvalues and eigenvectors, orthogonality, symmetric matrices.",
        prerequisites=["MATH 20A or AP Calculus"],
        typical_quarter="Freshman Winter / Spring",
        estimated_weekly_workload_hours=10.0,
        difficulty_rating="Moderate",
        category="Math/Science",
    ),
    "MATH 20A": UCSDCourse(
        code="MATH 20A",
        title="Calculus for Science and Engineering I",
        units=4,
        description="Differential calculus: limits, continuity, derivatives of algebraic and transcendental functions, applications to optimization and rates of change.",
        prerequisites=["Math Placement (MPE)"],
        typical_quarter="Freshman Fall",
        estimated_weekly_workload_hours=9.0,
        difficulty_rating="Foundational",
        category="Math/Science",
    ),
    "MATH 20B": UCSDCourse(
        code="MATH 20B",
        title="Calculus for Science and Engineering II",
        units=4,
        description="Integral calculus: Riemann sums, fundamental theorem of calculus, integration techniques, polar coordinates, infinite series and Taylor expansions.",
        prerequisites=["MATH 20A"],
        typical_quarter="Freshman Winter",
        estimated_weekly_workload_hours=11.0,
        difficulty_rating="Moderate",
        category="Math/Science",
    ),
    "PHYS 2A": UCSDCourse(
        code="PHYS 2A",
        title="Physics - Mechanics",
        units=4,
        description="Calculus-based classical mechanics: vectors, motion in 1D/2D, Newton's laws of motion, work, kinetic/potential energy, conservation laws, rotational kinematics.",
        prerequisites=["MATH 20A"],
        typical_quarter="Freshman Winter",
        estimated_weekly_workload_hours=12.0,
        difficulty_rating="Moderate",
        category="Math/Science",
    ),
    "PHYS 2B": UCSDCourse(
        code="PHYS 2B",
        title="Physics - Electricity and Magnetism",
        units=4,
        description="Coulomb's law, electric field and potential, Gauss's law, capacitance, DC circuits, magnetic fields, Ampere's law, Faraday's law of induction.",
        prerequisites=["PHYS 2A", "MATH 20B"],
        typical_quarter="Freshman Spring",
        estimated_weekly_workload_hours=14.0,
        difficulty_rating="Rigorous",
        category="Math/Science",
    ),
}


class UCSDOpportunity(BaseModel):
    """A research, internship, club, project, hackathon, scholarship, or event a student can pursue."""
    id: str = Field(description="Stable slug")
    title: str = Field(description="Name shown to the student")
    type: str = Field(description="research, internship, club, project, hackathon, scholarship, or event")
    org: str = Field(default="", description="Lab, team, or office behind it")
    summary: str = Field(default="", description="One-line description")
    url: str = Field(default="", description="Public page")
    tags: List[str] = Field(default_factory=list, description="Topic keywords used for matching")
    majors: List[str] = Field(default_factory=list, description="Major keywords it suits; empty means any major")
    min_year: int = Field(default=1, description="Earliest year it suits (1 = first year)")
    max_year: int = Field(default=4, description="Latest year it suits")
    beginner_friendly: bool = Field(default=True, description="Open to students with little experience")


OPPORTUNITY_TYPES = ("research", "internship", "club", "project", "hackathon", "scholarship", "event")

_ENG = ["engineering"]
_ECE = ["electrical", "computer", "ece", "cse", "robotics"]
_BIO = ["bioengineering", "biomedical", "biology", "bioe", "chemical"]

# Curated UCSD opportunities. Pages were checked reachable when added; deadlines change, so none are stored.
UCSD_OPPORTUNITIES: List[UCSDOpportunity] = [
    UCSDOpportunity(id="e4e", title="Engineers for Exploration", type="project", org="Profs. Curt Schurgers and Ryan Kastner",
        summary="Hardware, sensors, and field projects for conservation.", url="https://e4e.ucsd.edu/",
        tags=["sensors", "hardware", "embedded systems", "field projects", "wearable", "conservation"], majors=_ECE, min_year=1, max_year=4),
    UCSDOpportunity(id="ieee-projects", title="IEEE at UCSD quarterly projects", type="club", org="IEEE at UCSD",
        summary="Beginner hardware teams with funded parts.", url="https://ieeeatucsd.org/projects/quarterly",
        tags=["hardware", "circuits", "embedded systems", "arduino", "projects", "robotics"], majors=_ECE, min_year=1, max_year=3),
    UCSDOpportunity(id="robosub", title="Triton Robosub beginner track", type="project", org="Triton Robosub",
        summary="Firmware and sensors for an autonomous submarine, with a mentor.", url="https://tritonrobosub.com/",
        tags=["robotics", "firmware", "sensors", "embedded systems", "autonomous", "c++"], majors=_ECE, min_year=1, max_year=4),
    UCSDOpportunity(id="cri", title="Contextual Robotics Institute", type="research", org="Prof. Henrik Christensen",
        summary="Mobile robots, vision, and autonomous systems research.", url="https://contextualrobotics.ucsd.edu/",
        tags=["robotics", "computer vision", "autonomous systems", "research", "machine learning"], majors=_ECE, min_year=2, max_year=4, beginner_friendly=False),
    UCSDOpportunity(id="erl", title="Existential Robotics Laboratory", type="research", org="Prof. Nikolay Atanasov",
        summary="Perception, state estimation, and mapping research.", url="https://erl.ucsd.edu/",
        tags=["robotics", "perception", "mapping", "research", "python", "linear algebra"], majors=_ECE, min_year=2, max_year=4, beginner_friendly=False),
    UCSDOpportunity(id="ug-research", title="UCSD Undergraduate Research Hub", type="research", org="Undergraduate Research Hub",
        summary="Find a lab, learn how to email professors, and see research programs.", url="https://ugresearch.ucsd.edu/",
        tags=["undergraduate research", "research", "lab", "professor"], majors=[], min_year=1, max_year=4),
    UCSDOpportunity(id="cosman", title="Pamela Cosman Lab", type="research", org="Prof. Pamela Cosman",
        summary="Wireless media and engineering education research.", url="https://cosman.ucsd.edu/",
        tags=["wireless", "signal processing", "video", "research", "python"], majors=["electrical", "computer", "ece"], min_year=2, max_year=4, beginner_friendly=False),
    UCSDOpportunity(id="sdsc-interns", title="SDSC undergraduate internships", type="internship", org="San Diego Supercomputer Center",
        summary="On-campus internships in high-performance computing and data.", url="https://interns.sdsc.edu/",
        tags=["data", "python", "high performance computing", "software", "cluster", "internship"], majors=["computer", "cse", "data", "electrical", "ece"], min_year=2, max_year=4),
    UCSDOpportunity(id="hardware-intern", title="Hardware and embedded summer internships", type="internship", org="UCSD Career Center",
        summary="Search and apply for hardware, firmware, and embedded roles with the Career Center.", url="https://career.ucsd.edu/",
        tags=["internship", "hardware", "embedded systems", "firmware", "circuits", "summer", "industry"], majors=["electrical", "computer", "ece", "cse"], min_year=1, max_year=4),
    UCSDOpportunity(id="swe-intern", title="Software engineering internships", type="internship", org="UCSD Career Center",
        summary="Industry software roles, resume reviews, and interview practice.", url="https://career.ucsd.edu/",
        tags=["internship", "software", "python", "algorithms", "industry", "web", "coding", "summer"], majors=["computer", "cse", "data", "electrical", "ece"], min_year=2, max_year=4, beginner_friendly=False),
    UCSDOpportunity(id="biomed-intern", title="Biomedical and life-science internships", type="internship", org="UCSD Career Center",
        summary="Medical device, biotech, and lab internships for bioengineering students.", url="https://career.ucsd.edu/",
        tags=["internship", "biotech", "medical devices", "bioengineering", "lab", "industry", "summer"], majors=_BIO, min_year=2, max_year=4),
    UCSDOpportunity(id="bioe-research", title="Bioengineering faculty lab research", type="research", org="Jacobs School of Engineering",
        summary="Join a bioengineering lab through the Undergraduate Research Hub.", url="https://ugresearch.ucsd.edu/",
        tags=["research", "bioengineering", "lab", "biology", "tissue", "genomics", "medical devices", "wet lab"], majors=_BIO, min_year=1, max_year=4),
    UCSDOpportunity(id="acm-hack-school", title="ACM Hack School", type="club", org="ACM at UCSD",
        summary="Learn web and software skills by building a project with a team.", url="https://hack.acmucsd.com/",
        tags=["software", "web", "python", "coding", "projects", "git", "javascript"], majors=["computer", "cse", "data", "electrical", "ece"], min_year=1, max_year=3),
    UCSDOpportunity(id="acm-ai", title="ACM AI", type="club", org="ACM at UCSD",
        summary="Machine learning workshops and student projects.", url="https://ai.acmucsd.com/",
        tags=["machine learning", "ai", "python", "data", "projects"], majors=["computer", "cse", "data", "electrical", "ece"], min_year=1, max_year=4),
    UCSDOpportunity(id="diamondhacks", title="DiamondHacks", type="hackathon", org="ACM at UCSD",
        summary="A beginner-friendly hackathon with mentors and workshops.", url="https://diamondhacks.acmucsd.com/",
        tags=["hackathon", "projects", "software", "web", "coding", "teamwork", "hardware"], majors=[], min_year=1, max_year=4),
    UCSDOpportunity(id="academic-enrichment", title="Academic Enrichment Programs", type="research", org="Academic Enrichment Programs",
        summary="Mentored research and scholarship programs for undergraduates.", url="https://aep.ucsd.edu/",
        tags=["undergraduate research", "research", "mentoring", "graduate school", "phd", "scholarship"], majors=[], min_year=1, max_year=4),
    UCSDOpportunity(id="fas", title="Financial Aid and Scholarships Office", type="scholarship", org="UCSD",
        summary="Find campus scholarships and funding for engineering students.", url="https://fas.ucsd.edu/",
        tags=["scholarship", "funding", "financial aid", "grants"], majors=[], min_year=1, max_year=4),
    UCSDOpportunity(id="career-events", title="Career Center events and fairs", type="event", org="UCSD Career Center",
        summary="Career fairs, employer info sessions, and resume workshops.", url="https://career.ucsd.edu/events",
        tags=["career fair", "networking", "resume", "internship", "industry", "employers"], majors=[], min_year=1, max_year=4),
    UCSDOpportunity(id="qi-events", title="Qualcomm Institute talks and open houses", type="event", org="Qualcomm Institute",
        summary="Campus talks and lab open houses on sensors, wireless, and health tech.", url="https://qi.ucsd.edu/",
        tags=["wearable", "sensors", "wireless", "research", "networking", "medical devices", "lab"], majors=[], min_year=1, max_year=4),
]


class UCSDCatalogService:
    """Helper service for fetching and querying UCSD courses and 4-year plan guidance."""

    @staticmethod
    def get_all_courses() -> List[UCSDCourse]:
        """Return all catalog courses."""
        return list(UCSD_EE_CATALOG.values())

    @staticmethod
    def get_course(code: str) -> Optional[UCSDCourse]:
        """Fetch a specific course by its code."""
        return UCSD_EE_CATALOG.get(code)

    @staticmethod
    def get_opportunities() -> List[UCSDOpportunity]:
        """Return the curated research, internship, club, project, hackathon, scholarship, and event list."""
        return list(UCSD_OPPORTUNITIES)

    @staticmethod
    def get_recommended_freshman_courses() -> List[str]:
        """Default recommended course selection for Freshman EE."""
        return ["ECE 5", "MATH 20A", "PHYS 2A"]

    @staticmethod
    def calculate_workload_projection(enrolled_codes: List[str]) -> Dict[str, Any]:
        """
        Calculate total estimated weekly study hours and risk profile based on enrolled courses.
        """
        total_units = 0
        total_hours = 0.0
        rigorous_count = 0

        for code in enrolled_codes:
            course = UCSD_EE_CATALOG.get(code)
            if course:
                total_units += course.units
                total_hours += course.estimated_weekly_workload_hours
                if course.difficulty_rating == "Rigorous":
                    rigorous_count += 1

        academic_intensity = "Heavy" if total_hours > 32 else ("Moderate" if total_hours > 20 else "Balanced")
        gpa_study_multiplier = 1.25 if rigorous_count >= 1 else 1.0

        return {
            "total_units": total_units,
            "estimated_weekly_study_hours": round(total_hours, 1),
            "academic_intensity": academic_intensity,
            "rigorous_courses_count": rigorous_count,
            "target_gpa_study_multiplier": gpa_study_multiplier,
        }
