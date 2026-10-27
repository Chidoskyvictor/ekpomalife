/*
 * AAU undergraduate courses (names, degrees and years from the varsity.ng list; UTME entry, Direct Entry is a year
 * less). The same file lives in lib/game and backend/src/game: keep the two identical.
 */

export type AauCourse = { id: string; name: string; degree: string; faculty: string; years: number }

export const AAU_COURSES: AauCourse[] = [
  { id: "agricultural-and-bio-resources-engineering", name: "Agricultural and Bio-Resources Engineering", degree: "B.Eng", faculty: "Agriculture", years: 5 },
  { id: "agricultural-economics", name: "Agricultural Economics", degree: "B.Sc", faculty: "Agriculture", years: 4 },
  { id: "agricultural-extension-management", name: "Agricultural Extension Management", degree: "B.Sc", faculty: "Agriculture", years: 4 },
  { id: "animal-science-and-food-science", name: "Animal Science and Food Science", degree: "B.Sc", faculty: "Agriculture", years: 4 },
  { id: "crop-science-and-agricultural-biotechnology", name: "Crop Science and Agricultural Biotechnology", degree: "B.Sc", faculty: "Agriculture", years: 4 },
  { id: "soil-and-environmental-science", name: "Soil and Environmental Science", degree: "B.Sc", faculty: "Agriculture", years: 4 },
  { id: "english", name: "English", degree: "B.A", faculty: "Arts", years: 4 },
  { id: "fine-and-visual-arts", name: "Fine and Visual Arts", degree: "B.A", faculty: "Arts", years: 4 },
  { id: "history-and-international-studies", name: "History and International Studies", degree: "B.A", faculty: "Arts", years: 4 },
  { id: "mass-comm", name: "Mass Communication", degree: "B.Sc", faculty: "Arts", years: 4 },
  { id: "modern-languages-french", name: "Modern Languages (French)", degree: "B.A", faculty: "Arts", years: 4 },
  { id: "philosophy", name: "Philosophy", degree: "B.A", faculty: "Arts", years: 4 },
  { id: "religious-management-and-cultural-studies", name: "Religious Management and Cultural Studies", degree: "B.A", faculty: "Arts", years: 4 },
  { id: "theatre-arts", name: "Theatre and Media Arts", degree: "B.A", faculty: "Arts", years: 4 },
  { id: "medicine-and-surgery", name: "Medicine and Surgery", degree: "MBBS", faculty: "College of Medicine / Basic Medical Sciences", years: 6 },
  { id: "anatomy", name: "Anatomy", degree: "B.Sc", faculty: "College of Medicine / Basic Medical Sciences", years: 4 },
  { id: "human-physiology", name: "Human Physiology", degree: "B.Sc", faculty: "College of Medicine / Basic Medical Sciences", years: 4 },
  { id: "medical-laboratory-science", name: "Medical Laboratory Science", degree: "B.MLS", faculty: "College of Medicine / Basic Medical Sciences", years: 5 },
  { id: "nursing", name: "Nursing Science", degree: "BNSc", faculty: "College of Medicine / Basic Medical Sciences", years: 5 },
  { id: "accounting-education", name: "Accounting Education", degree: "B.Ed", faculty: "Education", years: 4 },
  { id: "agricultural-education", name: "Agricultural Education", degree: "B.Ed", faculty: "Education", years: 4 },
  { id: "biology-education", name: "Biology Education", degree: "B.Ed", faculty: "Education", years: 4 },
  { id: "chemistry-education", name: "Chemistry Education", degree: "B.Ed", faculty: "Education", years: 4 },
  { id: "computer-science-education", name: "Computer Science Education", degree: "B.Ed", faculty: "Education", years: 4 },
  { id: "early-childhood-education", name: "Early Childhood Education", degree: "B.Ed", faculty: "Education", years: 4 },
  { id: "economics-education", name: "Economics Education", degree: "B.Ed", faculty: "Education", years: 4 },
  { id: "educational-management", name: "Educational Management", degree: "B.Ed", faculty: "Education", years: 4 },
  { id: "english-education", name: "English Education", degree: "B.Ed", faculty: "Education", years: 4 },
  { id: "french-education", name: "French Education", degree: "B.Ed", faculty: "Education", years: 4 },
  { id: "geography-education", name: "Geography Education", degree: "B.Ed", faculty: "Education", years: 4 },
  { id: "guidance-and-counselling", name: "Guidance and Counselling", degree: "B.Ed", faculty: "Education", years: 4 },
  { id: "health-education", name: "Health Education", degree: "B.Ed", faculty: "Education", years: 4 },
  { id: "history-education", name: "History Education", degree: "B.Ed", faculty: "Education", years: 4 },
  { id: "home-economics-education", name: "Home Economics Education", degree: "B.Ed", faculty: "Education", years: 4 },
  { id: "human-kinetics-education", name: "Human Kinetics Education", degree: "B.Ed", faculty: "Education", years: 4 },
  { id: "library-and-information-science", name: "Library and Information Science", degree: "BLIS", faculty: "Education", years: 4 },
  { id: "mathematics-education", name: "Mathematics Education", degree: "B.Ed", faculty: "Education", years: 4 },
  { id: "physics-education", name: "Physics Education", degree: "B.Ed", faculty: "Education", years: 4 },
  { id: "political-science-education", name: "Political Science Education", degree: "B.Ed", faculty: "Education", years: 4 },
  { id: "religious-education", name: "Religious Education", degree: "B.Ed", faculty: "Education", years: 4 },
  { id: "secretarial-education", name: "Secretarial Education", degree: "B.Ed", faculty: "Education", years: 4 },
  { id: "technology-education", name: "Technology Education", degree: "B.Ed", faculty: "Education", years: 4 },
  { id: "electrical-electronics-engineering", name: "Electrical/Electronics Engineering", degree: "B.Eng", faculty: "Engineering", years: 5 },
  { id: "industrial-and-production-engineering", name: "Industrial and Production Engineering", degree: "B.Eng", faculty: "Engineering", years: 5 },
  { id: "materials-and-metallurgical-engineering", name: "Materials and Metallurgical Engineering", degree: "B.Eng", faculty: "Engineering", years: 5 },
  { id: "mechanical-engineering", name: "Mechanical Engineering", degree: "B.Eng", faculty: "Engineering", years: 5 },
  { id: "architecture", name: "Architecture", degree: "B.Arch", faculty: "Environmental Sciences", years: 5 },
  { id: "building", name: "Building", degree: "B.Sc", faculty: "Environmental Sciences", years: 4 },
  { id: "law", name: "Law", degree: "LLB", faculty: "Law", years: 5 },
  { id: "accounting", name: "Accounting", degree: "B.Sc", faculty: "Management Sciences", years: 4 },
  { id: "banking-and-finance", name: "Banking and Finance", degree: "B.Sc", faculty: "Management Sciences", years: 4 },
  { id: "business-administration", name: "Business Administration", degree: "B.Sc", faculty: "Management Sciences", years: 4 },
  { id: "biochemistry", name: "Biochemistry", degree: "B.Sc", faculty: "Science", years: 4 },
  { id: "computer-science", name: "Computer Science", degree: "B.Sc", faculty: "Science", years: 4 },
  { id: "geophysics", name: "Geophysics", degree: "B.Sc", faculty: "Science", years: 4 },
  { id: "industrial-chemistry", name: "Industrial Chemistry", degree: "B.Sc", faculty: "Science", years: 4 },
  { id: "industrial-mathematics", name: "Industrial Mathematics", degree: "B.Sc", faculty: "Science", years: 4 },
  { id: "mathematics", name: "Mathematics", degree: "B.Sc", faculty: "Science", years: 4 },
  { id: "microbiology", name: "Microbiology", degree: "B.Sc", faculty: "Science", years: 4 },
  { id: "physics", name: "Physics", degree: "B.Sc", faculty: "Science", years: 4 },
  { id: "plant-science-and-biotechnology", name: "Plant Science and Biotechnology", degree: "B.Sc", faculty: "Science", years: 4 },
  { id: "pure-chemistry", name: "Pure Chemistry", degree: "B.Sc", faculty: "Science", years: 4 },
  { id: "statistics", name: "Statistics", degree: "B.Sc", faculty: "Science", years: 4 },
  { id: "geography-and-environmental-management", name: "Geography and Environmental Management", degree: "B.Sc", faculty: "Science", years: 4 },
  { id: "human-nutrition-and-dietetics", name: "Human Nutrition and Dietetics", degree: "B.Sc", faculty: "Science", years: 4 },
  { id: "zoology", name: "Zoology", degree: "B.Sc", faculty: "Science", years: 4 },
  { id: "economics", name: "Economics", degree: "B.Sc", faculty: "Social Sciences", years: 4 },
  { id: "political-science", name: "Political Science", degree: "B.Sc", faculty: "Social Sciences", years: 4 },
  { id: "psychology", name: "Psychology", degree: "B.Sc", faculty: "Social Sciences", years: 4 },
  { id: "public-administration", name: "Public Administration", degree: "B.Sc", faculty: "Social Sciences", years: 4 },
  { id: "social-studies", name: "Social Studies", degree: "B.Sc", faculty: "Social Sciences", years: 4 },
  { id: "sociology", name: "Sociology", degree: "B.Sc", faculty: "Social Sciences", years: 4 },
]

/** Shown before anyone searches. */
export const FEATURED_COURSE_IDS = [
  "human-physiology",
  "mass-comm",
  "law",
  "accounting",
  "nursing",
  "medical-laboratory-science",
  "medicine-and-surgery",
]

/** Ids saved before the full list existed. Still valid, no longer offered. */
export const LEGACY_COURSE_DEPARTMENTS: Record<string, string> = {
  engineering: 'Engineering',
  education: 'Education',
}

const BY_ID = new Map(AAU_COURSES.map((course) => [course.id, course]))

export const getCourse = (id: string | null | undefined) => (id ? (BY_ID.get(id) ?? null) : null)

export const isCourseId = (id: string | null | undefined): id is string =>
  Boolean(id && (BY_ID.has(id) || id in LEGACY_COURSE_DEPARTMENTS))

/** The profile department a course starts you in. */
export const departmentForCourse = (id: string | null | undefined) =>
  getCourse(id)?.name ?? (id ? (LEGACY_COURSE_DEPARTMENTS[id] ?? null) : null)
