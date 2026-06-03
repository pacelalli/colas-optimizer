import distancesJour from "../data/distances_jour.json";
import distancesNuit from "../data/distances_nuit.json";
import typesCamions from "../data/type_camions.json";
import flotteCamions from "../data/flotte_camions_colasAM.json";
import zonesAM from "../data/zones_am.json";

// ─── DÉTECTION AUTOMATIQUE DE ZONE ──────────────────────────────────────────

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function trouverZone(lat, lng) {
  if (!lat || !lng) return null;

  let meilleureCommune = null;
  let meilleureSecteur = null;
  let distanceMin = Infinity;

  for (const secteur of zonesAM.secteurs) {
    for (const commune of secteur.communes) {
      if (!commune.lat || !commune.lng) continue;
      const dist = haversine(lat, lng, commune.lat, commune.lng);
      if (dist < distanceMin) {
        distanceMin = dist;
        meilleureCommune = commune;
        meilleureSecteur = secteur;
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

export function suggererCentrale(lat, lng) {
  if (!lat || !lng) return "scerm";

  const centralesPrioritaires = [
    { id: "scerm", lat: 43.79341752457463, lng: 7.199321900683945, priorite: 1 },
    { id: "seca", lat: 43.7335066659438, lng: 7.3000760627566486, priorite: 2 },
    { id: "same", lat: 43.6870408041973, lng: 7.194072195888311, priorite: 3 },
    { id: "someca", lat: 43.53882282594299, lng: 6.560561467041949, priorite: 4 },
    { id: "ceb", lat: 43.43334136765973, lng: 6.821451587098211, priorite: 5 },
  ];

  let meilleure = null;
  let scoreMin = Infinity;

  for (const centrale of centralesPrioritaires) {
    const dist = haversine(lat, lng, centrale.lat, centrale.lng);
    const score = dist * centrale.priorite;
    if (score < scoreMin) {
      scoreMin = score;
      meilleure = centrale;
    }
  }

  return meilleure?.id ?? "scerm";
}

// ─── UTILITAIRES ────────────────────────────────────────────────────────────

function getTempsTrajet(centraleId, zoneId, isNuit = false) {
  const matrice = isNuit ? distancesNuit : distancesJour;
  return matrice[centraleId]?.[zoneId] ?? 45; // 45 min par défaut si inconnu
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

  const centraleId = chantier.centraleImposee
    ? chantier.centrale
    : chantier.centrale || suggererCentrale(chantier.lat, chantier.lng);

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