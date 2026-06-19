// ─── CALCULS RABOTAGE ────────────────────────────────────────────────────────
// Cycle : chantier → chargement fraisat → centrale → déchargement → chantier
// Libre après : déchargement à la centrale (dernière rotation) car doit vider
import { heureEnMinutes, minutesEnHeure, getTypeCamion, getTempsTrajet } from "./calculsCommuns";
import centrales from "../../data/centrales.json";
import formules from "../../data/formules_enrobes.json";

export function comparerCentralesFraisat(chantier, nbCamionsColas = 0) {
  const type = getTypeCamion(chantier.typeCamion);
  if (!type) return [];
  const formuleFraisat = formules.find(f => f.id === "fraisat");
  if (!formuleFraisat) return [];
  const nuit = chantier.chantierNuit ?? false;
  const options = [];
  for (const centrale of centrales) {
    if (chantier.centraleImposee && centrale.id !== chantier.centrale) continue;
    if (!centrale.deblais_acceptes?.includes("fraisat")) continue;
    const tarif = formuleFraisat.centrales.find(c => c.centrale_id === centrale.id);
    if (!tarif?.disponible) continue;
    const chantierAvecCentrale = { ...chantier, centrale: centrale.id, centraleImposee: true };
    const calc = calculerRotationsRabotage(chantierAvecCentrale);
    if (!calc) continue;
    const nbCamionsTotal = calc.nbCamions;
    const nbColas = Math.min(nbCamionsColas, nbCamionsTotal);
    const nbLocatiers = nbCamionsTotal - nbColas;
    const prixUnitaireColas = nuit ? type.prix_colas_nuit : type.prix_colas_jour;
    const prixUnitaireLocatier = nuit ? type.prix_locatier_nuit : type.prix_locatier_jour;
    const coutCamions = (nbColas * prixUnitaireColas) + (nbLocatiers * prixUnitaireLocatier);
    const prixRachat = tarif.prix_tonne ?? 0;
    const revenuFraisat = calc.tonnage * Math.abs(prixRachat);
    const coutTotal = coutCamions - revenuFraisat;
    const coutTonneNet = Math.round(coutTotal / calc.tonnage);
    options.push({
      centraleId: centrale.id, centraleNom: centrale.nom, nbCamions: nbCamionsTotal,
      nbColas, nbLocatiers,
      distanceKm: Math.round(Math.sqrt(Math.pow((chantier.lat - centrale.lat) * 111, 2) + Math.pow((chantier.lng - centrale.lng) * 78, 2))),
      coutTotal: Math.round(coutTotal), coutTonneNet, revenuFraisat: Math.round(revenuFraisat),
      prixRachatTonne: prixRachat,
      detail: { coutCamions: Math.round(coutCamions), revenuFraisat: Math.round(revenuFraisat), prixRachatTonne: prixRachat },
    });
  }
  return options.sort((a, b) => a.coutTotal - b.coutTotal);
}

