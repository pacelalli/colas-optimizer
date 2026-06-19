// ─── CALCULS TERRASSEMENT / DÉBLAIS ──────────────────────────────────────────
// Cycle : chantier → chargement déblais → centrale décharge → retour chantier
// Libre après : déchargement à la centrale (dernière rotation) car doit vider
import { heureEnMinutes, minutesEnHeure, getTypeCamion, getTempsTrajet } from "./calculsCommuns";
import centrales from "../../data/centrales.json";

export function calculerRotationsTerrassement(chantier) {
  const type = getTypeCamion(chantier.typeCamion);
  if (!type) return null;
  const tonnage = parseFloat(chantier.tonnage);
  const capacite = type.tonnage_utile;
  const nuit = chantier.chantierNuit ?? false;
  const centraleId = chantier.centrale;
  if (!centraleId) return null;
  const tempsTrajet = getTempsTrajet(centraleId, chantier.zoneId, nuit, type, chantier.typeTrajet ?? "urbain");
  if (tempsTrajet === null) return null;

  const heureDebutChantier = heureEnMinutes(chantier.heureDebut) ?? 7 * 60;
  let heureFinMin = heureEnMinutes(chantier.heureFin) ?? 17 * 60;
  if (heureFinMin < heureDebutChantier) heureFinMin += 24 * 60;

  let tempsDisponible = heureFinMin - heureDebutChantier;
  const pauseTotale = nuit ? 45 : 60;
  tempsDisponible -= pauseTotale;

  const tempsCycle = type.temps_sur_chantier_deblais + tempsTrajet + type.temps_dechargement_deblais + tempsTrajet;
  const rotationsTotales = Math.ceil(tonnage / capacite);
  const rotationsExactes = tempsDisponible / tempsCycle;
  const entierInf = Math.floor(rotationsExactes);
  const rotationsRefSeuil = rotationsExactes >= entierInf + 0.5 ? entierInf + 1 : entierInf;

  const SEUIL_TEMPS_PROCHE = 15;
  const MAX_ROTATIONS_TERRASSEMENT = 4;
  const rotationsParCamion = (chantier.rotationsIllimitees === true || tempsTrajet < SEUIL_TEMPS_PROCHE)
    ? rotationsRefSeuil : Math.min(rotationsRefSeuil, MAX_ROTATIONS_TERRASSEMENT);

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
    chantierNom: chantier.nomChantier, typeChantier: "terrassement",
    typeDeblai: chantier.typeDeblai, centraleId, tonnage, capacite,
    typeCamion: type.label, tempsTrajet, tempsCycle, tempsDisponible, pauseTotale,
    rotationsExactes: Math.round(rotationsExactes * 100) / 100,
    rotationsParCamion: rotationsParCamionFinal, rotationsTotales,
    nbCamions, nbCamionsTonnage,
    nbCamionsRotationsMax: Math.max(0, nbCamionsRotationsMax),
    nbCamionsRotationsMin: Math.max(0, nbCamionsRotationsMin),
    heureDebutChantier, heureFinMin, nuit,
    tonnageRealisable: Math.round(tonnageRealisable), chantierRealisableEnJour, nbJoursNecessaires,
  };
}

export function genererPlanningCamionTerrassement(camion, chantier, calc, decalage = 0, compteur = null) {
  const rotations = [];
  const type = getTypeCamion(chantier.typeCamion);

  // Décalage : temps_chargement_deblais + 3 min (ils se suivent derrière la pelleteuse)
  const TRANSITION = 3;
  const ecartDepart = type.temps_sur_chantier_deblais + TRANSITION;
  let cursor = calc.heureDebutChantier + decalage * ecartDepart;

  const entierInf = Math.floor(calc.rotationsExactes);
  const rotationsCeCamion = decalage < calc.nbCamionsRotationsMax ? entierInf + 1 : entierInf;

  let dernierFinDechargement = cursor;

  for (let i = 0; i < rotationsCeCamion; i++) {
    if (compteur && compteur.effectuees >= compteur.totales) break;
    if (!calc.nuit && cursor >= 12 * 60 && cursor < 13 * 60) cursor = 13 * 60;

    const debutChargement = cursor;
    const finChargement   = debutChargement + type.temps_sur_chantier_deblais;
    const arriveCentrale  = finChargement + calc.tempsTrajet;
    const finDecharge     = arriveCentrale + type.temps_dechargement_deblais;
    const retourChantier  = finDecharge + calc.tempsTrajet;

    dernierFinDechargement = finDecharge;

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
      debut_chargement: minutesEnHeure(debutChargement),
      fin_chargement:   minutesEnHeure(finChargement),
      arrivee_centrale: minutesEnHeure(arriveCentrale),
      fin_dechargement: minutesEnHeure(finDecharge),
      retour_chantier:  minutesEnHeure(retourChantier),
    });

    cursor = retourChantier;
    if (cursor >= calc.heureFinMin) break;
  }

  // Terrassement : libre après déchargement à la centrale (doit vider sa benne)
  return {
    camionId: camion.id, immatriculation: camion.immatriculation ?? "Locatier",
    type: camion.type_vehicule ?? chantier.typeCamion, proprietaire: camion.proprietaire,
    chantier: chantier.nomChantier, typeChantier: "terrassement", centraleId: calc.centraleId,
    rotations,
    nbRotationsReelles: rotations.length,
    tonnageLivre: rotations.length * calc.capacite,
    libreA:    minutesEnHeure(dernierFinDechargement),
    libreAMin: dernierFinDechargement,
  };
}
