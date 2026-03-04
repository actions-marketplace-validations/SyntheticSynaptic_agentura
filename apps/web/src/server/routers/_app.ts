import { createTRPCRouter } from "../trpc";
import { projectsRouter } from "./projects";
import { usersRouter } from "./users";

export const appRouter = createTRPCRouter({
  projects: projectsRouter,
  users: usersRouter,
});

export type AppRouter = typeof appRouter;
