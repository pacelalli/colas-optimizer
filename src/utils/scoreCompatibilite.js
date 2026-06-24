// ─── SCORE DE COMPATIBILITÉ ENTRE CHANTIERS ──────────────────────────────────
// Implémente le score sur 4 critères (1 point chacun) de la slide III.5.
// Le score est DIRECTIONNEL (un camion finissant sur A va renforcer B) : on
// évalue les deux sens et on garde le meilleur.
import { haversine } from "./calculs/calculsCommuns";
import distances from "../data/distances.json";
import { calculerRotations } from "./optimisation";
import typesCamions from "../data/type_camions.json";

// Sens du cycle déduit du type de chantier (apport vs évacuation)
export const TYPES_APPORT = ["enrobes", "beton", "materiau"];
export const TYPES_EVACUATION = ["terrassement", "fraisat"];

// ─── Critère 3 : matériaux compatibles (DIRECTIONNEL A → B) ──────────────────
// Règle métier : une benne venant de béton / terrassement / apport matériau ne
// peut PAS aller renforcer un chantier d'ENROBÉS (propreté de la benne).
// Tout le reste passe (enrobés → tout OK, rabotage → tout OK, → non-enrobés OK).
// ➜ matrice éditable : il suffit d'ajouter/retirer des types ci-dessous.
const INTERDITS_VERS_ENROBES = ["beton", "terrassement", "materiau"];
export function materiauxCompatibles(typeA, typeB) {
  if (typeB === "enrobes" && INTERDITS_VERS_ENROBES.includes(typeA)) return false;
  return true;
}

// ─── Seuils (éditables) ──────────────────────────────────────────────────────
const SEUIL_PROXIMITE_KM = 12;   // proximité chantier ↔ chantier (vol d'oiseau)
const SEUIL_CENTRALE_MIN = 30;   // centrale de B atteignable depuis la zone de A

function coords(c) {
  const lat = typeof c.lat === "number" ? c.lat : parseFloat((c.coordonnees || "").split(",")[0]);
  const lng = typeof c.lng === "number" ? c.lng : parseFloat((c.coordonnees || "").split(",")[1]);
  return [lat, lng];
}

// ─── Score DIRECTIONNEL : un camion finissant sur A va renforcer B ───────────
export function scoreCompatibilite(A, B) {
  // 1 — Type de camion compatible (symétrique)
  const camion = A.typeCamion === B.typeCamion;

  // 2 — Proximité géographique A ↔ B (symétrique) : même commune ou ≤ 12 km
  const [latA, lngA] = coords(A);
  const [latB, lngB] = coords(B);
  const memeZone = !!A.zoneId && A.zoneId === B.zoneId;
  const dist = haversine(latA, lngA, latB, lngB);
  const proximite = memeZone || dist <= SEUIL_PROXIMITE_KM;

  // 3 — Matériaux compatibles (directionnel A → B)
  const materiaux = materiauxCompatibles(A.typeChantier, B.typeChantier);

  // 4 — Cohérence centrale / exutoire (version simple) :
  //     même centrale, ou centrale de B atteignable depuis la zone de A ≤ 30 min
  const memeCentrale = !!A.centrale && A.centrale === B.centrale;
  const tCentrale = distances?.[B.centrale]?.[A.zoneId];
  const centrale = memeCentrale || (typeof tCentrale === "number" && tCentrale <= SEUIL_CENTRALE_MIN);

  const criteres = { camion, proximite, materiaux, centrale };
  const score = [camion, proximite, materiaux, centrale].filter(Boolean).length;
  return { score, criteres, distanceKm: Math.round(dist * 10) / 10 };
}

export function recommandation(score) {
  if (score === 4) return "Mutualisation fortement recommandée — toutes les conditions réunies";
  if (score === 3) return "Rapprochement intéressant — à étudier selon le contexte";
  if (score === 2) return "Compatibilité partielle — gain incertain, jugement nécessaire";
  return "Peu pertinent — signalé mais non recommandé";
}

