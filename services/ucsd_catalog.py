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
