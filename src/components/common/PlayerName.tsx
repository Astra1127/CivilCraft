import { parsePlayerName } from "@/lib/player-name";

export function PlayerName({
  name,
  fallback = "Engineer",
  className,
}: {
  name: string | null | undefined;
  fallback?: string;
  className?: string;
}) {
  const { text, color } = parsePlayerName(name, fallback);
  return (
    <span className={className} style={color ? { color } : undefined}>
      {text}
    </span>
  );
}
