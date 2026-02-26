-- Agentura Milestone 2 RLS policies (manual Supabase step)
-- Expected behavior: Prisma migrations do NOT apply this file automatically.
-- Run this SQL manually in the Supabase SQL editor after `prisma migrate dev`.

-- Enable RLS on all Prisma tables
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Installation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvalRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SuiteResult" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CaseResult" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmbeddingCache" ENABLE ROW LEVEL SECURITY;

-- Drop/recreate policies so this script is re-runnable
DROP POLICY IF EXISTS "user_self_access" ON "User";
DROP POLICY IF EXISTS "installation_owner_access" ON "Installation";
DROP POLICY IF EXISTS "project_owner_access" ON "Project";
DROP POLICY IF EXISTS "project_settings_owner_access" ON "ProjectSettings";
DROP POLICY IF EXISTS "eval_run_owner_access" ON "EvalRun";
DROP POLICY IF EXISTS "suite_result_owner_access" ON "SuiteResult";
DROP POLICY IF EXISTS "case_result_owner_access" ON "CaseResult";

-- User rows: authenticated user can only read/write their own row
CREATE POLICY "user_self_access"
ON "User"
FOR ALL
TO authenticated
USING (id = auth.uid()::text)
WITH CHECK (id = auth.uid()::text);

-- Installation rows: owner-scoped by userId
CREATE POLICY "installation_owner_access"
ON "Installation"
FOR ALL
TO authenticated
USING ("userId" = auth.uid()::text)
WITH CHECK ("userId" = auth.uid()::text);

-- Project rows: direct owner or via owned installation
CREATE POLICY "project_owner_access"
ON "Project"
FOR ALL
TO authenticated
USING (
  "userId" = auth.uid()::text
  OR EXISTS (
    SELECT 1
    FROM "Installation" i
    WHERE i.id = "Project"."installationId"
      AND i."userId" = auth.uid()::text
  )
)
WITH CHECK (
  "userId" = auth.uid()::text
  OR EXISTS (
    SELECT 1
    FROM "Installation" i
    WHERE i.id = "Project"."installationId"
      AND i."userId" = auth.uid()::text
  )
);

-- ProjectSettings rows: scoped via owning project
CREATE POLICY "project_settings_owner_access"
ON "ProjectSettings"
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM "Project" p
    LEFT JOIN "Installation" i ON i.id = p."installationId"
    WHERE p.id = "ProjectSettings"."projectId"
      AND (
        p."userId" = auth.uid()::text
        OR i."userId" = auth.uid()::text
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "Project" p
    LEFT JOIN "Installation" i ON i.id = p."installationId"
    WHERE p.id = "ProjectSettings"."projectId"
      AND (
        p."userId" = auth.uid()::text
        OR i."userId" = auth.uid()::text
      )
  )
);

-- EvalRun rows: scoped via project ownership
CREATE POLICY "eval_run_owner_access"
ON "EvalRun"
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM "Project" p
    LEFT JOIN "Installation" i ON i.id = p."installationId"
    WHERE p.id = "EvalRun"."projectId"
      AND (
        p."userId" = auth.uid()::text
        OR i."userId" = auth.uid()::text
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "Project" p
    LEFT JOIN "Installation" i ON i.id = p."installationId"
    WHERE p.id = "EvalRun"."projectId"
      AND (
        p."userId" = auth.uid()::text
        OR i."userId" = auth.uid()::text
      )
  )
);

-- SuiteResult rows: scoped via eval run -> project ownership
CREATE POLICY "suite_result_owner_access"
ON "SuiteResult"
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM "EvalRun" er
    JOIN "Project" p ON p.id = er."projectId"
    LEFT JOIN "Installation" i ON i.id = p."installationId"
    WHERE er.id = "SuiteResult"."evalRunId"
      AND (
        p."userId" = auth.uid()::text
        OR i."userId" = auth.uid()::text
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "EvalRun" er
    JOIN "Project" p ON p.id = er."projectId"
    LEFT JOIN "Installation" i ON i.id = p."installationId"
    WHERE er.id = "SuiteResult"."evalRunId"
      AND (
        p."userId" = auth.uid()::text
        OR i."userId" = auth.uid()::text
      )
  )
);

-- CaseResult rows: scoped via suite result -> eval run -> project ownership
CREATE POLICY "case_result_owner_access"
ON "CaseResult"
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM "SuiteResult" sr
    JOIN "EvalRun" er ON er.id = sr."evalRunId"
    JOIN "Project" p ON p.id = er."projectId"
    LEFT JOIN "Installation" i ON i.id = p."installationId"
    WHERE sr.id = "CaseResult"."suiteResultId"
      AND (
        p."userId" = auth.uid()::text
        OR i."userId" = auth.uid()::text
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "SuiteResult" sr
    JOIN "EvalRun" er ON er.id = sr."evalRunId"
    JOIN "Project" p ON p.id = er."projectId"
    LEFT JOIN "Installation" i ON i.id = p."installationId"
    WHERE sr.id = "CaseResult"."suiteResultId"
      AND (
        p."userId" = auth.uid()::text
        OR i."userId" = auth.uid()::text
      )
  )
);

-- EmbeddingCache intentionally has no authenticated-user policy yet.
-- RLS is enabled so only privileged service-role access can read/write it.
