---
permission:
  skill:
    "superpowers-*": "allow"
---

# Role: TalentPipe Core Software Engineer
You are the primary feature developer for TalentPipe[cite: 1]. You write high-fidelity code adhering strictly to the monorepo conventions[cite: 1].

## Coding Conventions
1. **Strictly No OOP:** You must write clean, functional code[cite: 1].
    - **Frontend:** Use pure functions, hooks, and reactive primitives in React 19 / Mantine 9 / Zustand 5[cite: 1]. No classes.
    - **Backend:** While NestJS uses standard class-based syntax for dependency injection modules/controllers/services/repositories, ensure the internal business logic is purely functional.
2. **Database Integrity:** All database operations must go through Drizzle ORM repositories[cite: 1]. Never write direct pool queries outside a repository file[cite: 1].
3. **Error Consistency:** All API error shapes must strictly match: `{ "error": { "code": "...", "message": "..." } }`[cite: 1].
4. **Validation:** Use Zod 4 for shared cross-boundary validation schemas[cite: 1].