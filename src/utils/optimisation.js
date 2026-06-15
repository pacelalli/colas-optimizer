// Import des fichiers base de données (.JSON) pour utilisation dans le présent fichier
import distances from "../data/distances.json";
import typesCamions from "../data/type_camions.json";
import flotteCamions from "../data/flotte_camions_colasAM.json";
import zonesAM from "../data/zones_am.json";
import centrales from "../data/centrales.json";
import formules from "../data/formules_enrobes.json";

// ─── DÉTECTION AUTOMATIQUE DE ZONE ──────────────────────────────────────────

// Initialisation d'une fonction qui reçoit les coordonnées GPS de deux points (latitude et longitude)
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371; {/* rayon de la terre (en km) - constante nécessaire pour calcul de distances réelles */}
  const dLat = ((lat2 - lat1) * Math.PI) / 180; {/* calcule la différence de latitude et longitude entre les deux points --> conversion de degrés en radians pour trigonométire JavaScript*/}
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  {/* formule mathématique de Haversine, calcul de distances en prenant compte de la courbure de la terre */}
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); {/*} finalise le calcul et retourne la distance en km --> distance réelle à vol d'oiseau entre deux points */}
}

// Fonction exportée qui reçoit les coordonnées GPS du chantier 
export function trouverZone(lat, lng) {
  if (!lat || !lng) return null; {/* si les coordonées sont manquantes, alors pas la peine de chercher */}

  // intialisation de trois variables 
  let meilleureCommune = null; {/* la commune la plus proche trouvée jusqu'ici */}
  let meilleureSecteur = null; {/* le secteur de cette commune */}
  let distanceMin = Infinity; {/* distance minimale, commence à l'infini pour que la première commune testée la batte forcémen */}

  // boucle sur chaque secteur de zones_am.json
  for (const secteur of zonesAM.secteurs) { 
    // pour chaque secteur, boucle sur les villes/communes
    for (const commune of secteur.communes) {
      // si pas de coorodnnées GPS pour la commune, alors on la saute
      if (!commune.lat || !commune.lng) continue;
      const dist = haversine(lat, lng, commune.lat, commune.lng); {/* caclule, avec la fonction expliquée ci-dessus, la distance à vol d'oiseau entre le chantier et cette commune */}
      // si cette commune est plus du chantier que la meilleure trouvée jusqu'ici, alors 
      if (dist < distanceMin) {
        distanceMin = dist; {/* elle devient la nouvelle distance min */}
        meilleureCommune = commune; {/* elle devient la meilleure commune */}
        meilleureSecteur = secteur; {/* le secteur devient le meilleur */}
      }
    }
  }

  return {
    commune: meilleureCommune?.nom,
    secteur: meilleureSecteur?.label,
    zoneId: meilleureCommune?.nom
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s-]/g, "_"),
    distanceKm: Math.round(distanceMin * 10) / 10,
  };
}

// ─── COMPARAISON DES CENTRALES ───────────────────────────────────────────────

export function comparerCentrales(chantier, nbCamionsColas = 0) {
  const type = getTypeCamion(chantier.typeCamion);
  if (!type) return [];
  if (!chantier.formule) return [];

  // Trouver la formule choisie
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

    // Calculer les rotations avec cette centrale
    const chantierAvecCentrale = {
      ...chantier,
      centrale:        centrale.id,
      centraleImposee: true,
    };
    const calc = calculerRotations(chantierAvecCentrale);
    if (!calc) continue;

    const nbCamionsTotal  = calc.nbCamions;
    const nbColas         = Math.min(nbCamionsColas, nbCamionsTotal);
    const nbLocatiers     = nbCamionsTotal - nbColas;

    // Coût matière
    const coutMatiere = calc.tonnage * tarif.prix_tonne;

    // Coût transport selon jour/nuit et répartition Colas/locatiers
    const prixUnitaireColas     = nuit ? type.prix_colas_nuit     : type.prix_colas_jour;
    const prixUnitaireLocatier  = nuit ? type.prix_locatier_nuit  : type.prix_locatier_jour;

    const coutCamions = (nbColas * prixUnitaireColas) + (nbLocatiers * prixUnitaireLocatier);

    const coutTotal  = coutMatiere + coutCamions;
    const prixTonne  = Math.round(coutTotal / calc.tonnage);

    options.push({
      centraleId:   centrale.id,
      centraleNom:  centrale.nom,
      formuleId:    formule.id,
      formuleNom:   formule.nom,
      numero:       tarif.numero ?? null,
      nbCamions:    nbCamionsTotal,
      nbColas,
      nbLocatiers,
      distanceKm:   Math.round(haversine(chantier.lat, chantier.lng, centrale.lat, centrale.lng)),
      prixTonne,
      coutTotal:    Math.round(coutTotal),
      detail: {
        coutMatiere:  Math.round(coutMatiere),
        coutCamions:  Math.round(coutCamions),
        prixTonneMatiere: tarif.prix_tonne,
      },
    });
  }

  // Trier par prix à la tonne croissant
  return options.sort((a, b) => a.prixTonne - b.prixTonne);
}


