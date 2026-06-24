// ─── CALCULS APPORT MATÉRIAUX ──────────────────────────────────────────────────
// Apport de GNT, grave, sable, ballast... — même logique que enrobés
// Cycle : centrale → chargement → chantier → déchargement → centrale
// Libre après : déchargement sur chantier (dernière rotation)
import { haversine, heureEnMinutes, minutesEnHeure, getTypeCamion, getTempsTrajet } from "./calculsCommuns";
import centrales from "../../data/centrales.json";

export function calculerRotationsMateriau(chantier) {
  const type = getTypeCamion(chantier.typeCamion);
  if (!type) return null;
  const tonnage = parseFloat(chantier.tonnage);
  const capacite = type.tonnage_utile;
  const nuit = chantier.chantierNuit ?? false;
  const centraleId = chantier.centrale;
  if (!centraleId) return null;
  const tempsTrajet = getTempsTrajet(centraleId, chantier.zoneId, nuit, type, chantier.typeTrajet ?? "urbain");
  if (tempsTrajet === null) return null;

  // Même logique que enrobés : départ centrale avant heureDebut chantier
  const heureArriveeChantier = heureEnMinutes(chantier.heureDebut) ?? 7 * 60;
  const heureDepartCentrale = heureArriveeChantier - tempsTrajet - type.temps_chargement_apport;
  let heureFinMin = heureEnMinutes(chantier.heureFin) ?? 17 * 60;
  if (heureFinMin < heureArriveeChantier) heureFinMin += 24 * 60;

  let tempsDisponible = heureFinMin - heureDepartCentrale;
  const pauseTotale = nuit ? 45 : 60;
  tempsDisponible -= pauseTotale;

  const tempsCycle = type.temps_chargement_apport + tempsTrajet + type.temps_sur_chantier_apport + tempsTrajet;
  const rotationsTotales = Math.ceil(tonnage / capacite);
  const rotationsExactes = tempsDisponible / tempsCycle;
  const entierInf = Math.floor(rotationsExactes);
  const rotationsRefSeuil = rotationsExactes >= entierInf + 0.5 ? entierInf + 1 : entierInf;

  const SEUIL_TEMPS_PROCHE = 15;
  const MAX_ROTATIONS_MATERIAU = 4;
  const rotationsParCamion = (chantier.rotationsIllimitees === true || tempsTrajet < SEUIL_TEMPS_PROCHE)
    ? rotationsRefSeuil : Math.min(rotationsRefSeuil, MAX_ROTATIONS_MATERIAU);

  const proche = chantier.rotationsIllimitees === true || tempsTrajet < SEUIL_TEMPS_PROCHE;
  const nbCamionsTonnage = proche
    ? Math.ceil(rotationsTotales / rotationsExactes)
    : Math.ceil(rotationsTotales / rotationsParCamion);

  const nbCamionsFinal = (chantier.nbCamionsImposeActif && chantier.nbCamionsImpose)
    ? parseInt(chantier.nbCamionsImpose) : nbCamionsTonnage;
  const nbCamions = nbCamionsFinal;

  const rotationsParCamionFinal = (chantier.nbCamionsImposeActif && chantier.nbCamionsImpose)
    ? Math.ceil(rotationsTotales / nbCamions) : rotationsParCamion;

  const tonnageRealisable = nbCamions * rotationsParCamionFinal * capacite;
  const chantierRealisableEnJour = tonnageRealisable >= tonnage;
  const nbJoursNecessaires = chantierRealisableEnJour ? 1 : Math.ceil(tonnage / tonnageRealisable);

  const entierInfFinal = Math.floor(rotationsParCamionFinal);
  const nbCamionsRotationsMax = rotationsTotales - (nbCamions * entierInfFinal);
  const nbCamionsRotationsMin = nbCamions - nbCamionsRotationsMax;

  return {
    chantierNom: chantier.nomChantier, typeChantier: "materiau",
    typeMateriau: chantier.typeMateriau, centraleId, tonnage, capacite,
    typeCamion: type.label, tempsTrajet, tempsCycle, tempsDisponible, pauseTotale,
    rotationsExactes: Math.round(rotationsExactes * 100) / 100,
    rotationsParCamion: rotationsParCamionFinal, rotationsTotales,
    nbCamions, nbCamionsTonnage,
    nbCamionsRotationsMax: Math.max(0, nbCamionsRotationsMax),
    nbCamionsRotationsMin: Math.max(0, nbCamionsRotationsMin),
    heureDepartCentrale, heureArriveeChantier, heureFinMin, nuit,
    tonnageRealisable: Math.round(tonnageRealisable), chantierRealisableEnJour, nbJoursNecessaires,
  };
}

export function genererPlanningCamionMateriau(camion, chantier, calc, decalage = 0, compteur = null) {
  const rotations = [];
  const type = getTypeCamion(chantier.typeCamion);

  // Même logique enrobés : décalage = temps_chargement + 3 min
  const TRANSITION = 3;
  const ecartDepart = type.temps_chargement_apport + TRANSITION;
  let cursor = calc.heureDepartCentrale + decalage * ecartDepart;

  const entierInf = Math.floor(calc.rotationsExactes);
  const rotationsCeCamion = decalage < calc.nbCamionsRotationsMax ? entierInf + 1 : entierInf;

  let dernierFinDechargement = cursor;

  for (let i = 0; i < rotationsCeCamion; i++) {
    if (compteur && compteur.effectuees >= compteur.totales) break;
    if (!calc.nuit && cursor >= 12 * 60 && cursor < 13 * 60) cursor = 13 * 60;

    const departCentrale  = cursor;
    const finChargement   = departCentrale + type.temps_chargement_apport;
    const arriveeChantier = finChargement + calc.tempsTrajet;
    const finDechargement = arriveeChantier + type.temps_sur_chantier_apport;
    const retourCentrale  = finDechargement + calc.tempsTrajet;

    dernierFinDechargement = finDechargement;

    let tonnageCumuleGlobal = null;
    if (compteur) {
      compteur.effectuees++;
      compteur.tonnageCumule += calc.capacite;
      tonnageCumuleGlobal = Math.min(compteur.tonnageCumule, calc.tonnage);
    }

    rotations.push({
      rotation: i + 1,
      tonnage_rotation: calc.capacite,
      tonnage_cumule: (i + 1) * calc.capacite,
      tonnage_cumule_global: tonnageCumuleGlobal,
      depart_centrale:  minutesEnHeure(departCentrale),
      fin_chargement:   minutesEnHeure(finChargement),
      arrivee_chantier: minutesEnHeure(arriveeChantier),
      fin_dechargement: minutesEnHeure(finDechargement),
      retour_centrale:  minutesEnHeure(retourCentrale),
    });

    cursor = retourCentrale;
    if (cursor >= calc.heureFinMin) break;
  }

  // Matériau : libre après déchargement sur chantier (comme enrobés)
  return {
    camionId: camion.id, immatriculation: camion.immatriculation ?? "Locatier",
    type: camion.type_vehicule ?? chantier.typeCamion, proprietaire: camion.proprietaire,
    chantier: chantier.nomChantier, typeChantier: "materiau", centraleId: calc.centraleId,
    rotations,
    nbRotationsReelles: rotations.length,
    tonnageLivre: rotations.length * calc.capacite,
    libreA:    minutesEnHeure(dernierFinDechargement),
    libreAMin: dernierFinDechargement,
  };
}