export function calculerRotationsRabotage(chantier) {
  const type = getTypeCamion(chantier.typeCamion);
  if (!type) return null;
  const tonnage = parseFloat(chantier.tonnage);
  const capacite = type.tonnage_utile;
  const nuit = chantier.chantierNuit ?? false;
  const centraleId = chantier.centrale;
  if (!centraleId) return null;
  const tempsTrajet = getTempsTrajet(centraleId, chantier.zoneId, nuit, type, chantier.typeTrajet ?? "urbain");
  if (tempsTrajet === null) return null;

  const heureDebutChantier = heureEnMinutes(chantier.heureDebut) ?? 21 * 60;
  let heureFinMin = heureEnMinutes(chantier.heureFin) ?? 5 * 60;
  if (heureFinMin < heureDebutChantier) heureFinMin += 24 * 60;

  let tempsDisponible = heureFinMin - heureDebutChantier;
  const pauseTotale = nuit ? 45 : 60;
  tempsDisponible -= pauseTotale;

  const tempsCycle = type.temps_sur_chantier_rabotage + tempsTrajet + type.temps_dechargement_rabotage + tempsTrajet;
  const rotationsTotales = Math.ceil(tonnage / capacite);
  const rotationsExactes = tempsDisponible / tempsCycle;
  const entierInf = Math.floor(rotationsExactes);
  const rotationsRefSeuil = rotationsExactes >= entierInf + 0.5 ? entierInf + 1 : entierInf;

  const SEUIL_TEMPS_PROCHE = 15;
  const MAX_ROTATIONS_RABOTAGE = 3;
  const rotationsParCamion = (chantier.rotationsIllimitees === true || tempsTrajet < SEUIL_TEMPS_PROCHE)
    ? rotationsRefSeuil : Math.min(rotationsRefSeuil, MAX_ROTATIONS_RABOTAGE);

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
    chantierNom: chantier.nomChantier, typeChantier: "fraisat", centraleId,
    tonnage, capacite, typeCamion: type.label, tempsTrajet, tempsCycle,
    tempsDisponible, pauseTotale,
    rotationsExactes: Math.round(rotationsExactes * 100) / 100,
    rotationsParCamion: rotationsParCamionFinal, rotationsTotales,
    nbCamions, nbCamionsTonnage,
    nbCamionsRotationsMax: Math.max(0, nbCamionsRotationsMax),
    nbCamionsRotationsMin: Math.max(0, nbCamionsRotationsMin),
    heureDebutChantier, heureFinMin, nuit,
    tonnageRealisable: Math.round(tonnageRealisable), chantierRealisableEnJour, nbJoursNecessaires,
  };
}

export function genererPlanningCamionRabotage(camion, chantier, calc, decalage = 0, compteur = null) {
  const rotations = [];
  const type = getTypeCamion(chantier.typeCamion);

  // Décalage : temps_chargement_rabotage + 3 min (ils se suivent derrière la raboteuse)
  const TRANSITION = 3;
  const ecartDepart = type.temps_sur_chantier_rabotage + TRANSITION;
  let cursor = calc.heureDebutChantier + decalage * ecartDepart;

  const entierInf = Math.floor(calc.rotationsExactes);
  const rotationsCeCamion = decalage < calc.nbCamionsRotationsMax ? entierInf + 1 : entierInf;

  let dernierFinDechargement = cursor;

  for (let i = 0; i < rotationsCeCamion; i++) {
    if (compteur && compteur.effectuees >= compteur.totales) break;
    if (!calc.nuit && cursor >= 12 * 60 && cursor < 13 * 60) cursor = 13 * 60;

    const debutChargement = cursor;
    const finChargement   = debutChargement + type.temps_sur_chantier_rabotage;
    const arriveCentrale  = finChargement + calc.tempsTrajet;
    const finDechargement = arriveCentrale + type.temps_dechargement_rabotage;
    const retourChantier  = finDechargement + calc.tempsTrajet;

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
      debut_chargement:  minutesEnHeure(debutChargement),
      fin_chargement:    minutesEnHeure(finChargement),
      arrivee_centrale:  minutesEnHeure(arriveCentrale),
      fin_dechargement:  minutesEnHeure(finDechargement),
      retour_chantier:   minutesEnHeure(retourChantier),
    });

    cursor = retourChantier;
    if (cursor >= calc.heureFinMin) break;
  }

  // Rabotage : libre après déchargement à la centrale (doit vider sa benne)
  return {
    camionId: camion.id, immatriculation: camion.immatriculation ?? "Locatier",
    type: camion.type_vehicule ?? chantier.typeCamion, proprietaire: camion.proprietaire,
    chantier: chantier.nomChantier, typeChantier: "fraisat", centraleId: calc.centraleId,
    rotations,
    nbRotationsReelles: rotations.length,
    tonnageLivre: rotations.length * calc.capacite,
    libreA:    minutesEnHeure(dernierFinDechargement),
    libreAMin: dernierFinDechargement,
  };
}
