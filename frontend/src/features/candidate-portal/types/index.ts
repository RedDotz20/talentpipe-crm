export interface Job {
  id: string;
  /** Canonical company job-posting identifier; public index rows also expose an id. */
  jobPostingId?: string;
  companyId: string;
  title: string;
  companyName: string;
  description?: string;
  employmentType?: string | null;
  location?: string | null;
  workSetup?: string | null;
  requiredSkills?: { id: string; name: string; category?: string | null }[];
  requirements?: string;
  benefits?: string;
}

export interface Application {
  id: string;
  applicationId: string;
  jobTitle: string;
  companyName: string;
  status: string;
  appliedAt: string;
  companyId: string;
  jobPostingId: string;
}

export interface CandidateApplicationDetail extends Application {
  matchScore: number | null;
  appliedSkillIds: string[] | null;
  coverLetter: string | null;
}

export interface Bookmark {
  id: string;
  jobPostingId: string;
  jobTitle: string;
  companyName: string;
  createdAt: string;
}

export interface Profile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  skills: Skill[];
  resumeFileUrl: string | null;
  resumeUploadedAt: string | null;
  createdAt: string;
}

export interface ResumeUpload {
  fileUrl: string;
  uploadedAt: string;
}

export interface ApplyData {
  phone?: string;
  coverLetter?: string;
  skillIds?: string[];
}

export interface Skill {
  id: string;
  name: string;
  category: string | null;
}
