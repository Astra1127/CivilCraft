import { useState } from "react";
import { IllustrationPreview } from "./IllustrationPreview";

/** Diagrams illustrate only the pushing, pulling and balanced forces in the authored notes. */
export function LessonIllustration({
  id,
  title,
  image,
  compact = false,
}: {
  id: string;
  title: string;
  image?: string;
  compact?: boolean;
}) {
  const [failedImage, setFailedImage] = useState<string>();
  const force =
    id === "What is Tension"
      ? "tension"
      : id === "What is Compression"
        ? "compression"
        : id === "What is Equilibrium"
          ? "equilibrium"
          : ["bending", "support", "shear", "load-distribution", "structural-failure"].includes(id)
            ? id
            : undefined;
  const height = compact ? "h-28 sm:h-32" : "h-44 sm:h-48";
  const descriptions: Record<string, string> = {
    bending: "A beam curves under a downward load between its supports",
    support: "Piers transfer loads from the deck toward the ground",
    shear: "Opposing forces try to slide two parts past each other",
    "load-distribution": "Loads travel from the deck through members and supports to the ground",
    "structural-failure": "A member can deform or break under excessive forces",
  };
  const canEnlarge = !!((image && image !== failedImage) || force);
  const renderVisual = (enlarged = false) =>
    image && image !== failedImage ? (
      <img
        src={image}
        alt={`${title} lesson illustration`}
        loading="lazy"
        onError={() => setFailedImage(image)}
        className={
          enlarged
            ? "block h-full w-full min-h-0 min-w-0 object-contain"
            : `${height} w-full object-contain p-3`
        }
      />
    ) : force ? (
      <svg
        viewBox="0 0 320 180"
        role="img"
        aria-label={`${title}: ${descriptions[force] ?? (force === "equilibrium" ? "downward loads balanced by upward support reactions" : force === "tension" ? "forces pull away from opposite ends of a member" : "forces push toward opposite ends of a member")}`}
        className={
          enlarged
            ? "h-full w-full min-h-0 min-w-0 text-primary"
            : `${height} w-full p-3 text-primary`
        }
      >
        {descriptions[force] ? (
          <g
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {force === "bending" ? (
              <path d="M45 75Q160 125 275 75M60 85l-15 32h30zM260 85l-15 32h30zM160 20v48m-10-12 10 12 10-12" />
            ) : force === "shear" ? (
              <path d="M85 60h150M85 110h150M45 45h80m-12-10 12 10-12 10M275 125h-80m12-10-12 10 12 10" />
            ) : force === "structural-failure" ? (
              <path d="M45 80h95l-10 20 25-8M275 80H175l10-20-25 8" />
            ) : (
              <path d="M45 65h230M80 75v60h30V75M210 75v60h30V75M50 145h220M160 15v40m-10-12 10 12 10-12" />
            )}
          </g>
        ) : (
          <>
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
          </>
        )}
        <text x="160" y="166" textAnchor="middle" fontSize="13" fill="currentColor">
          {descriptions[force]
            ? title
            : force === "equilibrium"
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
        className={`${height} flex items-center justify-center p-4 text-sm text-muted-foreground`}
      >
        Illustration unavailable
      </div>
    );
  return (
    <figure
      className={`${compact ? "mb-2" : "mb-4"} min-w-0 overflow-hidden rounded-xl border border-border bg-secondary/50`}
    >
      {canEnlarge ? (
        <IllustrationPreview title={title} preview={renderVisual(true)}>
          {renderVisual()}
        </IllustrationPreview>
      ) : (
        renderVisual()
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
