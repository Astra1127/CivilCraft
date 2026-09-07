/**
 * ALMANAC EDUCATIONAL CONTENT.
 *
 * This is website/CMS-owned presentation content: bridge type descriptions,
 * engineering concept explanations and material notes. It is NOT player data —
 * completions, scores, screenshots and progression come from the game backend
 * through `src/lib/playfab`.
 *
 * Admins may eventually edit these entries from the Admin Dashboard; the
 * shapes below are intentionally CMS-friendly.
 */

export interface EngineeringConcept {
  id: string;
  name: string;
  /** One-line, game-relevant explanation. Avoid textbook paragraphs. */
  summary: string;
  /** Simple ASCII-style force diagram rendered in the UI. */
  diagram?: string;
}

export interface BridgeTypeEntry {
  bridgeTypeId: string;
  name: string;
  description: string;
  howItWorks: string;
  strengths: string;
  /** Where the type shows up in Civil Craft. */
  inGame: string;
  conceptIds: string[];
  realWorld?: { name: string; location: string; why: string };
}

export interface MaterialEntry {
  id: string;
  name: string;
  note: string;
}

/** The four bridge types used in Civil Craft. Never add a fifth. */
export const bridgeTypes: BridgeTypeEntry[] = [
  {
    bridgeTypeId: "beam",
    name: "Beam Bridge",
    description:
      "The simplest build: a deck resting on supports at each end.",
    howItWorks:
      "Load pushes down on the deck, which bends between its supports and passes the weight straight down into them.",
    strengths: "Cheap, fast to build, ideal for short spans.",
    inGame: "Early contracts with narrow gaps and tight budgets.",
    conceptIds: ["load", "bending", "support"],
    realWorld: {
      name: "Lake Pontchartrain Causeway",
      location: "Louisiana, USA",
      why: "A very long crossing built as many short beam spans resting on piers.",
    },
  },
  {
    bridgeTypeId: "truss",
    name: "Truss Bridge",
    description: "A framework of triangles carrying the deck.",
    howItWorks:
      "Triangles cannot deform without changing member length, so each member carries pure tension or compression instead of bending.",
    strengths: "Strong for its weight, efficient across medium spans.",
    inGame: "The workhorse of the canyon contracts.",
    conceptIds: ["tension", "compression", "load-distribution", "stability"],
    realWorld: {
      name: "Quebec Bridge",
      location: "Quebec, Canada",
      why: "A steel truss crossing whose triangulated frame carries a very long span.",
    },
  },
  {
    bridgeTypeId: "arch",
    name: "Arch Bridge",
    description: "A curve that pushes its load outward into the ground.",
    howItWorks:
      "The arch turns downward load into compression along the curve, which is delivered sideways into the abutments.",
    strengths: "Very strong in compression, great over canyons.",
    inGame: "Canyon crossings where solid rock walls can take the thrust.",
    conceptIds: ["compression", "load-distribution", "support"],
    realWorld: {
      name: "Sydney Harbour Bridge",
      location: "Sydney, Australia",
      why: "A steel arch that carries its deck by compressing the arch into massive abutments.",
    },
  },
  {
    bridgeTypeId: "suspension",
    name: "Suspension Bridge",
    description: "Cables hung from towers hold the deck up.",
    howItWorks:
      "The deck hangs from vertical hangers on a main cable; the cable pulls in tension and the towers push down in compression.",
    strengths: "The only practical way across the widest gaps.",
    inGame: "Late, wide crossings with a larger budget.",
    conceptIds: ["tension", "compression", "load-distribution"],
    realWorld: {
      name: "Golden Gate Bridge",
      location: "San Francisco, USA",
      why: "Main cables in tension carry the deck between two compressed towers.",
    },
  },
];

/** Structural concepts actually experienced in Civil Craft gameplay. */
export const engineeringConcepts: EngineeringConcept[] = [
  {
    id: "tension",
    name: "Tension",
    summary: "Members being pulled apart.",
    diagram: "←──── TENSION ────→",
  },
  {
    id: "compression",
    name: "Compression",
    summary: "Members being pushed together.",
    diagram: "→── COMPRESSION ──←",
  },
  {
    id: "bending",
    name: "Bending",
    summary: "A deck or beam curving under weight placed between its supports.",
    diagram: "▁▂▃▄▃▂▁  deck sags",
  },
  {
    id: "shear",
    name: "Shear",
    summary: "Sliding force at a joint, where two parts try to move past each other.",
    diagram: "──→\n←──",
  },
  {
    id: "load",
    name: "Load",
    summary: "The weight a bridge carries — the deck itself plus vehicles crossing it.",
    diagram: "▼ ▼ ▼ ▼",
  },
  {
    id: "load-distribution",
    name: "Load Distribution",
    summary: "How a bridge transfers applied loads through the structure to the ground.",
    diagram: "deck → members → supports → ground",
  },
  {
    id: "support",
    name: "Support",
    summary: "The anchor points and piers that deliver load into the terrain.",
    diagram: "▲▲   ▲▲",
  },
  {
    id: "stability",
    name: "Stability",
    summary: "Whether a structure holds its shape once load is applied.",
    diagram: "△ stable   □ racks",
  },
  {
    id: "structural-failure",
    name: "Structural Failure",
    summary: "A member exceeding what it can carry, breaking the load path.",
    diagram: "──/ /──  member snaps",
  },
];

/** Materials available in Civil Craft's build mode. */
export const materials: MaterialEntry[] = [
  { id: "wood", name: "Wood Beam", note: "Cheap, light, low strength. Great for short members and early contracts." },
  { id: "steel", name: "Steel Beam", note: "Stronger in tension and compression, heavier on the budget." },
  { id: "cable", name: "Cable", note: "Tension only. Perfect for suspension builds, useless under compression." },
  { id: "support", name: "Support / Pier", note: "Carries load to the ground. Only buildable where terrain allows." },
  { id: "deck", name: "Road Deck", note: "The surface vehicles drive on. Must be continuous from bank to bank." },
];

export function getConcepts(ids: string[]): EngineeringConcept[] {
  return ids
    .map((id) => engineeringConcepts.find((c) => c.id === id))
    .filter((c): c is EngineeringConcept => !!c);
}

export function getBridgeType(id: string | undefined): BridgeTypeEntry | undefined {
  return id ? bridgeTypes.find((b) => b.bridgeTypeId === id) : undefined;
}
