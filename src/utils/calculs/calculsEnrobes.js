// ─── CALCULS ENROBÉS ─────────────────────────────────────────────────────────
// Calculs spécifiques aux chantiers d'apport d'enrobés à chaud
// Gère : flux continu finisseur, rotations, comparaison centrales, planning camion
// Import des fonctions communes
import { haversine, heureEnMinutes, minutesEnHeure, getTypeCamion, getTempsTrajet } from "./calculsCommuns";
// Import des fichiers base de données (.JSON)
import centrales from "../../data/centrales.json";
import formules from "../../data/formules_enrobes.json";

// ─── COMPARAISON DES CENTRALES ───────────────────────────────────────────────
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

    const nbCamionsTotal  = calc.nbCamions;
    const nbColas         = Math.min(nbCamionsColas, nbCamionsTotal);
    const nbLocatiers     = nbCamionsTotal - nbColas;
    const coutMatiere     = calc.tonnage * tarif.prix_tonne;
    const prixUnitaireColas    = nuit ? type.prix_colas_nuit    : type.prix_colas_jour;
    const prixUnitaireLocatier = nuit ? type.prix_locatier_nuit : type.prix_locatier_jour;
    const coutCamions = (nbColas * prixUnitaireColas) + (nbLocatiers * prixUnitaireLocatier);
    const coutTotal = coutMatiere + coutCamions;
    const prixTonne = Math.round(coutTotal / calc.tonnage);

    options.push({
      centraleId:  centrale.id,
      centraleNom: centrale.nom,
      formuleId:   formule.id,
      formuleNom:  formule.nom,
      numero:      tarif.numero ?? null,
      nbCamions:   nbCamionsTotal,
      nbColas,
      nbLocatiers,
      distanceKm:  Math.round(haversine(chantier.lat, chantier.lng, centrale.lat, centrale.lng)),
      prixTonne,
      coutTotal:   Math.round(coutTotal),
      detail: {
        coutMatiere:      Math.round(coutMatiere),
        coutCamions:      Math.round(coutCamions),
        prixTonneMatiere: tarif.prix_tonne,
      },
    });
  }

  return options.sort((a, b) => a.prixTonne - b.prixTonne);
}

// ─── CALCUL ROTATIONS ENROBÉS ────────────────────────────────────────────────
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

  const tempsCycle =
    type.temps_chargement_enrobe +
    type.temps_bachage_enrobe +
    tempsTrajet +
    type.temps_sur_chantier_enrobe +
    tempsTrajet;

  const intervalleArrivee = type.temps_sur_chantier_enrobe;
  const rotationsTotales = Math.ceil(tonnage / capacite);
  const rotationsExactes = tempsDisponible / tempsCycle;
  const entierInf = Math.floor(rotationsExactes);

  const rotationsRefSeuil = rotationsExactes >= entierInf + 0.5 ? entierInf + 1 : entierInf;

  const SEUIL_TEMPS_PROCHE = 15;
  const MAX_ROTATIONS_ENROBES = 3;

  const rotationsParCamion = (
    chantier.rotationsIllimitees === true || tempsTrajet < SEUIL_TEMPS_PROCHE
  ) ? rotationsRefSeuil : Math.min(rotationsRefSeuil, MAX_ROTATIONS_ENROBES);

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

  const tonnageParCamion = rotationsParCamionFinal * capacite;
  const tonnageRealisable = nbCamions * rotationsParCamionFinal * capacite;
  const chantierRealisableEnJour = tonnageRealisable >= tonnage;
  const nbJoursNecessaires = chantierRealisableEnJour ? 1 : Math.ceil(tonnage / tonnageRealisable);

  const excedentRotations = (nbCamions * rotationsParCamionFinal) - rotationsTotales;
  const nbCamionsRotationsMin = Math.max(0, excedentRotations);
  const nbCamionsRotationsMax = nbCamions - nbCamionsRotationsMin;

  const tonnageTotalCapacite = nbCamions * rotationsParCamionFinal * capacite;
  const excedent = tonnageTotalCapacite - tonnage;
  const dernierChargement = capacite - (excedent % capacite);
  const dernierCamionStatut = dernierChargement < capacite * 0.5
    ? "en attente des ordres du chef de chantier"
    : "chargement partiel prévu";

  console.log("=== CALCUL ROTATIONS ===");
  console.log("Centrale:", centraleId);
  console.log("Zone:", chantier.zoneId);
  console.log("Trajet (min):", tempsTrajet);
  console.log("Temps cycle (min):", tempsCycle);
  console.log("Temps disponible (min):", tempsDisponible);
  console.log("Rotations exactes:", rotationsExactes);
  console.log("rotationsRefSeuil:", rotationsRefSeuil);
  console.log("Proche (< 15 min):", tempsTrajet < SEUIL_TEMPS_PROCHE);
  console.log("rotationsIllimitees:", chantier.rotationsIllimitees);
  console.log("→ rotationsParCamionFinal:", rotationsParCamionFinal);
  console.log("Nb camions tonnage:", nbCamionsTonnage);
  console.log("→ Nb camions final:", nbCamions);
  console.log("========================");

  return {
    chantierNom:  chantier.nomChantier,
    typeChantier: "enrobes",
    centraleId,
    tonnage,
    capacite,
    excedent:          Math.round(excedent),
    dernierChargement: Math.round(dernierChargement),
    dernierCamionStatut,
    typeCamion: type.label,
    tempsTrajet,
    tempsCycle,
    tempsDisponible,
    pauseTotale,
    rotationsParCamion: rotationsParCamionFinal,
    rotationsExactes:  Math.round(rotationsExactes * 100) / 100,
    tonnageParCamion,
    nbCamions,
    nbCamionsTonnage,
    nbCamionsRotationsMax,
    nbCamionsRotationsMin,
    intervalleArrivee,
    heureDepartCentrale,
    heureArriveeChantier,
    heureFinMin,
    nuit,
    rotationsTotales,
    tonnageRealisable:        Math.round(tonnageRealisable),
    chantierRealisableEnJour,
    nbJoursNecessaires,
  };
}

// ─── GÉNÉRATION DU PLANNING D'UN CAMION ─────────────────────────────────────
export function genererPlanningCamionEnrobes(camion, chantier, calc, decalage = 0) {
  const rotations = [];
  const type = getTypeCamion(chantier.typeCamion);

  let cursor = calc.heureDepartCentrale + decalage * calc.intervalleArrivee;

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
    const finChargement   = departCentrale + type.temps_chargement_enrobe + type.temps_bachage_enrobe;
    const arriveeChantier = finChargement + calc.tempsTrajet;
    const finDechargement = arriveeChantier + type.temps_sur_chantier_enrobe;
    const retourCentrale  = finDechargement + calc.tempsTrajet;

    rotations.push({
      rotation:         i + 1,
      depart_centrale:  minutesEnHeure(departCentrale),
      fin_chargement:   minutesEnHeure(finChargement),
      arrivee_chantier: minutesEnHeure(arriveeChantier),
      fin_dechargement: minutesEnHeure(finDechargement),
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
    typeChantier:    "enrobes",
    centraleId:      calc.centraleId,
    rotations,
    libreA:    minutesEnHeure(cursor),
    libreAMin: cursor,
  };
}
