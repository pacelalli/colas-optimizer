// ─── CALCULS BÉTON ────────────────────────────────────────────────────────────
// Calculs spécifiques aux chantiers d'apport de béton sec
// Saisie en m³ → conversion m³ × 2.5 = tonnes
// Cycle : centrale → chargement → chantier → déchargement → centrale
import { heureEnMinutes, minutesEnHeure, getTypeCamion, getTempsTrajet } from "./calculsCommuns";

export function calculerRotationsBeton(chantier) {
  const type = getTypeCamion(chantier.typeCamion);
  if (!type) return null;

  const DENSITE_BETON = 2.5; // t/m³
  const volumeM3 = parseFloat(chantier.volumeM3 ?? chantier.tonnage);
  const tonnage = volumeM3 * DENSITE_BETON;
  const capacite = type.tonnage_utile;
  const capaciteM3 = Math.floor(capacite / DENSITE_BETON * 10) / 10;

  const nuit = chantier.chantierNuit ?? false;
  const centraleId = chantier.centrale;
  if (!centraleId) return null;

  const tempsTrajet = getTempsTrajet(centraleId, chantier.zoneId, nuit, type, chantier.typeTrajet ?? "urbain");
  if (tempsTrajet === null) return null;

  const heureArriveeChantier = heureEnMinutes(chantier.heureDebut) ?? 7 * 60;
  const heureDepartCentrale = heureArriveeChantier - tempsTrajet - type.temps_chargement_apport;
  let heureFinMin = heureEnMinutes(chantier.heureFin) ?? 17 * 60;
  if (heureFinMin < heureArriveeChantier) heureFinMin += 24 * 60;

  let tempsDisponible = heureFinMin - heureDepartCentrale;
  const pauseTotale = nuit ? 45 : 60;
  tempsDisponible -= pauseTotale;

  const tempsCycle =
    type.temps_chargement_apport +
    tempsTrajet +
    type.temps_sur_chantier_apport +
    tempsTrajet;

  const rotationsTotales = Math.ceil(tonnage / capacite);
  const rotationsExactes = tempsDisponible / tempsCycle;
  const entierInf = Math.floor(rotationsExactes);
  const rotationsRefSeuil = rotationsExactes >= entierInf + 0.5 ? entierInf + 1 : entierInf;

  const SEUIL_TEMPS_PROCHE = 15;
  const MAX_ROTATIONS_BETON = 4;

  const rotationsParCamion = (
    chantier.rotationsIllimitees === true || tempsTrajet < SEUIL_TEMPS_PROCHE
  ) ? rotationsRefSeuil : Math.min(rotationsRefSeuil, MAX_ROTATIONS_BETON);

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
    typeChantier:         "beton",
    centraleId,
    volumeM3,
    tonnage,
    capacite,
    capaciteM3,
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
    heureDepartCentrale,
    heureArriveeChantier,
    heureFinMin,
    nuit,
    tonnageRealisable:        Math.round(tonnageRealisable),
    chantierRealisableEnJour,
    nbJoursNecessaires,
  };
}

export function genererPlanningCamionBeton(camion, chantier, calc, decalage = 0) {
  const rotations = [];
  const type = getTypeCamion(chantier.typeCamion);

  let cursor = calc.heureDepartCentrale + decalage * calc.tempsCycle;

  for (let i = 0; i < calc.rotationsParCamion; i++) {

    // Pause repas 12h-13h pour chantiers de jour
    if (!calc.nuit) {
      const debut12h = 12 * 60;
      const fin13h = 13 * 60;
      if (cursor >= debut12h && cursor < fin13h) {
        cursor = fin13h;
      }
    }

    const departCentrale  = cursor;
    const finChargement   = departCentrale + type.temps_chargement_apport;
    const arriveeChantier = finChargement + calc.tempsTrajet;
    const finDecharge     = arriveeChantier + type.temps_sur_chantier_apport;
    const retourCentrale  = finDecharge + calc.tempsTrajet;

    rotations.push({
      rotation:         i + 1,
      depart_centrale:  minutesEnHeure(departCentrale),
      fin_chargement:   minutesEnHeure(finChargement),
      arrivee_chantier: minutesEnHeure(arriveeChantier),
      fin_dechargement: minutesEnHeure(finDecharge),
      retour_centrale:  minutesEnHeure(retourCentrale),
    });

    cursor = retourCentrale;
    if (cursor >= calc.heureFinMin) break;
  }

  return {
    camionId:        camion.id,
    immatriculation: camion.immatriculation ?? "Locatier",
    type:            camion.type_vehicule ?? chantier.typeCamion,
    proprietaire:    camion.proprietaire,
    chantier:        chantier.nomChantier,
    typeChantier:    "beton",
    centraleId:      calc.centraleId,
    rotations,
    libreA:    minutesEnHeure(cursor),
    libreAMin: cursor,
  };
}
