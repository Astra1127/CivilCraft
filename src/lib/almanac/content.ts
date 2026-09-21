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
    description: "A straightforward bridge form used in the player's early projects.",
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
    description: "Uses connected structural members, commonly arranged in triangular forms.",
    howItWorks:
      "Triangular frames distribute loads through connected members, which mainly carry tension or compression in a simplified truss.",
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
    description: "Uses a curved structural form to transfer loads toward its supports.",
    howItWorks:
      "The arch turns downward load into compression along the curve, which is delivered sideways into the abutments.",
    strengths:
      "Carries loads mainly through compression when its supports resist the outward push.",
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
    description: "Uses cables or ropes to support the bridge deck across longer spans.",
    howItWorks:
      "The deck hangs from vertical hangers on a main cable; the cable pulls in tension and the towers push down in compression.",
    strengths: "Cables can support a deck across long spans.",
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
    summary:
      "Dead load is the bridge's own weight. Live load changes as vehicles or other traffic use the bridge.",
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
    summary:
      "A stable bridge resists changes in shape. In equilibrium, forces and turning effects balance so it remains at rest.",
    diagram: "△ stable   □ racks",
  },
  {
    id: "structural-failure",
    name: "Structural Failure",
    summary: "A bridge or member can deform or break when it cannot carry the applied forces.",
    diagram: "──/ /──  member snaps",
  },
];

/** Materials available in Civil Craft's build mode. */
export const materials: MaterialEntry[] = [
  {
    id: "wood_beam",
    name: "Wood Beam",
    note: "A wooden structural member used to form a bridge framework.",
  },
  {
    id: "steel_beam",
    name: "Steel Beam",
    note: "A steel structural member used in demanding bridge projects.",
  },
  {
    id: "rope",
    name: "Rope",
    note: "Supports a suspended bridge deck through tension.",
  },
  {
    id: "wood_support",
    name: "Wood Support / Pier",
    note: "A wooden support that transfers bridge loads toward the ground.",
  },
  {
    id: "wood_road",
    name: "Wood Road",
    note: "The wooden deck surface used by vehicles crossing the bridge.",
  },
  {
    id: "concrete_road",
    name: "Concrete Road",
    note: "A concrete deck surface for a bridge crossing.",
  },
  {
    id: "concrete_member",
    name: "Concrete Structural Member",
    note: "A concrete member used to form the bridge structure.",
  },
  {
    id: "concrete_support",
    name: "Concrete Support / Pier",
    note: "A concrete support that transfers bridge loads toward the ground.",
  },
  {
    id: "steel_road",
    name: "Steel Road",
    note: "A steel deck surface used by vehicles crossing the bridge.",
  },
  {
    id: "steel_support",
    name: "Steel Support",
    note: "A steel support that carries loads from the bridge structure.",
  },
  {
    id: "steel_cable",
    name: "Steel Cable",
    note: "A steel cable that supports a suspended deck through tension.",
  },
];

export function getConcepts(ids: string[]): EngineeringConcept[] {
  return ids
    .map((id) => engineeringConcepts.find((c) => c.id === id))
    .filter((c): c is EngineeringConcept => !!c);
}

export function getBridgeType(id: string | undefined): BridgeTypeEntry | undefined {
  return id ? bridgeTypes.find((b) => b.bridgeTypeId === id) : undefined;
}
