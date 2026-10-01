import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/payment/cancel")({
  validateSearch: (search: Record<string, unknown>) => ({
    order_id: typeof search["order_id"] === "string" ? search["order_id"] : "",
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/dashboard/payment/cancel", search, replace: true });
  },
});
