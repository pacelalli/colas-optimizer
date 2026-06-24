// ─── OPTIMISATION GLOBALE ────────────────────────────────────────────────────
// Algorithme principal d'affectation des camions entre TOUS les chantiers
// Indépendant du type de chantier (enrobés, béton, terrassement...)
// Reçoit des objets "besoin" normalisés produits par chaque module calculs*
// Import des fonctions communes
import { heureEnMinutes, minutesEnHeure, haversine, getTypeCamion } from "./calculs/calculsCommuns";
import centrales from "../data/centrales.json";
// Import des fonctions spécifiques enrobés
import { calculerRotationsEnrobes, genererPlanningCamionEnrobes, comparerCentrales } from "./calculs/calculsEnrobes";
// Import de la flotte camions Colas AM
import flotteCamions from "../data/flotte_camions_colasAM.json";
//
import { calculerRotationsRabotage, genererPlanningCamionRabotage, comparerCentralesFraisat } from "./calculs/calculsRabotage";
import { calculerRotationsTerrassement, genererPlanningCamionTerrassement } from "./calculs/calculsTerrassement";
import { calculerRotationsBeton, genererPlanningCamionBeton } from "./calculs/calculsBeton";
// ← NOUVEAU : matériau
import { calculerRotationsMateriau, genererPlanningCamionMateriau } from "./calculs/calculsMateriaux.js";

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
    case "materiau": // ← NOUVEAU
      return calculerRotationsMateriau(chantier);
    default:
      return calculerRotationsEnrobes(chantier);
  }
}

