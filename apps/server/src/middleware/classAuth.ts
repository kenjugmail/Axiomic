// S86 — Class-scoped authorization helpers.
//
// Layered on top of `requireAuth`. Three guards:
//   - requireEnrolledInClass: caller must be the instructor OR have
//     a class_enrollments row (any role).
//   - requireInstructorOrTa: caller must be the instructor OR have
//     role='ta'. Used for grading, attendance, cosmetic granting.
//   - requireInstructor: caller must be the class's instructor.
//     Used for class-edit, code rotation, role assignment.
//
// Each helper reads the :slug param, looks up the class once, and
// stores both the class row and the caller's effective role on
// the request context for downstream handlers.

import { Context, Next } from "hono";
import { eq, and } from "drizzle-orm";
import { getDb, classes, classEnrollments } from "@axiomic/db";
import type { Env } from "../env";

type ClassRole = "instructor" | "ta" | "student" | "observer";

declare module "hono" {
  interface ContextVariableMap {
    classRow: typeof classes.$inferSelect;
    classRole: ClassRole;
  }
}

async function loadClassAndRole(
  c: Context<Env>,
): Promise<
  | { class: typeof classes.$inferSelect; role: ClassRole }
  | { error: string; status: 404 | 403 }
> {
  const user = c.get("user");
  if (!user) return { error: "Unauthorized", status: 403 };
  const slug = c.req.param("slug");
  if (!slug) return { error: "Missing slug", status: 404 };

  const db = getDb();
  const cls = db
    .select()
    .from(classes)
    .where(eq(classes.slug, slug))
    .get();
  if (!cls) return { error: "Class not found", status: 404 };

  if (cls.instructorId === user.id) {
    return { class: cls, role: "instructor" };
  }
  const enrollment = db
    .select({ role: classEnrollments.role })
    .from(classEnrollments)
    .where(
      and(
        eq(classEnrollments.classId, cls.id),
        eq(classEnrollments.userId, user.id),
      ),
    )
    .get();
  if (!enrollment) {
    // Reveal-as-not-found to non-members so private class details
    // don't leak existence.
    return { error: "Class not found", status: 404 };
  }
  return { class: cls, role: enrollment.role as ClassRole };
}

export async function requireEnrolledInClass(c: Context<Env>, next: Next) {
  const result = await loadClassAndRole(c);
  if ("error" in result) {
    return c.json({ error: result.error }, result.status);
  }
  c.set("classRow", result.class);
  c.set("classRole", result.role);
  return next();
}

export async function requireInstructorOrTa(c: Context<Env>, next: Next) {
  const result = await loadClassAndRole(c);
  if ("error" in result) {
    return c.json({ error: result.error }, result.status);
  }
  if (result.role !== "instructor" && result.role !== "ta") {
    return c.json({ error: "Instructor or TA only" }, 403);
  }
  c.set("classRow", result.class);
  c.set("classRole", result.role);
  return next();
}

export async function requireInstructor(c: Context<Env>, next: Next) {
  const result = await loadClassAndRole(c);
  if ("error" in result) {
    return c.json({ error: result.error }, result.status);
  }
  if (result.role !== "instructor") {
    return c.json({ error: "Instructor only" }, 403);
  }
  c.set("classRow", result.class);
  c.set("classRole", result.role);
  return next();
}
