// ─── CALCULS ENROBÉS ─────────────────────────────────────────────────────────
// Cycle : centrale → chargement+bâchage → chantier → déchargement → centrale
// Libre après : déchargement sur chantier (dernière rotation)
import { haversine, heureEnMinutes, minutesEnHeure, getTypeCamion, getTempsTrajet } from "./calculsCommuns";
import centrales from "../../data/centrales.json";
import formules from "../../data/formules_enrobes.json";

export function comparerCentrales(chantier, nbCamionsColas = 0) {
  const type = getTypeCamion(chantier.typeCamion);
  if (!type) return [];
  if (!chantier.formule) return [];
  const formule = formules.find((f) => f.id === chantier.formule);
  if (!formule) return [];
  const nuit = chantier.chantierNuit ?? false;
  const options = [];
  for (const centrale of centrales) {
    if (chantier.centraleImposee && centrale.id !== chantier.centrale) continue;
    const tarif = formule.centrales.find((c) => c.centrale_id === centrale.id);
    if (!tarif?.disponible || tarif.prix_tonne === null) continue;
    const chantierAvecCentrale = { ...chantier, centrale: centrale.id, centraleImposee: true };
    const calc = calculerRotationsEnrobes(chantierAvecCentrale);
    if (!calc) continue;
    const nbCamionsTotal = calc.nbCamions;
    const nbColas = Math.min(nbCamionsColas, nbCamionsTotal);
    const nbLocatiers = nbCamionsTotal - nbColas;
    const coutMatiere = calc.tonnage * tarif.prix_tonne;
    const prixUnitaireColas = nuit ? type.prix_colas_nuit : type.prix_colas_jour;
    const prixUnitaireLocatier = nuit ? type.prix_locatier_nuit : type.prix_locatier_jour;
    const coutCamions = (nbColas * prixUnitaireColas) + (nbLocatiers * prixUnitaireLocatier);
    const coutTotal = coutMatiere + coutCamions;
    const prixTonne = Math.round(coutTotal / calc.tonnage);
    options.push({
      centraleId: centrale.id, centraleNom: centrale.nom, formuleId: formule.id,
      formuleNom: formule.nom, numero: tarif.numero ?? null,
      nbCamions: nbCamionsTotal, nbColas, nbLocatiers,
      distanceKm: Math.round(haversine(chantier.lat, chantier.lng, centrale.lat, centrale.lng)),
      prixTonne, coutTotal: Math.round(coutTotal),
      detail: { coutMatiere: Math.round(coutMatiere), coutCamions: Math.round(coutCamions), prixTonneMatiere: tarif.prix_tonne },
    });
  }
  return options.sort((a, b) => a.prixTonne - b.prixTonne);
}

