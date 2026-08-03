export interface Job {
  id: string;
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
  jobTitle: string;
  companyName: string;
  status: string;
  appliedAt: string;
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
  phone?: string;
  resumeUrl?: string;
  createdAt: string;
}

export interface ApplyData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  coverLetter?: string;
  resumeUrl?: string;
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
