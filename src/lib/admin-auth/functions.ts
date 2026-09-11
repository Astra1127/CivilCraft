import { createServerFn } from "@tanstack/react-start";

/** Also used by TanStack beforeLoad, so in-app navigation requires server verification. */
export const getAdminSession = createServerFn({ method: "GET" }).handler(async () => {
  const { getRequest, setResponseHeader } = await import("@tanstack/react-start/server");
  const { readAdminSession } = await import("./session.server");
  setResponseHeader("Cache-Control", "no-store, private");
  setResponseHeader("Vary", "Cookie");
  return readAdminSession(getRequest());
});