export function calculerRotationsEnrobes(chantier) {
  const type = getTypeCamion(chantier.typeCamion);
  if (!type) return null;
  const tonnage = parseFloat(chantier.tonnage);
  const capacite = type.tonnage_utile;
  const nuit = chantier.chantierNuit ?? false;
  const centraleId = chantier.centrale;
  if (!centraleId) return null;
  const tempsTrajet = getTempsTrajet(centraleId, chantier.zoneId, nuit, type, chantier.typeTrajet ?? "urbain");
  if (tempsTrajet === null) return null;

  const heureArriveeChantier = heureEnMinutes(chantier.heureDebut) ?? 7 * 60;
  const heureDepartCentrale = heureArriveeChantier - tempsTrajet - type.temps_chargement_enrobe - type.temps_bachage_enrobe;
  let heureFinMin = heureEnMinutes(chantier.heureFin) ?? 17 * 60;
  if (heureFinMin < heureArriveeChantier) heureFinMin += 24 * 60;

  let tempsDisponible = heureFinMin - heureDepartCentrale;
  const pauseTotale = nuit ? 45 : 60;
  tempsDisponible -= pauseTotale;

  const tempsCycle = type.temps_chargement_enrobe + type.temps_bachage_enrobe + tempsTrajet + type.temps_sur_chantier_enrobe + tempsTrajet;
  const intervalleArrivee = type.temps_sur_chantier_enrobe;
  const rotationsTotales = Math.ceil(tonnage / capacite);
  const rotationsExactes = tempsDisponible / tempsCycle;
  const entierInf = Math.floor(rotationsExactes);
  // Seuil 0.5 : si partie décimale >= 0.5, on peut prétendre à entierInf+1 rotations
  const rotationsRefSeuil = rotationsExactes >= entierInf + 0.5 ? entierInf + 1 : entierInf;

  const SEUIL_TEMPS_PROCHE = 15;
  const MAX_ROTATIONS_ENROBES = 3;
  // Plafond sauf centrale proche ou CdT illimité
  const rotationsParCamion = (chantier.rotationsIllimitees === true || tempsTrajet < SEUIL_TEMPS_PROCHE)
    ? rotationsRefSeuil : Math.min(rotationsRefSeuil, MAX_ROTATIONS_ENROBES);

  const proche = chantier.rotationsIllimitees === true || tempsTrajet < SEUIL_TEMPS_PROCHE;
  // Si rotationsExactes < entierInf+0.5 → tous font entierInf rotations → diviser par entierInf
  // Si rotationsExactes >= entierInf+0.5 → certains font entierInf+1 → diviser par rotationsExactes
  const nbCamionsTonnage = proche
    ? Math.ceil(rotationsTotales / rotationsExactes)
    : Math.ceil(rotationsTotales / rotationsParCamion);

  // Nb camions imposé par le CdT ?
  const nbCamionsFinal = (chantier.nbCamionsImposeActif && chantier.nbCamionsImpose)
    ? parseInt(chantier.nbCamionsImpose) : nbCamionsTonnage;
  const nbCamions = nbCamionsFinal;

  // Si nb imposé → recalculer rotations par camion
  const rotationsParCamionFinal = (chantier.nbCamionsImposeActif && chantier.nbCamionsImpose)
    ? Math.ceil(rotationsTotales / nbCamions) : rotationsParCamion;

  const tonnageParCamion = rotationsParCamionFinal * capacite;
  const tonnageRealisable = nbCamions * rotationsParCamionFinal * capacite;
  const chantierRealisableEnJour = tonnageRealisable >= tonnage;
  const nbJoursNecessaires = chantierRealisableEnJour ? 1 : Math.ceil(tonnage / tonnageRealisable);

  // nbCamionsRotationsMax = nb de camions qui font entierInf+1 rotations (les premiers de la rame)
  // = rotationsTotales - (nbCamions × entierInf)
  const entierInfFinal = Math.floor(rotationsParCamionFinal);
  const nbCamionsRotationsMax = rotationsTotales - (nbCamions * entierInfFinal);
  const nbCamionsRotationsMin = nbCamions - nbCamionsRotationsMax;

  const tonnageTotalCapacite = nbCamions * rotationsParCamionFinal * capacite;
  const excedent = tonnageTotalCapacite - tonnage;
  const dernierChargement = capacite - (excedent % capacite === 0 ? capacite : excedent % capacite);
  const dernierCamionStatut = dernierChargement < capacite * 0.5
    ? "en attente des ordres du chef de chantier" : "chargement partiel prévu";

  return {
    chantierNom: chantier.nomChantier, typeChantier: "enrobes", centraleId,
    tonnage, capacite, excedent: Math.round(excedent),
    dernierChargement: Math.round(dernierChargement), dernierCamionStatut,
    typeCamion: type.label, tempsTrajet, tempsCycle, tempsDisponible, pauseTotale,
    rotationsParCamion: rotationsParCamionFinal,
    rotationsExactes: Math.round(rotationsExactes * 100) / 100,
    tonnageParCamion, nbCamions, nbCamionsTonnage,
    nbCamionsRotationsMax: Math.max(0, nbCamionsRotationsMax),
    nbCamionsRotationsMin: Math.max(0, nbCamionsRotationsMin),
    intervalleArrivee, heureDepartCentrale, heureArriveeChantier, heureFinMin, nuit,
    rotationsTotales, tonnageRealisable: Math.round(tonnageRealisable),
    chantierRealisableEnJour, nbJoursNecessaires,
  };
}

