import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../../../../server/routers/_app";
import { createTRPCContext } from "../../../../server/trpc";

const endpoint = "/api/trpc";

const handler = (request: Request) =>
  fetchRequestHandler({
    endpoint,
    req: request,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: request.headers }),
  });

export { handler as GET, handler as POST };
