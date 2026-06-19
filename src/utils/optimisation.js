// ─── OPTIMISATION GLOBALE ────────────────────────────────────────────────────
// Algorithme principal d'affectation des camions entre TOUS les chantiers
// Indépendant du type de chantier (enrobés, béton, terrassement...)
// Reçoit des objets "besoin" normalisés produits par chaque module calculs*
// Import des fonctions communes
import { heureEnMinutes } from "./calculs/calculsCommuns";
import centrales from "../data/centrales.json";
// Import des fonctions spécifiques enrobés
import { calculerRotationsEnrobes, genererPlanningCamionEnrobes, comparerCentrales } from "./calculs/calculsEnrobes";
// Import de la flotte camions Colas AM
import flotteCamions from "../data/flotte_camions_colasAM.json";
//
import { calculerRotationsRabotage, genererPlanningCamionRabotage, comparerCentralesFraisat } from "./calculs/calculsRabotage";
import { calculerRotationsTerrassement, genererPlanningCamionTerrassement } from "./calculs/calculsTerrassement";
import { calculerRotationsBeton, genererPlanningCamionBeton } from "./calculs/calculsBeton";

// ─── RE-EXPORTS ──────────────────────────────────────────────────────────────
// Pour compatibilité avec les imports existants dans FormulaireChantier et RecapJournalier
export { comparerCentrales } from "./calculs/calculsEnrobes";
export { trouverZone }       from "./calculs/calculsCommuns";
export { comparerCentralesFraisat } from "./calculs/calculsRabotage";