// compteur = { effectuees, totales, tonnageCumule } partagé entre tous les camions du chantier
export function genererPlanningCamionEnrobes(camion, chantier, calc, decalage = 0, compteur = null) {
  const rotations = [];
  const type = getTypeCamion(chantier.typeCamion);

  // Décalage entre camions : temps_chargement + 3 min transition
  // Le bâchage ne bloque pas la centrale (se fait sur le côté)
  const TRANSITION = 3;
  const ecartDepart = type.temps_chargement_enrobe + TRANSITION;
  let cursor = calc.heureDepartCentrale + decalage * ecartDepart;

  // Les nbCamionsRotationsMax premiers (decalage 0,1,...) font entierInf+1 rotations
  // Les autres font entierInf rotations
  const entierInf = Math.floor(calc.rotationsExactes);
  const rotationsCeCamion = decalage < calc.nbCamionsRotationsMax ? entierInf + 1 : entierInf;

  let dernierFinDechargement = cursor; // pour libreA = fin déchargement dernière rotation

  for (let i = 0; i < rotationsCeCamion; i++) {
    // STOP si le tonnage total est déjà atteint (compteur partagé)
    if (compteur && compteur.effectuees >= compteur.totales) break;

    // Pause repas 12h-13h pour chantiers de jour
    if (!calc.nuit && cursor >= 12 * 60 && cursor < 13 * 60) cursor = 13 * 60;

    const departCentrale  = cursor;
    const finChargement   = departCentrale + type.temps_chargement_enrobe + type.temps_bachage_enrobe;
    const arriveeChantier = finChargement + calc.tempsTrajet;
    const finDechargement = arriveeChantier + type.temps_sur_chantier_enrobe;
    const retourCentrale  = finDechargement + calc.tempsTrajet;

    dernierFinDechargement = finDechargement;

    // Décompte tonnage
    let tonnageCumuleGlobal = null;
    if (compteur) {
      compteur.effectuees++;
      compteur.tonnageCumule += calc.capacite;
      tonnageCumuleGlobal = Math.min(compteur.tonnageCumule, calc.tonnage);
    }

    rotations.push({
      rotation:           i + 1,
      tonnage_rotation:   calc.capacite,
      tonnage_cumule:     (i + 1) * calc.capacite,
      tonnage_cumule_global: tonnageCumuleGlobal,
      depart_centrale:    minutesEnHeure(departCentrale),
      fin_chargement:     minutesEnHeure(finChargement),
      arrivee_chantier:   minutesEnHeure(arriveeChantier),
      fin_dechargement:   minutesEnHeure(finDechargement),
      retour_centrale:    minutesEnHeure(retourCentrale),
    });

    cursor = retourCentrale;
    if (cursor >= calc.heureFinMin) break;
  }

  // Enrobés : libre après déchargement sur chantier (pas besoin de retour centrale)
  return {
    camionId: camion.id, immatriculation: camion.immatriculation ?? "Locatier",
    type: camion.type_vehicule ?? chantier.typeCamion, proprietaire: camion.proprietaire,
    chantier: chantier.nomChantier, typeChantier: "enrobes", centraleId: calc.centraleId,
    rotations,
    nbRotationsReelles: rotations.length,
    tonnageLivre: rotations.length * calc.capacite,
    libreA:    minutesEnHeure(dernierFinDechargement),
    libreAMin: dernierFinDechargement,
  };
}
