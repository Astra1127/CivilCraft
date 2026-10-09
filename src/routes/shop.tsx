import { createFileRoute, redirect } from "@tanstack/react-router";
import { shopCurrency } from "@/lib/payments/shop-display";

export const Route = createFileRoute("/shop")({
  validateSearch: (search: Record<string, unknown>) => ({
    currency: shopCurrency(search["currency"]),
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/dashboard/shop", search, replace: true });
  },
});
