// ─── OPTIMISATION GLOBALE ────────────────────────────────────────────────────
// Algorithme principal d'affectation des camions entre TOUS les chantiers
// Indépendant du type de chantier (enrobés, béton, terrassement...)
// Reçoit des objets "besoin" normalisés produits par chaque module calculs*
// Import des fonctions communes
import { heureEnMinutes } from "./calculs/calculsCommuns";
// Import des fonctions spécifiques enrobés
import { calculerRotationsEnrobes, genererPlanningCamionEnrobes, comparerCentrales } from "./calculs/calculsEnrobes";
// Import de la flotte camions Colas AM
import flotteCamions from "../data/flotte_camions_colasAM.json";

// ─── RE-EXPORTS ──────────────────────────────────────────────────────────────
// Pour compatibilité avec les imports existants dans FormulaireChantier et RecapJournalier
export { comparerCentrales } from "./calculs/calculsEnrobes";
export { trouverZone }       from "./calculs/calculsCommuns";

// ─── ROUTER DE CALCUL ────────────────────────────────────────────────────────
// Selon le type de chantier, appelle le bon module de calcul
// Retourne toujours un objet normalisé avec nbCamions, typeCamion, horaires...
function calculerBesoin(chantier) {
  switch (chantier.typeChantier) {
    case "enrobes":
      return calculerRotationsEnrobes(chantier);
    // À venir :
    // case "beton":        return calculerRotationsBeton(chantier);
    // case "terrassement": return calculerRotationsTerrassement(chantier);
    // case "fraisat":      return calculerRotationsFraisat(chantier);
    // case "multi_flux":   return calculerRotationsMultiFlux(chantier);
    default:
      // Par défaut → enrobés (compatibilité avec les chantiers saisis sans typeChantier)
      return calculerRotationsEnrobes(chantier);
  }
}

// ─── ROUTER DE PLANNING ──────────────────────────────────────────────────────
// Selon le type de chantier, génère le bon planning camion
function genererPlanningCamion(camion, chantier, calc, decalage = 0) {
  switch (chantier.typeChantier) {
    case "enrobes":
      return genererPlanningCamionEnrobes(camion, chantier, calc, decalage);
    // À venir :
    // case "beton":        return genererPlanningCamionBeton(...)
    // case "terrassement": return genererPlanningCamionTerrassement(...)
    default:
      return genererPlanningCamionEnrobes(camion, chantier, calc, decalage);
  }
}

// ─── EXPORT CALCULER ROTATIONS ───────────────────────────────────────────────
// Exporté pour compatibilité avec RecapJournalier (journal de calcul)
export function calculerRotations(chantier) {
  return calculerBesoin(chantier);
}

// ─── ALGORITHME PRINCIPAL D'OPTIMISATION ─────────────────────────────────────
// Affecte les camions Colas en priorité, complète avec des locatiers si nécessaire
// Gère la disponibilité des camions entre chantiers (un camion libre à X peut repartir sur un autre chantier)
export function optimiser(chantiers) {
  if (!chantiers || chantiers.length === 0) return { plannings: [], locatiers: 0 };

  // Trier par date puis heure de début → traiter les chantiers dans l'ordre chronologique
  const sorted = [...chantiers].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (heureEnMinutes(a.heureDebut) ?? 0) - (heureEnMinutes(b.heureDebut) ?? 0);
  });

  // Camions Colas disponibles triés par priorité (priorité 1 = premier affecté)
  const camionsDispos = [...flotteCamions]
    .filter((c) => c.disponible)
    .sort((a, b) => a.priorite - b.priorite);

  const planningsFinal = [];
  const camionsOccupes = {}; // camionId → libreAMin (heure à laquelle le camion est de nouveau disponible)

  let locatiersNecessaires = 0;

  console.log("Chantiers reçus:", chantiers);
  console.log("Sorted:", sorted);

  for (const chantier of sorted) {
    // Calcul des besoins pour ce chantier (selon son type)
    const calc = calculerBesoin(chantier);
    console.log("CALC result:", calc);
    console.log("Chantier typeCamion:", chantier.typeCamion);
    console.log("Camions dispos:", camionsDispos.map(c => ({ id: c.id, type_id: c.type_id, disponible: c.disponible })));
    console.log("CALC nbCamions:", calc?.nbCamions);
    if (!calc) continue;

    let camionsAAffecter = calc.nbCamions;
    let decalage = 0;

    // Affecter les camions Colas disponibles en priorité
    for (const camion of camionsDispos) {
      if (camionsAAffecter <= 0) break;
      if (camion.type_id !== chantier.typeCamion) continue; // mauvais type de camion

      // Vérifier si le camion est libre à temps (marge de 30 min)
      const libreA = camionsOccupes[camion.id] ?? 0;
      if (libreA > calc.heureDepartCentrale + 30) continue;

      const planning = genererPlanningCamion(camion, chantier, calc, decalage);
      planningsFinal.push(planning);
      camionsOccupes[camion.id] = planning.libreAMin;
      camionsAAffecter--;
      decalage++;
    }

    // Compléter avec des locatiers si pas assez de camions Colas
    if (camionsAAffecter > 0) {
      locatiersNecessaires += camionsAAffecter;
      for (let i = 0; i < camionsAAffecter; i++) {
        const planning = genererPlanningCamion(
          {
            id: `loc-${i}`,
            immatriculation: null,
            type_vehicule: chantier.typeCamion,
            proprietaire: "Locatier",
          },
          chantier,
          calc,
          decalage
        );
        planningsFinal.push(planning);
        decalage++;
      }
    }
  }

  return {
    plannings:     planningsFinal,
    locatiers:     locatiersNecessaires,
    totalCamions:  planningsFinal.length,
    camionsColas:  planningsFinal.filter((p) => p.proprietaire === "Colas").length,
  };
}