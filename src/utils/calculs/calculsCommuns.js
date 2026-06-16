// ─── CALCULS COMMUNS ─────────────────────────────────────────────────────────
// Fonctions utilitaires partagées entre tous les types de chantiers
// (enrobés, béton, terrassement, multi-flux...)
// Import des fichiers base de données (.JSON)
import distances from "../../data/distances.json";
import typesCamions from "../../data/type_camions.json";
import zonesAM from "../../data/zones_am.json";

// ─── HAVERSINE ───────────────────────────────────────────────────────────────

// Initialisation d'une fonction qui reçoit les coordonnées GPS de deux points (latitude et longitude)
export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371; {/* rayon de la terre (en km) - constante nécessaire pour calcul de distances réelles */}
  const dLat = ((lat2 - lat1) * Math.PI) / 180; {/* calcule la différence de latitude et longitude entre les deux points --> conversion de degrés en radians pour trigonométrie JavaScript */}
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  {/* formule mathématique de Haversine, calcul de distances en prenant compte de la courbure de la terre */}
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); {/* finalise le calcul et retourne la distance en km --> distance réelle à vol d'oiseau entre deux points */}
}

// ─── DÉTECTION AUTOMATIQUE DE ZONE ──────────────────────────────────────────

// Fonction exportée qui reçoit les coordonnées GPS du chantier
export function trouverZone(lat, lng) {
  if (!lat || !lng) return null; {/* si les coordonnées sont manquantes, alors pas la peine de chercher */}

  // initialisation de trois variables
  let meilleureCommune = null; {/* la commune la plus proche trouvée jusqu'ici */}
  let meilleureSecteur = null; {/* le secteur de cette commune */}
  let distanceMin = Infinity; {/* distance minimale, commence à l'infini pour que la première commune testée la batte forcément */}

  // boucle sur chaque secteur de zones_am.json
  for (const secteur of zonesAM.secteurs) {
    // pour chaque secteur, boucle sur les villes/communes
    for (const commune of secteur.communes) {
      // si pas de coordonnées GPS pour la commune, alors on la saute
      if (!commune.lat || !commune.lng) continue;
      const dist = haversine(lat, lng, commune.lat, commune.lng); {/* calcule, avec la fonction expliquée ci-dessus, la distance à vol d'oiseau entre le chantier et cette commune */}
      // si cette commune est plus proche du chantier que la meilleure trouvée jusqu'ici, alors
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

// ─── UTILITAIRES HORAIRES ────────────────────────────────────────────────────

// Convertit "07:30" → 450 (minutes depuis minuit)
export function heureEnMinutes(heure) {
  if (!heure) return null;
  const [h, m] = heure.split(":").map(Number);
  return h * 60 + m;
}

// Convertit 450 → "07h30" (avec gestion passage minuit)
export function minutesEnHeure(minutes) {
  const totalMin = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}`;
}

// ─── UTILITAIRES CAMIONS ─────────────────────────────────────────────────────

// Retourne l'objet camion complet depuis son id (depuis type_camions.json)
export function getTypeCamion(typeId) {
  return typesCamions.find((t) => t.id === typeId);
}

// ─── TEMPS DE TRAJET ─────────────────────────────────────────────────────────

// Déclaration de la fonction avec 4 entrées, chantier de jour par défaut et coefficient de vitesse camion à 1 par défaut
export function getTempsTrajet(centraleId, zoneId, isNuit = false, coeffCamion = 1.0) {
  const tempsBase = distances[centraleId]?.[zoneId]; {/* Récupère le temps de trajet de base dans distances.json */}
  if (tempsBase === null || tempsBase === undefined) return null; {/* Si pas de données → retourne null */}
  // ? valeur_si_vrai : valeur_si_faux
  const coeffTrafic = isNuit
    ? distances.meta.coeff_nuit
    : distances.meta.coeff_jour;
  return Math.round(tempsBase * coeffTrafic * coeffCamion); {/* Applique le coefficient de vitesse du type de camion */}
}