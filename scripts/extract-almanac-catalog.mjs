// Read-only Unity asset export. Run from the website root; never reads player saves.
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
const root = path.resolve("../CivilCraft_Apk/Civil-Craft/Assets");
const dataRoot = path.join(root, "BridgeBuilder/Data");
const read = (file) =>
  yaml.load(
    fs
      .readFileSync(file, "utf8")
      .replace(/^%.*$/gm, "")
      .replace(/^--- !u!.*$/gm, "---"),
  ).MonoBehaviour;
const plain = (value) =>
  String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .trim();
const aliases = {
  ConcreteBeam: "concrete_member",
  Beam: "wood_beam",
  Pier: "wood_support",
  RopeMaterial: "rope",
  "Wood Road": "wood_road",
  "Concrete Road": "concrete_road",
};
const lessons = [];
const materials = [];
const assetPaths = fs.readdirSync(root, { recursive: true });
const imageGuids = new Map();
for (const relative of assetPaths.filter((p) => /\.(png|jpg)\.meta$/i.test(p))) {
  const meta = fs.readFileSync(path.join(root, relative), "utf8");
  const guid = meta.match(/^guid: (\w+)/m)?.[1];
  // Full single sprites only: do not copy sprite atlases as standalone diagrams.
  if (guid && /spriteMode: 1\b/.test(meta)) imageGuids.set(guid, relative.slice(0, -5));
}
function illustration(ref) {
  const relative = imageGuids.get(ref?.guid);
  if (!relative) return {};
  const name = `${ref.guid}${path.extname(relative).toLowerCase()}`;
  fs.mkdirSync("public/images/almanac-game", { recursive: true });
  fs.copyFileSync(path.join(root, relative), `public/images/almanac-game/${name}`);
  return { image: `/images/almanac-game/${name}`, imageSource: relative.replaceAll("\\", "/") };
}
for (const relative of fs
  .readdirSync(dataRoot, { recursive: true })
  .filter((p) => p.endsWith(".asset"))) {
  const source = path.join(dataRoot, relative);
  const raw = fs.readFileSync(source, "utf8");
  if (!/lessonTitle:|costPerMeter:/.test(raw)) continue;
  const item = read(source);
  const provenance = path.relative(root, source).replaceAll("\\", "/");
  if (item.lessonTitle) {
    if (!item.lessonId || item.lessonTitle === "Lesson Title") continue;
    lessons.push({
      id: item.lessonId.trim(),
      title: item.lessonTitle,
      topic:
        item.lessonId.trim() === "LESSON002"
          ? "Beam bridge"
          : item.lessonId.trim() === "LESSON004"
            ? "Truss bridge"
            : "Structural principles",
      description: plain(item.lessonDescription || item.popupDescription),
      ...illustration(item.almanacImage?.guid ? item.almanacImage : item.lessonImage),
      source: provenance,
    });
  } else {
    const unityId = String(item.materialId || item.m_Name).trim();
    materials.push({
      id: aliases[unityId] || unityId,
      unityId,
      name: plain(item.displayName || item.m_Name.replace("Material", "")),
      description: plain(item.almanacDescription || item.introductionDescription),
      costPerMeter: item.costPerMeter,
      massPerMeter: item.massPerMeter,
      maxLength: Number.isFinite(item.maxLength) ? item.maxLength : null,
      maxTension: item.maxTension,
      maxCompression: item.maxCompression,
      dual: !!item.isDualBeam,
      pier: !!item.isPier,
      ...illustration(
        item.almanacImage?.guid
          ? item.almanacImage
          : item.introductionImage?.guid
            ? item.introductionImage
            : item.materialIcon,
      ),
      source: provenance,
    });
  }
}
fs.writeFileSync(
  "src/lib/almanac/game-catalog.json",
  JSON.stringify({ lessons, materials }, null, 2) + "\n",
);
