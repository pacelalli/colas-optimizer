// ─── CALCULS ENROBÉS ─────────────────────────────────────────────────────────
// Calculs spécifiques aux chantiers d'apport d'enrobés à chaud
// Gère : flux continu finisseur, rotations, comparaison centrales, planning camion
// Import des fonctions communes
import { haversine, heureEnMinutes, minutesEnHeure, getTypeCamion, getTempsTrajet } from "./calculsCommuns";
// Import des fichiers base de données (.JSON)
import centrales from "../../data/centrales.json";
import formules from "../../data/formules_enrobes.json";

// ─── COMPARAISON DES CENTRALES ───────────────────────────────────────────────

// Retourne un tableau trié de toutes les options centrale × formule avec coût à la tonne
export function comparerCentrales(chantier, nbCamionsColas = 0) {
  const type = getTypeCamion(chantier.typeCamion);
  if (!type) return [];
  if (!chantier.formule) return [];

  // Trouver la formule choisie dans formules_enrobes.json
  const formule = formules.find((f) => f.id === chantier.formule);
  if (!formule) return [];

  const nuit = chantier.chantierNuit ?? false;
  const options = [];

  for (const centrale of centrales) {

    // Centrale imposée ? On ignore les autres
    if (chantier.centraleImposee && centrale.id !== chantier.centrale) continue;

    // Cette centrale produit-elle la formule ?
    const tarif = formule.centrales.find((c) => c.centrale_id === centrale.id);
    if (!tarif?.disponible || tarif.prix_tonne === null) continue;

    // Calculer les rotations avec cette centrale spécifique
    const chantierAvecCentrale = {
      ...chantier,
      centrale:        centrale.id,
      centraleImposee: true,
    };
    const calc = calculerRotationsEnrobes(chantierAvecCentrale);
    if (!calc) continue;

    const nbCamionsTotal  = calc.nbCamions;
    const nbColas         = Math.min(nbCamionsColas, nbCamionsTotal);
    const nbLocatiers     = nbCamionsTotal - nbColas;

    // Coût matière = tonnage × prix à la tonne de la formule
    const coutMatiere = calc.tonnage * tarif.prix_tonne;

    // Coût transport selon jour/nuit et répartition Colas/locatiers
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

  // Trier par prix à la tonne croissant → meilleure option en premier
  return options.sort((a, b) => a.prixTonne - b.prixTonne);
}

// ─── CALCUL ROTATIONS ENROBÉS ────────────────────────────────────────────────

// Calcule le nombre de camions, rotations, temps de cycle pour un chantier enrobé
// Contrainte principale : flux continu pour alimenter le finisseur
export function calculerRotationsEnrobes(chantier) {
  const type = getTypeCamion(chantier.typeCamion);
  if (!type) return null;

  const tonnage = parseFloat(chantier.tonnage);
  const capacite = type.tonnage_utile; // en tonnes
  const nuit = chantier.chantierNuit ?? false;

  const centraleId = chantier.centrale;
  if (!centraleId) return null; // pas de centrale → pas de calcul

  // Temps de trajet central → chantier en minutes (avec coefficients nuit + type camion)
  const tempsTrajet = getTempsTrajet(centraleId, chantier.zoneId, nuit, type, chantier.typeTrajet ?? "urbain");
  if (tempsTrajet === null) return null;

  // heureDebut = arrivée sur chantier
  // donc départ centrale = heureDebut - trajet - chargement - bâchage
  const heureArriveeChantier = heureEnMinutes(chantier.heureDebut) ?? 7 * 60;
  const heureDepartCentrale = heureArriveeChantier - tempsTrajet - type.temps_chargement_enrobe - type.temps_bachage_enrobe;
  let heureFinMin = heureEnMinutes(chantier.heureFin) ?? 17 * 60;

  // Gestion passage minuit (ex: 21h00 → 05h00)
  if (heureFinMin < heureArriveeChantier) {
    heureFinMin += 24 * 60;
  }

  // Temps disponible brut depuis départ centrale
  let tempsDisponible = heureFinMin - heureDepartCentrale;

  // Pauses réglementaires
  const pauseChauffeur = 45; // pause chauffeur obligatoire
  let pauseRepas = 0;
  if (!nuit) {
    // Pause repas 1h si le chantier chevauche 12h-13h
    const debut12h = 12 * 60;
    const fin13h = 13 * 60;
    if (heureArriveeChantier < fin13h && heureFinMin > debut12h) {
      pauseRepas = 60;
    }
  }
  tempsDisponible = tempsDisponible - pauseChauffeur - pauseRepas;

  // Temps de cycle complet (aller-chargement-chantier-retour)
  const tempsCycle =
    type.temps_chargement_enrobe +
    type.temps_bachage_enrobe +
    tempsTrajet +
    type.temps_sur_chantier +
    tempsTrajet;

  // Intervalle d'arrivée sur chantier = temps sur chantier (pour flux continu finisseur)
  const intervalleArrivee = type.temps_sur_chantier;

  // ─── CALCUL ROTATIONS AVEC SEUIL 0.5 ────────────────────────────────────
  // rotationsExactes = valeur décimale réelle
  // Si la partie décimale ≥ 0.5 → on arrondit à l'entier supérieur (les camions peuvent faire ce tour)
  // Sinon → on reste à l'entier inférieur et on ajoute des camions si nécessaire
  const rotationsExactes = tempsDisponible / tempsCycle;
  const entierInf = Math.floor(rotationsExactes);
  const entierSup = Math.ceil(rotationsExactes);
  const rotationsTotales = Math.ceil(tonnage / capacite);

  let rotationsParCamion;

  if (rotationsExactes >= entierInf + 0.5) {
    // Dans la marge → la plupart des camions font entierSup rotations
    rotationsParCamion = entierSup;
  } else {
    // Trop proche de l'entier inférieur → tous font entierInf rotations, on ajoute des camions
    rotationsParCamion = entierInf;
  }

  // Tonnage livré par camion avec rotationsParCamion
  const tonnageParCamion = rotationsParCamion * capacite;

  // Nombre de camions nécessaires pour le tonnage
  // Après — basé sur rotations exactes, pas arrondies
 const nbCamionsTonnage = rotationsExactes >= entierInf + 0.5
    ? Math.ceil(rotationsTotales / rotationsExactes)  // ex: ceil(35/2.62) = 14
    : Math.ceil(rotationsTotales / entierInf);         // ex: ceil(35/2.3) = 18

  // Nombre de camions nécessaires pour flux continu (alimenter le finisseur sans interruption)
  const nbCamionsFluxContinu = Math.ceil(tempsCycle / intervalleArrivee);

  // On prend le max des deux contraintes
  const nbCamions = Math.max(nbCamionsTonnage, nbCamionsFluxContinu);

  // Répartition entre camions qui font rotationsMax et ceux qui font rotationsMin
  const excedentRotations = (nbCamions * entierInf) - rotationsTotales;
  const nbCamionsRotationsMin = excedentRotations > 0 ? excedentRotations : 0;
  const nbCamionsRotationsMax = nbCamions - nbCamionsRotationsMin;
  // ─── CALCUL DERNIER CAMION ───────────────────────────────────────────────
  // Tonnage total si tous les camions font rotationsParCamion rotations complètes
  const tonnageTotalCapacite = nbCamions * rotationsParCamion * capacite;
  // Excédent par rapport au tonnage commandé
  const excedent = tonnageTotalCapacite - tonnage;
  // Tonnage du dernier chargement (peut être inférieur à la capacité)
  const dernierChargement = capacite - (excedent % capacite);
  // Statut du dernier camion selon importance du reste
  const dernierCamionStatut = dernierChargement < capacite * 0.5
    ? "en attente des ordres du chef de chantier"
    : "chargement partiel prévu";

  console.log("=== CALCUL ROTATIONS ===");
console.log("Centrale:", centraleId);
console.log("Zone:", chantier.zoneId);
console.log("Trajet (min):", tempsTrajet);
console.log("Temps cycle (min):", tempsCycle);
console.log("Temps disponible (min):", tempsDisponible);
console.log("Rotations/camion:", rotationsParCamion);
console.log("Nb camions tonnage:", nbCamionsTonnage);
console.log("Nb camions flux continu:", nbCamionsFluxContinu);
console.log("→ Nb camions final:", nbCamions);
console.log("========================");

  return {
    // Identification
    chantierNom:  chantier.nomChantier,
    typeChantier: "enrobes",
    centraleId,

    // Tonnages
    tonnage,
    capacite,
    excedent:          Math.round(excedent),
    dernierChargement: Math.round(dernierChargement),
    dernierCamionStatut,

    // Camion
    typeCamion: type.label,

    // Temps
    tempsTrajet,
    tempsCycle,
    tempsDisponible,
    pauseRepas,
    pauseChauffeur,

    // Rotations
    rotationsParCamion,
    rotationsExactes:  Math.round(rotationsExactes * 100) / 100,
    tonnageParCamion,

    // Camions
    nbCamions,
    nbCamionsTonnage,
    nbCamionsRotationsMax,
    nbCamionsRotationsMin,
    nbCamionsFluxContinu,
    intervalleArrivee,

    // Horaires
    heureDepartCentrale,
    heureArriveeChantier,
    heureFinMin,
    nuit,
  };
}

// ─── GÉNÉRATION DU PLANNING D'UN CAMION ─────────────────────────────────────

// Génère l'itinéraire détaillé rotation par rotation pour un camion donné
// decalage = index du camion (0 = premier camion, 1 = deuxième...) pour le flux continu
export function genererPlanningCamionEnrobes(camion, chantier, calc, decalage = 0) {
  const rotations = [];
  const type = getTypeCamion(chantier.typeCamion);

  // Décalage entre camions pour flux continu
  // Camion 1 part à heureDepartCentrale
  // Camion 2 part à heureDepartCentrale + intervalleArrivee
  // Camion 3 part à heureDepartCentrale + 2 × intervalleArrivee
  let cursor = calc.heureDepartCentrale + decalage * calc.intervalleArrivee;

  for (let i = 0; i < calc.rotationsParCamion; i++) {
    const departCentrale  = cursor;
    const finChargement   = departCentrale + type.temps_chargement_enrobe + type.temps_bachage_enrobe;
    const arriveeChantier = finChargement + calc.tempsTrajet;
    const finDechargement = arriveeChantier + type.temps_sur_chantier;
    const retourCentrale  = finDechargement + calc.tempsTrajet;

    // Vérifier pause repas (12h-13h) pour chantiers de jour
    let cursorApresRotation = retourCentrale;
    if (!calc.nuit) {
      const debut12h = 12 * 60;
      const fin13h   = 13 * 60;
      if (retourCentrale > debut12h && cursor < fin13h) {
        cursorApresRotation = Math.max(retourCentrale, fin13h);
      }
    }

    rotations.push({
      rotation:         i + 1,
      depart_centrale:  minutesEnHeure(departCentrale),
      fin_chargement:   minutesEnHeure(finChargement),
      arrivee_chantier: minutesEnHeure(arriveeChantier),
      fin_dechargement: minutesEnHeure(finDechargement),
      retour_centrale:  minutesEnHeure(retourCentrale),
    });

    cursor = cursorApresRotation;

    // Arrêt si on dépasse heureFin
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
    libreA:    minutesEnHeure(calc.heureDepartCentrale + calc.rotationsParCamion * calc.tempsCycle),
    libreAMin: calc.heureDepartCentrale + calc.rotationsParCamion * calc.tempsCycle,
  };
}