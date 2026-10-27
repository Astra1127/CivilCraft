import { useState } from "react";

/** Diagrams illustrate only the pushing, pulling and balanced forces in the authored notes. */
export function LessonIllustration({
  id,
  title,
  image,
}: {
  id: string;
  title: string;
  image?: string;
}) {
  const [failedImage, setFailedImage] = useState<string>();
  const force =
    id === "What is Tension"
      ? "tension"
      : id === "What is Compression"
        ? "compression"
        : id === "What is Equilibrium"
          ? "equilibrium"
          : undefined;
  return (
    <figure className="mb-4 overflow-hidden rounded-xl border border-border bg-secondary/50">
      {image && image !== failedImage ? (
        <img
          src={image}
          alt={`${title} lesson illustration`}
          loading="lazy"
          onError={() => setFailedImage(image)}
          className="h-44 w-full object-contain p-3 sm:h-48"
        />
      ) : force ? (
        <svg
          viewBox="0 0 320 180"
          role="img"
          aria-label={`${title}: ${force === "equilibrium" ? "downward loads balanced by upward support reactions" : force === "tension" ? "forces pull away from opposite ends of a member" : "forces push toward opposite ends of a member"}`}
          className="h-44 w-full p-3 text-primary sm:h-48"
        >
          <rect
            x="95"
            y="75"
            width="130"
            height="28"
            rx="4"
            fill="currentColor"
            opacity="0.2"
            stroke="currentColor"
            strokeWidth="2"
          />
          {force === "equilibrium" ? (
            <g
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M130 25v42m-8-10 8 10 8-10M190 25v42m-8-10 8 10 8-10M108 148v-38m-8 10 8-10 8 10M212 148v-38m-8 10 8-10 8 10" />
            </g>
          ) : (
            <g
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {force === "tension" ? (
                <path d="M85 89H28m12-10-12 10 12 10M235 89h57m-12-10 12 10-12 10" />
              ) : (
                <path d="M28 89h57M73 79l12 10-12 10M292 89h-57m12-10-12 10 12 10" />
              )}
            </g>
          )}
          <text x="160" y="166" textAnchor="middle" fontSize="13" fill="currentColor">
            {force === "equilibrium"
              ? "Loads balanced by support reactions"
              : force === "tension"
                ? "Pulling forces stretch the member"
                : "Pushing forces squeeze the member"}
          </text>
        </svg>
      ) : (
        <div
          role="img"
          aria-label={`${title}: illustration unavailable`}
          className="flex h-44 items-center justify-center p-4 text-sm text-muted-foreground sm:h-48"
        >
          Illustration unavailable
        </div>
      )}
      <figcaption className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
        {image && image !== failedImage
          ? "Game lesson illustration"
          : force
            ? "Concept diagram · Based on lesson notes"
            : "Illustration unavailable"}
      </figcaption>
    </figure>
  );
}
