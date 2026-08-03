CREATE TABLE "candidate_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"candidate_account_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resumes" DROP COLUMN "parsed_text";--> statement-breakpoint
CREATE UNIQUE INDEX "unique_candidate_skill" ON "candidate_skills" ("candidate_account_id","skill_id");--> statement-breakpoint
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_WKnvDx7xpsqz_fkey" FOREIGN KEY ("candidate_account_id") REFERENCES "candidate_accounts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_skill_id_skills_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE;