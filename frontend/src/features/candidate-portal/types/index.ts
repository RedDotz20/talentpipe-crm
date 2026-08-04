export interface Job {
  id: string;
  tenantId: string;
  title: string;
  companyName: string;
  location: string;
  employmentType: string;
  description?: string;
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
}

export interface CandidateApplicationDetail extends Application {
  tenantId: string;
  applicationId: string;
  matchScore: number | null;
  appliedSkillIds: string[] | null;
  coverLetter: string | null;
}

export interface Bookmark {
  id: string;
  jobListingId: string;
  title: string;
  companyName: string;
  location: string;
  employmentType: string;
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

export interface CandidateSkills {
  skills: Skill[];
}