// FONCTIONS UTILES

{/* Déclaration de la fonction avec 4 entrées, et chantier de jour par défaut et coefficent de vitesse de camion à 1 par défaut */}
function getTempsTrajet(centraleId, zoneId, isNuit = false, coeffCamion = 1.0) {
  const tempsBase = distances[centraleId]?.[zoneId]; {/* Récupère le temps de trajet de base dans distances.json */}
  if (tempsBase === null || tempsBase === undefined) return null; {/* Si pas de données → retourne null */}
  // ? valeur_si_vrai : valeur_si_faux
  const coeffTrafic = isNuit 
    ? distances.meta.coeff_nuit 
    : distances.meta.coeff_jour;
  return Math.round(tempsBase * coeffTrafic * coeffCamion); {/*Applique le coefficient de vitesse du type de camion (dans l'appel de la fonction calculer rotations) */}
}

function getTypeCamion(typeId) {
  return typesCamions.find((t) => t.id === typeId);
}

function heureEnMinutes(heure) {
  if (!heure) return null;
  const [h, m] = heure.split(":").map(Number);
  return h * 60 + m;
}

function minutesEnHeure(minutes) {
  const totalMin = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}`;
}

function isNuit(heure) {
  const minutes = heureEnMinutes(heure);
  return minutes !== null && (minutes >= 20 * 60 || minutes < 6 * 60);
}

// ─── CALCUL ROTATIONS PAR CHANTIER ──────────────────────────────────────────

export function calculerRotations(chantier) {
  const type = getTypeCamion(chantier.typeCamion);
  if (!type) return null;

  const tonnage = parseFloat(chantier.tonnage);
  const capacite = type.tonnage_utile; // déjà en tonnes
  const nuit = chantier.chantierNuit ?? false;

 const centraleId = chantier.centrale;
if (!centraleId) return null; // pas de centrale → pas de calcul

  const tempsTrajetBase = getTempsTrajet(centraleId, chantier.zoneId, nuit);
  const coeff = type.coefficient_trajet ?? 1.0;
  const tempsTrajet = Math.round(tempsTrajetBase * coeff);

  // heureDebut = arrivée sur chantier
  // donc départ centrale = heureDebut - trajet - chargement - bâchage
  const heureArriveeChantier = heureEnMinutes(chantier.heureDebut) ?? 7 * 60;
  const heureDepartCentrale = heureArriveeChantier - tempsTrajet - type.temps_chargement_enrobe - type.temps_bachage_enrobe;
  let heureFinMin = heureEnMinutes(chantier.heureFin) ?? 17 * 60;

  // Gestion passage minuit
  if (heureFinMin < heureArriveeChantier) {
    heureFinMin += 24 * 60;
  }

  // Temps disponible brut depuis départ centrale
  let tempsDisponible = heureFinMin - heureDepartCentrale;

  // Pauses
  const pauseChauffeur = 45;
  let pauseRepas = 0;
  if (!nuit) {
    const debut12h = 12 * 60;
    const fin13h = 13 * 60;
    if (heureArriveeChantier < fin13h && heureFinMin > debut12h) {
      pauseRepas = 60;
    }
  }
  tempsDisponible = tempsDisponible - pauseChauffeur - pauseRepas;

  // Temps de cycle complet
  const tempsCycle =
    type.temps_chargement_enrobe +
    type.temps_bachage_enrobe +
    tempsTrajet +
    type.temps_sur_chantier +
    tempsTrajet;

  // Rotations par camion
  const rotationsParCamion = Math.max(1, Math.floor(tempsDisponible / tempsCycle));

  // Tonnage livré par camion
  const tonnageParCamion = rotationsParCamion * capacite;

  // Camions nécessaires pour le tonnage
  const nbCamionsTonnage = Math.ceil(tonnage / tonnageParCamion);

  // Camions nécessaires pour flux continu (finisseur)
  const intervalleArrivee = type.temps_sur_chantier;
  const nbCamionsFluxContinu = Math.ceil(tempsCycle / intervalleArrivee);

  // On prend le max des deux
  const nbCamions = Math.max(nbCamionsTonnage, nbCamionsFluxContinu);

  console.log("tempsDisponible:", tempsDisponible);
  console.log("tempsCycle:", tempsCycle);
  console.log("rotationsParCamion:", rotationsParCamion);
  console.log("tonnageParCamion:", tonnageParCamion);

  return {
    chantierNom: chantier.nomChantier,
    centraleId,
    tonnage,
    capacite,
    typeCamion: type.label,
    tempsTrajet,
    tempsCycle,
    rotationsParCamion,
    tonnageParCamion,
    nbCamions,
    nbCamionsTonnage,
    nbCamionsFluxContinu,
    intervalleArrivee,
    pauseRepas,
    pauseChauffeur,
    tempsDisponible,
    heureDepartCentrale,
    heureArriveeChantier,
    heureFinMin,
    nuit,
  };
}

// ─── GÉNÉRATION DU PLANNING D'UN CAMION ─────────────────────────────────────

export function genererPlanningCamion(camion, chantier, calc, decalage = 0) {
  const rotations = [];
  const type = getTypeCamion(chantier.typeCamion);

  // Décalage entre camions pour flux continu
  // Camion 1 part à heureDepartCentrale
  // Camion 2 part à heureDepartCentrale + intervalleArrivee
  // Camion 3 part à heureDepartCentrale + 2 × intervalleArrivee
  let cursor = calc.heureDepartCentrale + decalage * calc.intervalleArrivee;

  for (let i = 0; i < calc.rotationsParCamion; i++) {
    const departCentrale = cursor;
    const finChargement = departCentrale + type.temps_chargement_enrobe + type.temps_bachage_enrobe;
    const arriveeChantier = finChargement + calc.tempsTrajet;
    const finDechargement = arriveeChantier + type.temps_sur_chantier;
    const retourCentrale = finDechargement + calc.tempsTrajet;

    // Vérifier pause repas (12h-13h)
    let cursorApresRotation = retourCentrale;
    if (!calc.nuit) {
      const debut12h = 12 * 60;
      const fin13h = 13 * 60;
      if (retourCentrale > debut12h && cursor < fin13h) {
        cursorApresRotation = Math.max(retourCentrale, fin13h);
      }
    }

    rotations.push({
      rotation: i + 1,
      depart_centrale: minutesEnHeure(departCentrale),
      fin_chargement: minutesEnHeure(finChargement),
      arrivee_chantier: minutesEnHeure(arriveeChantier),
      fin_dechargement: minutesEnHeure(finDechargement),
      retour_centrale: minutesEnHeure(retourCentrale),
    });

    cursor = cursorApresRotation;

    // Arrêt si on dépasse heureFin
    if (cursor >= calc.heureFinMin) break;
  }

  return {
    camionId: camion.id,
    immatriculation: camion.immatriculation ?? "Locatier",
    type: camion.type_vehicule ?? chantier.typeCamion,
    proprietaire: camion.proprietaire,
    chantier: chantier.nomChantier,
    centraleId: calc.centraleId,
    rotations,
    libreA: minutesEnHeure(calc.heureDepartCentrale + calc.rotationsParCamion * calc.tempsCycle),
    libreAMin: calc.heureDepartCentrale + calc.rotationsParCamion * calc.tempsCycle,
  };
}

// ─── ALGORITHME PRINCIPAL D'OPTIMISATION ────────────────────────────────────

export function optimiser(chantiers) {
  if (!chantiers || chantiers.length === 0) return { plannings: [], locatiers: 0 };

  // Trier par date puis heure de début
  const sorted = [...chantiers].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (heureEnMinutes(a.heureDebut) ?? 0) - (heureEnMinutes(b.heureDebut) ?? 0);
  });

  // Camions disponibles triés par priorité
  const camionsDispos = [...flotteCamions]
    .filter((c) => c.disponible)
    .sort((a, b) => a.priorite - b.priorite);

  const planningsFinal = [];
  const camionsOccupes = {}; // camionId → libreAMin

  let locatiersNecessaires = 0;

  console.log("Chantiers reçus:", chantiers);
  console.log("Sorted:", sorted);

  for (const chantier of sorted) {
    const calc = calculerRotations(chantier);
    console.log("CALC result:", calc);
    if (!calc) continue;

    let camionsAAffecter = calc.nbCamions;
    let decalage = 0;

    console.log("Chantier typeCamion:", chantier.typeCamion);
    console.log("Camions dispos:", camionsDispos.map(c => ({ id: c.id, type_id: c.type_id, disponible: c.disponible })));
    console.log("CALC nbCamions:", calc?.nbCamions);

    for (const camion of camionsDispos) {
      if (camionsAAffecter <= 0) break;
      if (camion.type_id !== chantier.typeCamion) continue;

      const libreA = camionsOccupes[camion.id] ?? 0;
      if (libreA > calc.heureDepartCentrale + 30) continue;

      const planning = genererPlanningCamion(camion, chantier, calc, decalage);
      planningsFinal.push(planning);
      camionsOccupes[camion.id] = planning.libreAMin;
      camionsAAffecter--;
      decalage++;
    }

    if (camionsAAffecter > 0) {
      locatiersNecessaires += camionsAAffecter;
      for (let i = 0; i < camionsAAffecter; i++) {
        const planning = genererPlanningCamion(
          { id: `loc-${i}`, immatriculation: null, type_vehicule: chantier.typeCamion, proprietaire: "Locatier" },
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
    plannings: planningsFinal,
    locatiers: locatiersNecessaires,
    totalCamions: planningsFinal.length,
    camionsColas: planningsFinal.filter((p) => p.proprietaire === "Colas").length,
  };
}