// ─── ROUTER DE PLANNING ──────────────────────────────────────────────────────
// Selon le type de chantier, génère le bon planning camion
// compteur = objet partagé { effectuees, totales, tonnageCumule } pour arrêter dès tonnage atteint
function genererPlanningCamion(camion, chantier, calc, decalage = 0, compteur = null) {
  switch (chantier.typeChantier) {
    case "enrobes":
      return genererPlanningCamionEnrobes(camion, chantier, calc, decalage, compteur);
    case "fraisat":
      return genererPlanningCamionRabotage(camion, chantier, calc, decalage, compteur);
    case "terrassement":
      return genererPlanningCamionTerrassement(camion, chantier, calc, decalage, compteur);
    case "beton":
      return genererPlanningCamionBeton(camion, chantier, calc, decalage, compteur);
    case "materiau": // ← NOUVEAU
      return genererPlanningCamionMateriau(camion, chantier, calc, decalage, compteur);
    default:
      return genererPlanningCamionEnrobes(camion, chantier, calc, decalage, compteur);
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
  const camionsOccupes = {}; // camionId → libreAMin

  let locatiersNecessaires = 0;
  let compteurCamionGlobal = 0; // ← numérotation continue de TOUS les camions (Colas + locatiers)

  for (const chantier of sorted) {
    const calc = calculerBesoin(chantier);
    if (!calc) continue;

    // ← MODIFIÉ : nb camions Colas autorisés défini par le slider
    const nbColasAutorise = chantier.nbCamionsColas ?? 0;

    // ← NOUVEAU : compteur partagé entre tous les camions de CE chantier
    // s'arrête dès que rotationsTotales est atteint (le dernier camion ne fait pas sa rotation inutile)
    const compteur = { effectuees: 0, totales: calc.rotationsTotales, tonnageCumule: 0 };

    let camionsAAffecter = calc.nbCamions;
    let decalage = 0;
    let nbColasRestants = Math.min(nbColasAutorise, camionsAAffecter);

    // Affecter les camions Colas UNIQUEMENT si nbColasAutorise > 0
    // Les Colas gardent leur immatriculation réelle mais incrémentent le compteur global
    if (nbColasRestants > 0) {
      for (const camion of camionsDispos) {
        if (nbColasRestants <= 0) break;
        if (camion.type_id !== chantier.typeCamion) continue;

        // Vérifier si le camion est libre à temps (marge de 30 min)
        const heureRef = calc.heureDepartCentrale ?? calc.heureDebutChantier ?? 0;
        const libreA = camionsOccupes[camion.id] ?? 0;
        if (libreA > heureRef + 30) continue;

        compteurCamionGlobal++; // ← un Colas occupe un rang dans la numérotation globale
        const planning = genererPlanningCamion(camion, chantier, calc, decalage, compteur);
        planningsFinal.push(planning);
        camionsOccupes[camion.id] = planning.libreAMin;
        nbColasRestants--;
        camionsAAffecter--;
        decalage++;
      }
    }

    // Compléter avec des locatiers si pas assez de camions Colas
    // Les locatiers sont numérotés en continuant APRÈS les Colas déjà placés
    if (camionsAAffecter > 0) {
      locatiersNecessaires += camionsAAffecter;
      for (let i = 0; i < camionsAAffecter; i++) {
        compteurCamionGlobal++; // ← numéro unique continu (après les Colas)
        const planning = genererPlanningCamion(
          {
            id: `loc-${compteurCamionGlobal}`,
            immatriculation: `Locatier ${compteurCamionGlobal}`,
            type_vehicule: chantier.typeCamion,
            proprietaire: "Locatier",
          },
          chantier,
          calc,
          decalage,
          compteur
        );
        planningsFinal.push(planning);
        decalage++;
      }
    }
  }

  // ── CUMUL CHANTIER CHRONOLOGIQUE ──────────────────────────────────────────
  // On ordonne toutes les rotations d'un même chantier par heure de chargement
  // (tous camions confondus) et on cumule dans cet ordre : 1ère rotation du 1er
  // camion = 29 t, 1ère du 2e camion = 58 t, … puis les 2e rotations, etc.
  const tonnageParChantier = {};
  for (const c of sorted) tonnageParChantier[c.nomChantier] = parseFloat(c.tonnage) || Infinity;
  const rotationsParChantier = {};
  for (const pl of planningsFinal) {
    for (const r of (pl.rotations || [])) {
      if (r.departCentraleMin == null) continue; // type sans heure brute → on laisse tel quel
      if (!rotationsParChantier[pl.chantier]) rotationsParChantier[pl.chantier] = [];
      rotationsParChantier[pl.chantier].push(r);
    }
  }
  for (const nom of Object.keys(rotationsParChantier)) {
    const rots = rotationsParChantier[nom].sort((a, b) => a.departCentraleMin - b.departCentraleMin);
    const cible = tonnageParChantier[nom] ?? Infinity;
    let cumul = 0;
    for (const r of rots) {
      cumul += r.tonnage_rotation;
      r.tonnage_cumule_global = Math.min(cumul, cible);
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
      // Le camion qui se libère le plus tôt = celui qui fait le MOINS de rotations.
      // (rotationsTotales n'est pas toujours un multiple de nbCamions → le dernier en fait moins)
      heureFinDernierCamion: calc
        ? calc.heureDepartCentrale + Math.max(0, calc.rotationsTotales - calc.rotationsParCamion * (calc.nbCamions - 1)) * calc.tempsCycle
        : null,
      tempsLibreApresRotations: calc
        ? calc.heureFinMin - (calc.heureDepartCentrale + Math.max(0, calc.rotationsTotales - calc.rotationsParCamion * (calc.nbCamions - 1)) * calc.tempsCycle)
        : 0,
      nbCamionsFinal: calc?.nbCamions ?? 0,
      renforts: [],
      renforceChantiersIds: [],
    };
  });

  // ── ÉTAPE 2 : Identifier les renforts possibles ───────────────────────────
  const renforts = [];

  for (const itemA of chantiersCalc) {
    if (!itemA.calc) continue;
    if (itemA.tempsLibreApresRotations <= 0) continue;

    for (const itemB of chantiersCalc) {
      if (itemA === itemB) continue;
      if (!itemB.calc) continue;
      if (itemA.chantier.typeCamion !== itemB.chantier.typeCamion) continue;
      if (itemA.chantier.chantierNuit !== itemB.chantier.chantierNuit) continue;

      const distKm = haversine(
        parseFloat(itemA.chantier.lat), parseFloat(itemA.chantier.lng),
        parseFloat(itemB.chantier.lat), parseFloat(itemB.chantier.lng)
      );

      if (distKm > SEUIL_RENFORT_KM) continue;

      const type = getTypeCamion(itemA.chantier.typeCamion);
      const coeffCamion = type?.coeff_vitesse ?? 1.0;
      const vitesseMoyenne = 40;
      const tempsTrajetAB = Math.round((distKm / vitesseMoyenne) * 60 * coeffCamion);

      let tempsRepositionnement = tempsTrajetAB;
      if (itemB.chantier.typeChantier === "enrobes" || !itemB.chantier.typeChantier) {
        const centraleB = centrales.find(c => c.id === itemB.calc.centraleId);
        if (centraleB) {
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

      // Le camion arrive CHARGÉ sur B : le chargement + le trajet aller sont déjà comptés
      // dans le repositionnement. La 1ère rotation ne coûte donc QUE le déchargement ;
      // les rotations suivantes (il repart à vide) coûtent un cycle complet.
      const tChargB = (type?.temps_chargement_enrobe ?? 6) + (type?.temps_bachage_enrobe ?? 6);
      const tDechargB = Math.max(0, itemB.calc.tempsCycle - tChargB - 2 * itemB.calc.tempsTrajet);
      const tempsApresArrivee = itemA.tempsLibreApresRotations - tempsRepositionnement;
      if (tempsApresArrivee < tDechargB) continue; // pas même le temps de livrer le 1er chargement

      const rotationsRenfort = 1 + Math.floor((tempsApresArrivee - tDechargB) / itemB.calc.tempsCycle);
      const tonnageRenfort = rotationsRenfort * itemB.calc.capacite;

      // Un renfort RETIRE un camion entier sur B s'il couvre au moins le camion "marginal"
      // de B (le moins chargé). Sinon il est PARTIEL : il faudra combler le reste (4x2/8x4).
      const rotMarginalB = Math.max(1, itemB.calc.rotationsTotales - itemB.calc.rotationsParCamion * (itemB.calc.nbCamions - 1));
      const retireCamionEntier = rotationsRenfort >= rotMarginalB;

      renforts.push({
        chantierA:         itemA.chantier.nomChantier,
        chantierB:         itemB.chantier.nomChantier,
        chantierAId:       itemA.chantier.id,
        chantierBId:       itemB.chantier.id,
        distanceKm:        Math.round(distKm * 10) / 10,
        tempsTrajetAB,
        tempsRepositionnement,
        rotationsRenfort,
        tonnageRenfort:    Math.round(tonnageRenfort),
        rotMarginalB,
        retireCamionEntier,
        heureFinRotationsA: minutesEnHeure(itemA.heureFinDernierCamion),
        heureDispoB:        minutesEnHeure(itemA.heureFinDernierCamion + tempsRepositionnement),
        camionsEconomises: retireCamionEntier ? 1 : 0,
      });

      if (retireCamionEntier) itemB.nbCamionsFinal = Math.max(1, itemB.nbCamionsFinal - 1);
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
  const parCamion = {};

  for (const p of plannings) {
    if (!parCamion[p.camionId]) {
      parCamion[p.camionId] = {
        camionId:        p.camionId,
        immatriculation: p.immatriculation,
        type:            p.type,
        proprietaire:    p.proprietaire,
        missions:        [],
        libreA:          p.libreA,
      };
    }

    for (const r of p.rotations) {
      parCamion[p.camionId].missions.push({
        ...r,
        chantier:   p.chantier,
        centraleId: p.centraleId,
      });
    }

    parCamion[p.camionId].libreA = p.libreA;
  }

  return Object.values(parCamion).map(c => ({
    ...c,
    missions: c.missions.sort((a, b) => {
      const toMin = h => {
        if (!h) return 0;
        const [hh, mm] = h.replace("h", ":").split(":").map(Number);
        return hh * 60 + mm;
      };
      const heureA = a.depart_centrale ?? a.debut_chargement ?? "00h00";
      const heureB = b.depart_centrale ?? b.debut_chargement ?? "00h00";
      const mA = toMin(heureA);
      const mB = toMin(heureB);
      if (Math.abs(mA - mB) > 720) return mA > mB ? -1 : 1;
      return mA - mB;
    }),
  }));
}