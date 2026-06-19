// ─── CALCULS TERRASSEMENT / DÉBLAIS ──────────────────────────────────────────
// Calculs spécifiques aux chantiers de terrassement et évacuation de déblais
// Cycle : chantier → chargement déblais → centrale décharge → retour chantier
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

  const tempsCycle =
    type.temps_sur_chantier_deblais +
    tempsTrajet +
    type.temps_dechargement_deblais +
    tempsTrajet;

  const rotationsTotales = Math.ceil(tonnage / capacite);
  const rotationsExactes = tempsDisponible / tempsCycle;
  const entierInf = Math.floor(rotationsExactes);
  const rotationsRefSeuil = rotationsExactes >= entierInf + 0.5 ? entierInf + 1 : entierInf;

  const SEUIL_TEMPS_PROCHE = 15;
  const MAX_ROTATIONS_TERRASSEMENT = 4;

  const rotationsParCamion = (
    chantier.rotationsIllimitees === true || tempsTrajet < SEUIL_TEMPS_PROCHE
  ) ? rotationsRefSeuil : Math.min(rotationsRefSeuil, MAX_ROTATIONS_TERRASSEMENT);

  const proche = chantier.rotationsIllimitees === true || tempsTrajet < SEUIL_TEMPS_PROCHE;
  const nbCamionsTonnage = proche
    ? Math.ceil(rotationsTotales / rotationsExactes)
    : Math.ceil(rotationsTotales / rotationsParCamion);

  // Nb camions imposé par le CdT ?
  const nbCamionsFinal = (chantier.nbCamionsImposeActif && chantier.nbCamionsImpose)
    ? parseInt(chantier.nbCamionsImpose)
    : nbCamionsTonnage;
  const nbCamions = nbCamionsFinal;

  // Si nb camions imposé → recalculer rotationsParCamion
  const rotationsParCamionFinal = (chantier.nbCamionsImposeActif && chantier.nbCamionsImpose)
    ? Math.ceil(rotationsTotales / nbCamions)
    : rotationsParCamion;

  const tonnageRealisable = nbCamions * rotationsParCamionFinal * capacite;
  const chantierRealisableEnJour = tonnageRealisable >= tonnage;
  const nbJoursNecessaires = chantierRealisableEnJour ? 1 : Math.ceil(tonnage / tonnageRealisable);

  const excedentRotations = (nbCamions * rotationsParCamionFinal) - rotationsTotales;
  const nbCamionsRotationsMin = Math.max(0, excedentRotations);
  const nbCamionsRotationsMax = nbCamions - nbCamionsRotationsMin;

  return {
    chantierNom:          chantier.nomChantier,
    typeChantier:         "terrassement",
    typeDeblai:           chantier.typeDeblai,
    centraleId,
    tonnage,
    capacite,
    typeCamion:           type.label,
    tempsTrajet,
    tempsCycle,
    tempsDisponible,
    pauseTotale,
    rotationsExactes:     Math.round(rotationsExactes * 100) / 100,
    rotationsParCamion:   rotationsParCamionFinal,
    rotationsTotales,
    nbCamions,
    nbCamionsTonnage,
    nbCamionsRotationsMax,
    nbCamionsRotationsMin,
    heureDebutChantier,
    heureFinMin,
    nuit,
    tonnageRealisable:        Math.round(tonnageRealisable),
    chantierRealisableEnJour,
    nbJoursNecessaires,
  };
}

export function genererPlanningCamionTerrassement(camion, chantier, calc, decalage = 0) {
  const rotations = [];
  const type = getTypeCamion(chantier.typeCamion);

  let cursor = calc.heureDebutChantier + decalage * type.temps_sur_chantier_deblais;

  for (let i = 0; i < calc.rotationsParCamion; i++) {

    // Pause repas 12h-13h pour chantiers de jour
    if (!calc.nuit) {
      const debut12h = 12 * 60;
      const fin13h = 13 * 60;
      if (cursor >= debut12h && cursor < fin13h) {
        cursor = fin13h;
      }
    }

    const debutChargement = cursor;
    const finChargement   = debutChargement + type.temps_sur_chantier_deblais;
    const arriveCentrale  = finChargement + calc.tempsTrajet;
    const finDecharge     = arriveCentrale + type.temps_dechargement_deblais;
    const retourChantier  = finDecharge + calc.tempsTrajet;

    rotations.push({
      rotation:         i + 1,
      debut_chargement: minutesEnHeure(debutChargement),
      fin_chargement:   minutesEnHeure(finChargement),
      arrivee_centrale: minutesEnHeure(arriveCentrale),
      fin_dechargement: minutesEnHeure(finDecharge),
      retour_chantier:  minutesEnHeure(retourChantier),
    });

    cursor = retourChantier;
    if (cursor >= calc.heureFinMin) break;
  }

  return {
    camionId:        camion.id,
    immatriculation: camion.immatriculation ?? "Locatier",
    type:            camion.type_vehicule ?? chantier.typeCamion,
    proprietaire:    camion.proprietaire,
    chantier:        chantier.nomChantier,
    typeChantier:    "terrassement",
    centraleId:      calc.centraleId,
    rotations,
    libreA:    minutesEnHeure(cursor),
    libreAMin: cursor,
  };
}
