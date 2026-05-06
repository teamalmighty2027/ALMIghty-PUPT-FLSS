export interface Program {
  program_id: number;
  program_code: string;
  program_title: string;
  year_levels: YearLevel[];
  sections: { [yearLevel: string]: number };
  curriculums: { [yearLevel: string]: string };
}

export interface Section {
  section_id: number;
  section_name: string;
}

export interface SectionsByProgram {
  [program: string]: {
    [year: number]: string[];
  };
}

export interface Curriculum {
  id: number;
  curriculum_year: string;
  name: string;
}

export interface Schedule {
  course_id: number;
  course_code: string;
  course_title: string;
  lec_hours: number;
  lab_hours: number;
  units: number;
  tuition_hours: number;
  day: string;
  time: string;
  professor: string;
  room: string;
  program: string;
  program_code: string;
  year: number;
  curriculum: string;
  section: string;
  start_time?: string | null;
  end_time?: string | null;

  schedule_id?: number;
  faculty_id?: number;
  faculty_email?: string;
  room_id?: number;
  section_course_id: number;
  is_copy: number;
  is_temporary?: boolean;
  temporary_type?: string | null;
  temporary_status?: string | null;
  petition_required?: boolean;
  temporary_course_offering_id?: number | null;
}

export interface Semester {
  semester_id: number;
  semester_number: string;
  semester: number;
  start_date: string;
  end_date: string;
  courses: Schedule[];
}

export interface AcademicYear {
  academic_year_id: number;
  academic_year: string;
  semesters: Semester[];
}

export interface YearLevel {
  year_level: number;
  year_level_id?: number;
  semester_id?: number;
  curriculum_id: number;
  curriculum_year: string;
  number_of_sections: number;
  sections: Section[];
  semesters: Semester[];
}

export interface PopulateSchedulesResponse {
  active_semester_id: number;
  academic_year_id: number;
  semester_id: number;
  is_submission_enabled: number;
  programs: ProgramResponse[];
}

export interface ProgramResponse {
  program_id: number;
  program_code: string;
  program_title: string;
  year_levels: YearLevelResponse[];
}

export interface YearLevelResponse {
  year_level: number;
  year_level_id?: number;
  curriculum_id: number;
  curriculum_year: string;
  semesters: SemesterResponse[];
}

export interface SemesterResponse {
  semester: number;
  sections: SectionResponse[];
}

export interface SectionResponse {
  section_per_program_year_id: number;
  section_name: string;
  courses: CourseResponse[];
}

export interface CourseResponse {
  course_assignment_id: number | null;
  temporary_course_offering_id?: number | null;
  course_id: number;
  course_code: string;
  course_title: string;
  lec_hours: number;
  lab_hours: number;
  units: number;
  tuition_hours: number;
  schedule?: {
    schedule_id: number;
    day: string;
    start_time: string;
    end_time: string;
    room_id?: number;
  };
  professor: string;
  faculty_id: number;
  faculty_email: string;
  room?: {
    room_id: number;
    room_code: string;
  };
  section_course_id: number;
  is_copy?: number;
  is_temporary?: boolean;
  temporary_type?: string | null;
  temporary_status?: string | null;
  petition_required?: boolean;
  applies_to_all_sections?: boolean;
  section_per_program_year_id?: number | null;
}

export interface CourseCatalogItem {
  course_id: number;
  course_code: string;
  course_title: string;
  lec_hours: number;
  lab_hours: number;
  units: number;
  tuition_hours: number;
}

export interface BridgingCourseOption {
  bridging_course_id: number;
  curriculum_id: number;
  program_id: number;
  year_level_id: number;
  semester_id: number;
  year_level: number;
  course_id: number;
  course_code: string;
  course_title: string;
  lec_hours: number;
  lab_hours: number;
  units: number;
  tuition_hours: number;
}

export interface TemporaryCourseOfferingPayload {
  course_id: number;
  bridging_course_id?: number | null;
  academic_year_id: number;
  semester_id: number;
  program_id: number;
  year_level: number;
  section_per_program_year_id?: number | null;
  applies_to_all_sections: boolean;
  type: string;
  min_petitioners?: number | null;
  petitioners_count?: number | null;
  petition_file?: File | null;
}

export interface Room {
  room_id: number;
  room_code: string;
  location: string;
  floor_level: string;
  room_type: string;
  capacity: number;
  status: string;
}

export interface Faculty {
  faculty_id: number;
  name: string;
  faculty_email: string;
  faculty_type: string;
  faculty_units: number;
}

export interface SubmittedPrefResponse {
  preferences: Preference[];
}

export interface Preference {
  faculty_id: number;
  faculty_name: string;
  faculty_code: string;
  faculty_units: string;
  active_semesters: ActiveSemester[];
}

export interface ActiveSemester {
  active_semester_id: number;
  academic_year_id: number;
  academic_year: string;
  semester_id: number;
  semester_label: string;
  courses: CoursePreference[];
}

export interface CoursePreference {
  course_assignment_id: number;
  preferences_id?: number;
  is_ignored?: boolean;
  course_details: CourseDetails;
  preferred_days: {
    day: string;
    start_time: string;
    end_time: string;
  }[];
  created_at: string;
  updated_at: string;
}

export interface CourseDetails {
  course_id: number;
  course_code: string;
  course_title: string;
  program_id: number;
  program_code: string;
}

export interface ConflictingCourseDetail {
  course: CourseResponse;
  sectionName: string;
}

export interface ConflictingScheduleDetail {
  course: CourseResponse;
  programCode: string;
  yearLevel: number;
  sectionName: string;
}

export interface ScheduleArrangementOverride {
  schedule_id: number;
  day?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  room_id?: number | null;
  room_code?: string | null;
}

export interface DraftEntry {
  schedule_id: number;
  faculty_id: number | null;
  faculty_name: string;
  room_id: number | null;
  room_code: string;
  day: string | null;
  start_time: string | null;
  end_time: string | null;
  hasConflict: boolean;
}

export interface ProgramOption {
  display: string;
  id: number;
  year_levels: YearLevelOption[];
}

export interface YearLevelOption {
  year_level: number;
  year_level_id?: number;
  semester_id?: number;
  curriculum_id: number;
  sections: SectionOption[];
}

export interface SectionOption {
  section_id: number;
  section_name: string;
}

export interface SmartSuggestion {
  faculty_id: number;
  faculty_name: string;
  day: string;
  start_time: string;
  end_time: string;
  confidence?: number;
  isMl: boolean;
  success: boolean;
}
