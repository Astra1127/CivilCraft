import { createFileRoute, redirect } from "@tanstack/react-router";
import { shopCurrency, shopGameLink } from "@/lib/payments/shop-display";

export const Route = createFileRoute("/shop")({
  validateSearch: (search: Record<string, unknown>) => ({
    currency: shopCurrency(search["currency"]),
    ...(shopGameLink(search["gameLink"]) ? { gameLink: shopGameLink(search["gameLink"]) } : {}),
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/dashboard/shop", search, replace: true });
  },
});