// ─── Évalue les DEUX sens, garde le meilleur ─────────────────────────────────
export function meilleureCompatibilite(A, B) {
  const ab = scoreCompatibilite(A, B);
  const ba = scoreCompatibilite(B, A);
  const best = ba.score > ab.score
    ? { ...ba, sens: "B->A", source: B, cible: A }
    : { ...ab, sens: "A->B", source: A, cible: B };
  return { ...best, recommandation: recommandation(best.score) };
}

// ─── Toutes les paires d'une journée ─────────────────────────────────────────
// Retour : { pertinentes (score ≥ 2, triées), faibles (≤ 1), toutes }
export function analyserCompatibilites(chantiers) {
  const list = [];
  const arr = chantiers || [];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      const r = meilleureCompatibilite(arr[i], arr[j]);
      list.push({ a: arr[i], b: arr[j], ...r });
    }
  }
  list.sort((x, y) => y.score - x.score);
  return {
    pertinentes: list.filter((r) => r.score >= 2),
    faibles: list.filter((r) => r.score <= 1),
    toutes: list,
  };
}

// ─── PROPOSITION DE COMBLEMENT (renfort partiel) ─────────────────────────────
// Quand le renfort (1 rotation du camion libéré) ne suffit pas à retirer un
// camion entier sur B, on cherche à le RETIRER quand même en comblant le trou
// avec des porteurs moins chers (4x2 / 8x4). On teste 1·2·3… de chaque type,
// on recalcule leur capacité-nuit RÉELLE (rotations possibles × capacité), et on
// garde l'option la moins chère qui couvre le trou.
const PORTEURS_COMBLEMENT = ["4x2", "8x4"];

function prixType(typeId, nuit) {
  const t = typesCamions.find((x) => x.id === typeId);
  if (!t) return null;
  return nuit ? t.prix_locatier_nuit : t.prix_locatier_jour;
}

export function proposerComblement(chantierB) {
  const calcB = calculerRotations(chantierB);
  if (!calcB) return null;

  const nuit = !!chantierB.chantierNuit;
  const cap = calcB.capacite;
  const tonnageB = parseFloat(chantierB.tonnage) || 0;

  // Tonnage du camion marginal de B = ce que les autres camions ne peuvent pas absorber
  const tonnageMarginal = Math.max(
    0,
    Math.round(tonnageB - (calcB.nbCamions - 1) * calcB.rotationsParCamion * cap)
  );
  const renfort = cap;                          // 1 rotation du camion libéré (même type que B)
  const trou = Math.max(0, tonnageMarginal - renfort);
  const prixRetire = prixType(chantierB.typeCamion, nuit);  // prix du camion marginal retiré

  // Le renfort couvre déjà tout le camion marginal → on le retire sans rien commander
  if (trou === 0) {
    return {
      tonnageMarginal, renfort, trou: 0,
      typeRetire: chantierB.typeCamion, prixRetire,
      nuit, option: null, bilanNet: -prixRetire,
    };
  }

  // Tester chaque porteur de comblement, garder le moins cher qui couvre le trou
  let meilleure = null;
  const optionsTestees = [];
  for (const typeId of PORTEURS_COMBLEMENT) {
    const calcType = calculerRotations({ ...chantierB, typeCamion: typeId });
    if (!calcType) continue;
    const capaciteNuit = calcType.rotationsParCamion * calcType.capacite;  // RECALCULÉE
    if (capaciteNuit <= 0) continue;
    const nb = Math.ceil(trou / capaciteNuit);
    const prix = prixType(typeId, nuit);
    const cout = nb * prix;
    const opt = { type: typeId, nb, capaciteUnite: capaciteNuit, prixUnite: prix, cout };
    optionsTestees.push(opt);
    if (!meilleure || cout < meilleure.cout) meilleure = opt;
  }

  return {
    tonnageMarginal, renfort, trou,
    typeRetire: chantierB.typeCamion, prixRetire,
    nuit, option: meilleure, optionsTestees,
    bilanNet: meilleure ? -prixRetire + meilleure.cout : null,
  };
}
