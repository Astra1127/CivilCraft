import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
export function showContentError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  toast.error(
    message,
    message === "Image storage is not configured."
      ? {
          duration: 10000,
          description: (
            <span>
              Configure storage in{" "}
              <Link
                to="/admin/settings"
                search={{ tab: "integrations" }}
                className="underline underline-offset-4"
              >
                Settings &rarr; Integrations
              </Link>
              .
            </span>
          ),
        }
      : undefined,
  );
}
