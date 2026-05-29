import distancesJour from "../data/distances_jour.json";
import distancesNuit from "../data/distances_nuit.json";
import typesCamions from "../data/type_camions.json";
import flotteCamions from "../data/flotte_camions_colasAM.json";

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
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
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
  const capacite = type.tonnage_utile / 1000; // kg → tonnes
  const nuit = isNuit(chantier.heureDebut);
  const tempsTrajet = getTempsTrajet(chantier.centrale, chantier.zoneId, nuit);
  const coeff = type.coefficient_trajet ?? 1.0;
  const tempsTrajetCamion = Math.round(tempsTrajet * coeff);

  const tempsCycle =
    tempsTrajetCamion + // centrale → chantier
    type.temps_chargement_enrobe +
    type["temps-bachage_enrobe"] +
    type.temps_dechargement_enrobe +
    tempsTrajetCamion; // chantier → centrale

  const heureDebutMin = heureEnMinutes(chantier.heureDebut) ?? 7 * 60;
  const heureFinMin = heureEnMinutes(chantier.heureFin) ?? 17 * 60;
  const dureeChantier = heureFinMin - heureDebutMin;

  const rotationsParCamion = Math.floor(dureeChantier / tempsCycle);
  const tonnageParCamion = rotationsParCamion * capacite;
  const nbCamions = Math.ceil(tonnage / tonnageParCamion);

  return {
    chantierNom: chantier.nomChantier,
    centrale: chantier.centrale,
    tonnage,
    capacite,
    typeCamion: type.label,
    tempsTrajetCamion,
    tempsCycle,
    rotationsParCamion,
    tonnageParCamion,
    nbCamions,
    heureDebutMin,
    heureFinMin,
    nuit,
  };
}

// ─── GÉNÉRATION DU PLANNING D'UN CAMION ─────────────────────────────────────

export function genererPlanningCamion(camion, chantier, calc) {
  const rotations = [];
  let cursor = calc.heureDebutMin;
  const type = getTypeCamion(chantier.typeCamion);

  for (let i = 0; i < calc.rotationsParCamion; i++) {
    const depart = cursor;
    const arriveeChantier = depart + calc.tempsTrajetCamion;
    const finChargement = depart + type.temps_chargement_enrobe + type["temps-bachage_enrobe"];
    const finDechargement = arriveeChantier + type.temps_dechargement_enrobe;
    const retourCentrale = finDechargement + calc.tempsTrajetCamion;

    rotations.push({
      rotation: i + 1,
      depart_centrale: minutesEnHeure(depart),
      arrivee_chantier: minutesEnHeure(arriveeChantier),
      fin_dechargement: minutesEnHeure(finDechargement),
      retour_centrale: minutesEnHeure(retourCentrale),
    });

    cursor = retourCentrale;
  }

  return {
    camionId: camion.id,
    immatriculation: camion.immatriculation,
    type: camion.type_vehicule,
    proprietaire: camion.proprietaire,
    chantier: chantier.nomChantier,
    centrale: chantier.centrale,
    rotations,
    libreA: minutesEnHeure(cursor),
    libreAMin: cursor,
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

  for (const chantier of sorted) {
    const calc = calculerRotations(chantier);
    if (!calc) continue;

    let camionsAffecter = calc.nbCamions;

    for (const camion of camionsDispos) {
      if (camionsAffecter <= 0) break;

      // Vérifier compatibilité type camion
      if (camion.type_id !== chantier.typeCamion) continue;

      // Vérifier disponibilité horaire
      const libreA = camionsOccupes[camion.id] ?? 0;
      if (libreA > calc.heureDebutMin + 30) continue; // tolérance 30 min

      // Affecter le camion
      const planning = genererPlanningCamion(camion, chantier, calc);
      planningsFinal.push(planning);
      camionsOccupes[camion.id] = planning.libreAMin;
      camionsAffecter--;
    }

    // Si pas assez de camions Colas → locatiers
    if (camionsAffecter > 0) {
      locatiersNecessaires += camionsAffecter;
      for (let i = 0; i < camionsAffecter; i++) {
        planningsFinal.push({
          camionId: `locatier-${Date.now()}-${i}`,
          immatriculation: "À commander",
          type: chantier.typeCamion,
          proprietaire: "Locatier",
          chantier: chantier.nomChantier,
          centrale: chantier.centrale,
          rotations: genererPlanningCamion(
            { id: `loc-${i}`, immatriculation: "Locatier", type_vehicule: chantier.typeCamion, proprietaire: "Locatier" },
            chantier,
            calc
          ).rotations,
          libreA: null,
          libreAMin: null,
        });
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