// ─── ROUTER DE CALCUL ────────────────────────────────────────────────────────
// Selon le type de chantier, appelle le bon module de calcul
// Retourne toujours un objet normalisé avec nbCamions, typeCamion, horaires...
function calculerBesoin(chantier) {
  switch (chantier.typeChantier) {
    case "enrobes":
      return calculerRotationsEnrobes(chantier);
    case "fraisat":
      return calculerRotationsRabotage(chantier);
      case "terrassement":
        return calculerRotationsTerrassement(chantier);
      case "beton":
        return calculerRotationsBeton(chantier);
    // À venir :
    // case "beton":        return calculerRotationsBeton(chantier);
    // case "terrassement": return calculerRotationsTerrassement(chantier);
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
    case "fraisat":
      return genererPlanningCamionRabotage(camion, chantier, calc, decalage);
    case "terrassement":
      return genererPlanningCamionTerrassement(camion, chantier, calc, decalage);
    case "beton":
      return genererPlanningCamionBeton(camion, chantier, calc, decalage);
    // À venir :
    // case "multi-flux":        
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

// ─── OPTIMISATION D'UNE JOURNÉE ──────────────────────────────────────────────
// Analyse tous les chantiers d'une même journée/nuit et identifie les renforts
// possibles entre chantiers proches pour réduire le nb de camions total
// Seuil de distance inter-chantiers : 12 km à vol d'oiseau
const SEUIL_RENFORT_KM = 12;

export function optimiserJournee(chantiersJournee) {
  if (!chantiersJournee || chantiersJournee.length < 2) {
    return {
      chantiers: chantiersJournee?.map(c => ({
        chantier: c,
        calc: calculerBesoin(c),
        renforts: [],
        nbCamionsFinal: calculerBesoin(c)?.nbCamions ?? 0,
      })) ?? [],
      totalCamionsAvant: 0,
      totalCamionsApres: 0,
      economie: 0,
      renforts: [],
    };
  }

  // ── ÉTAPE 1 : Calculer les besoins de chaque chantier ─────────────────────
  const chantiersCalc = chantiersJournee.map(c => {
    const calc = calculerBesoin(c);
    return {
      chantier: c,
      calc,
      // Heure de fin du dernier camion sur ce chantier
      // = heure départ centrale + nbCamions × tempsCycle (décalé)
      // Le premier camion finit à : heureDepartCentrale + rotationsParCamion × tempsCycle
      heureFinDernierCamion: calc
        ? calc.heureDepartCentrale + calc.rotationsParCamion * calc.tempsCycle
        : null,
      // Temps restant après fin des rotations jusqu'à fin chantier
      tempsLibreApresRotations: calc
        ? calc.heureFinMin - (calc.heureDepartCentrale + calc.rotationsParCamion * calc.tempsCycle)
        : 0,
      nbCamionsFinal: calc?.nbCamions ?? 0,
      renforts: [], // renforts reçus depuis d'autres chantiers
      renforceChantiersIds: [], // chantiers qu'il renforce
    };
  });

  // ── ÉTAPE 2 : Identifier les renforts possibles ───────────────────────────
  // Pour chaque paire (A, B) de chantiers :
  const renforts = [];

  for (const itemA of chantiersCalc) {
    if (!itemA.calc) continue;
    if (itemA.tempsLibreApresRotations <= 0) continue; // pas de temps libre sur A

    for (const itemB of chantiersCalc) {
      if (itemA === itemB) continue; // pas de renfort sur soi-même
      if (!itemB.calc) continue;
      if (itemA.chantier.typeCamion !== itemB.chantier.typeCamion) continue; // types incompatibles
      if (itemA.chantier.chantierNuit !== itemB.chantier.chantierNuit) continue; // jour/nuit incompatibles

      // Distance entre les deux chantiers (Haversine)
      const distKm = haversine(
        parseFloat(itemA.chantier.lat), parseFloat(itemA.chantier.lng),
        parseFloat(itemB.chantier.lat), parseFloat(itemB.chantier.lng)
      );

      if (distKm > SEUIL_RENFORT_KM) continue; // trop loin

      // Temps de trajet entre A et B (estimation : vitesse moyenne 40 km/h en ville AM)
      // + temps chargement si chantier B nécessite apport matériau
      const type = getTypeCamion(itemA.chantier.typeCamion);
      const coeffCamion = type?.coeff_vitesse ?? 1.0;
      const vitesseMoyenne = 40; // km/h moyenne en AM
      const tempsTrajetAB = Math.round((distKm / vitesseMoyenne) * 60 * coeffCamion);

      // Pour aller renforcer B depuis A, il faut :
      // Si B = enrobés → aller à la centrale de B charger, puis aller sur B
      let tempsRepositionnement = tempsTrajetAB;
      if (itemB.chantier.typeChantier === "enrobes" || !itemB.chantier.typeChantier) {
        // Trouver la centrale de B
        const centraleB = centrales.find(c => c.id === itemB.calc.centraleId);
        if (centraleB) {
          // Trajet A → centrale B + chargement + centrale B → chantier B
          const distACentraleB = haversine(
            parseFloat(itemA.chantier.lat), parseFloat(itemA.chantier.lng),
            centraleB.lat, centraleB.lng
          );
          const tempsACentraleB = Math.round((distACentraleB / vitesseMoyenne) * 60 * coeffCamion);
          const tempsChargement = (type?.temps_chargement_enrobe ?? 6) + (type?.temps_bachage_enrobe ?? 6);
          const tempsCentraleBVersChantierB = itemB.calc.tempsTrajet;
          tempsRepositionnement = tempsACentraleB + tempsChargement + tempsCentraleBVersChantierB;
        }
      }

      // Temps disponible après repositionnement
      const tempsDispoRenfort = itemA.tempsLibreApresRotations - tempsRepositionnement;

      // Peut-il faire au moins 1 rotation complète sur B ?
      if (tempsDispoRenfort < itemB.calc.tempsCycle) continue;

      // Nombre de rotations supplémentaires possibles sur B
      const rotationsRenfort = Math.floor(tempsDispoRenfort / itemB.calc.tempsCycle);
      const tonnageRenfort = rotationsRenfort * itemB.calc.capacite;

      // Est-ce que ce renfort permet de retirer 1 camion de B ?
      // Un camion de moins sur B = rotationsParCamion × capacite de moins
      const tonnageEconomise = itemB.calc.rotationsParCamion * itemB.calc.capacite;
      const renfortUtile = tonnageRenfort >= tonnageEconomise * 0.8; // 80% du tonnage d'un camion suffit

      if (!renfortUtile) continue;

      // ✅ Renfort identifié
      renforts.push({
        chantierA:         itemA.chantier.nomChantier,
        chantierB:         itemB.chantier.nomChantier,
        distanceKm:        Math.round(distKm * 10) / 10,
        tempsTrajetAB,
        tempsRepositionnement,
        rotationsRenfort,
        tonnageRenfort:    Math.round(tonnageRenfort),
        camionsEconomises: 1,
      });

      // Mettre à jour le nb de camions de B
      itemB.nbCamionsFinal = Math.max(1, itemB.nbCamionsFinal - 1);
      itemB.renforts.push({
        depuis: itemA.chantier.nomChantier,
        rotations: rotationsRenfort,
        tonnage: Math.round(tonnageRenfort),
      });
    }
  }

  // ── ÉTAPE 3 : Calculer les économies ─────────────────────────────────────
  const totalCamionsAvant = chantiersCalc.reduce((acc, i) => acc + (i.calc?.nbCamions ?? 0), 0);
  const totalCamionsApres = chantiersCalc.reduce((acc, i) => acc + i.nbCamionsFinal, 0);
  const economie = totalCamionsAvant - totalCamionsApres;

  console.log(`=== OPTIMISATION JOURNÉE ===`);
  console.log(`Chantiers : ${chantiersJournee.length}`);
  console.log(`Camions avant : ${totalCamionsAvant} → après : ${totalCamionsApres}`);
  console.log(`Économie : ${economie} camion(s)`);
  console.log(`Renforts identifiés :`, renforts);

  return {
    chantiers:          chantiersCalc,
    totalCamionsAvant,
    totalCamionsApres,
    economie,
    renforts,
  };
}

export function extrairePlanningParCamion(plannings) {
  // plannings = tableau de { camionId, immatriculation, type, proprietaire, 
  //                          chantier, centraleId, rotations, libreA }

  const parCamion = {};

  for (const p of plannings) {
    if (!parCamion[p.camionId]) {
      parCamion[p.camionId] = {
        camionId:        p.camionId,
        immatriculation: p.immatriculation,
        type:            p.type,
        proprietaire:    p.proprietaire,
        missions:        [], // liste de toutes les rotations, tous chantiers confondus
        libreA:          p.libreA,
      };
    }

    // Ajouter les rotations de ce chantier avec le nom du chantier et la centrale
    for (const r of p.rotations) {
      parCamion[p.camionId].missions.push({
        ...r,
        chantier:   p.chantier,
        centraleId: p.centraleId,
      });
    }

    // Mettre à jour heure de fin (la plus tardive)
    parCamion[p.camionId].libreA = p.libreA;
  }

  // Trier les missions de chaque camion par heure de départ
  return Object.values(parCamion).map(c => ({
    ...c,
    missions: c.missions.sort((a, b) => {
  const toMin = h => {
    if (!h) return 0;
    const [hh, mm] = h.replace("h", ":").split(":").map(Number);
    return hh * 60 + mm;
  };
  // Pour rabotage, l'heure de référence est debut_chargement
  const heureA = a.depart_centrale ?? a.debut_chargement ?? "00h00";
  const heureB = b.depart_centrale ?? b.debut_chargement ?? "00h00";
  const mA = toMin(heureA);
  const mB = toMin(heureB);
  if (Math.abs(mA - mB) > 720) return mA > mB ? -1 : 1;
  return mA - mB;
}),
  }));
}