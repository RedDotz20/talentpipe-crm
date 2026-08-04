DROP SCHEMA IF EXISTS template CASCADE;
CREATE SCHEMA template;
CREATE TABLE template."users" (LIKE public."users" INCLUDING ALL);
CREATE TABLE template."job_postings" (LIKE public."job_postings" INCLUDING ALL);
CREATE TABLE template."candidates" (LIKE public."candidates" INCLUDING ALL);
CREATE TABLE template."pipeline_stages" (LIKE public."pipeline_stages" INCLUDING ALL);
-- public.applications includes cover_letter, so new tenant schemas inherit it here.
CREATE TABLE template."applications" (LIKE public."applications" INCLUDING ALL);
CREATE TABLE template."job_required_skills" (LIKE public."job_required_skills" INCLUDING ALL);
CREATE TABLE template."interviews" (LIKE public."interviews" INCLUDING ALL);
CREATE TABLE template."interview_feedbacks" (LIKE public."interview_feedbacks" INCLUDING ALL);
CREATE TABLE template."notes" (LIKE public."notes" INCLUDING ALL);
