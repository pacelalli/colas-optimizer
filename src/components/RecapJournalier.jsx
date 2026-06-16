// ─── RÉCAPITULATIF & PLANNING ────────────────────────────────────────────────
// Affiche un calendrier cliquable, la liste des chantiers par jour (jour/nuit)
// et le détail complet d'un chantier avec journal de calcul
// Import des fonctions et données
import { useState } from "react";
import { optimiser, calculerRotations } from "../utils/optimisation";
import centrales from "../data/centrales.json";
import camions from "../data/type_camions.json";
import formules from "../data/formules_enrobes.json";

// ─── UTILITAIRES CALENDRIER ──────────────────────────────────────────────────

// Noms des jours et mois en français
const JOURS = ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"];
const MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

// Retourne le premier jour du mois (0=Lundi...6=Dimanche en format français)
function premierJourDuMois(annee, mois) {
  const jour = new Date(annee, mois, 1).getDay();
  return jour === 0 ? 6 : jour - 1; // Convertit dimanche=0 en lundi=0
}

// Retourne le nombre de jours dans un mois
function nbJoursDansMois(annee, mois) {
  return new Date(annee, mois + 1, 0).getDate();
}

// Formate une date en "YYYY-MM-DD" pour comparaison
function formatDate(annee, mois, jour) {
  return `${annee}-${String(mois + 1).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
}

// ─── COMPOSANT PRINCIPAL ─────────────────────────────────────────────────────

function RecapPlanning({ chantiers }) {
  // État du calendrier
  const today = new Date();
  const [moisAffiche, setMoisAffiche] = useState(today.getMonth());
  const [anneeAffichee, setAnneeAffichee] = useState(today.getFullYear());

  // État de la navigation
  const [dateSelectionnee, setDateSelectionnee] = useState(null);   // "YYYY-MM-DD"
  const [chantierOuvert, setChantierOuvert] = useState(null);       // id du chantier ouvert

  // ─── DONNÉES PAR DATE ──────────────────────────────────────────────────────
  // Construit un index : { "2026-06-16": [chantier1, chantier2], ... }
  const chantierParDate = {};
  for (const c of chantiers) {
    if (!c.date) continue;
    if (!chantierParDate[c.date]) chantierParDate[c.date] = [];
    chantierParDate[c.date].push(c);
  }

  // Chantiers du jour sélectionné
  const chantiersJourSelectionne = dateSelectionnee
    ? (chantierParDate[dateSelectionnee] ?? [])
    : [];

  // Séparation jour / nuit
  const chantiersJour = chantiersJourSelectionne.filter(c => !c.chantierNuit);
  const chantiersNuit = chantiersJourSelectionne.filter(c => c.chantierNuit);

  // Résultat optimisation global pour les KPI
  const resultatGlobal = chantiers.length > 0 ? optimiser(chantiers) : null;
  const totalTonnes = chantiers.reduce((acc, c) => acc + parseFloat(c.tonnage || 0), 0);

  // ─── NAVIGATION MOIS ───────────────────────────────────────────────────────
  const moisPrecedent = () => {
    if (moisAffiche === 0) { setMoisAffiche(11); setAnneeAffichee(a => a - 1); }
    else setMoisAffiche(m => m - 1);
    setDateSelectionnee(null);
    setChantierOuvert(null);
  };
  const moisSuivant = () => {
    if (moisAffiche === 11) { setMoisAffiche(0); setAnneeAffichee(a => a + 1); }
    else setMoisAffiche(m => m + 1);
    setDateSelectionnee(null);
    setChantierOuvert(null);
  };

  // ─── GÉNÉRATION DES CASES DU CALENDRIER ────────────────────────────────────
  const nbJours = nbJoursDansMois(anneeAffichee, moisAffiche);
  const decalage = premierJourDuMois(anneeAffichee, moisAffiche);
  const cases = [];

  // Cases vides avant le 1er du mois
  for (let i = 0; i < decalage; i++) {
    cases.push(<div key={`vide-${i}`} className="cal-case vide" />);
  }

  // Cases des jours du mois
  for (let j = 1; j <= nbJours; j++) {
    const dateStr = formatDate(anneeAffichee, moisAffiche, j);
    const nbChantiers = chantierParDate[dateStr]?.length ?? 0;
    const estSelectionnee = dateStr === dateSelectionnee;
    const aDesChantiers = nbChantiers > 0;
    const estAujourdhui = dateStr === formatDate(today.getFullYear(), today.getMonth(), today.getDate());

    cases.push(
      <div
        key={dateStr}
        className={[
          "cal-case",
          aDesChantiers ? "avec-chantiers" : "",
          estSelectionnee ? "selectionnee" : "",
          estAujourdhui ? "aujourd-hui" : "",
        ].join(" ")}
        onClick={() => {
          if (aDesChantiers) {
            setDateSelectionnee(estSelectionnee ? null : dateStr);
            setChantierOuvert(null);
          }
        }}
      >
        <span className="cal-num">{j}</span>
        {aDesChantiers && (
          <span className="cal-badge">{nbChantiers} chantier{nbChantiers > 1 ? "s" : ""}</span>
        )}
      </div>
    );
  }

  // ─── RENDU ─────────────────────────────────────────────────────────────────
  return (
    <div className="formulaire">
      <h2>PLANNING DES CHANTIERS</h2>

      {/* Calendrier */}
      <div className="cal-container">

        {/* Navigation mois */}
        <div className="cal-nav">
          <button className="cal-nav-btn" onClick={moisPrecedent}>←</button>
          <span className="cal-titre">{MOIS[moisAffiche]} {anneeAffichee}</span>
          <button className="cal-nav-btn" onClick={moisSuivant}>→</button>
        </div>

        {/* En-têtes jours */}
        <div className="cal-grille">
          {JOURS.map(j => (
            <div key={j} className="cal-entete">{j}</div>
          ))}
          {cases}
        </div>

        {chantiers.length === 0 && (
          <p style={{ textAlign: "center", opacity: 0.5, fontSize: "0.85rem", marginTop: "1rem" }}>
            Aucun chantier saisi — commencez par la saisie des besoins
          </p>
        )}
      </div>

      {/* Liste des chantiers du jour sélectionné */}
      {dateSelectionnee && chantiersJourSelectionne.length > 0 && (
        <div className="planning-jour">
          <h3 className="planning-jour-titre">
            📅 {new Date(dateSelectionnee + "T12:00:00").toLocaleDateString("fr-FR", {
              weekday: "long", day: "numeric", month: "long", year: "numeric"
            })}
          </h3>

          <div className="planning-colonnes">
            {/* Colonne JOUR */}
            <div className="planning-colonne">
              <div className="planning-colonne-titre">☀️ Chantiers de jour</div>
              {chantiersJour.length === 0
                ? <p className="planning-vide">Aucun chantier de jour</p>
                : chantiersJour.map(c => (
                  <CarteChantier
                    key={c.id}
                    chantier={c}
                    estOuvert={chantierOuvert === c.id}
                    onClic={() => setChantierOuvert(chantierOuvert === c.id ? null : c.id)}
                  />
                ))
              }
            </div>

            {/* Colonne NUIT */}
            <div className="planning-colonne">
              <div className="planning-colonne-titre">🌙 Chantiers de nuit</div>
              {chantiersNuit.length === 0
                ? <p className="planning-vide">Aucun chantier de nuit</p>
                : chantiersNuit.map(c => (
                  <CarteChantier
                    key={c.id}
                    chantier={c}
                    estOuvert={chantierOuvert === c.id}
                    onClic={() => setChantierOuvert(chantierOuvert === c.id ? null : c.id)}
                  />
                ))
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CARTE CHANTIER (cliquable) ───────────────────────────────────────────────

function CarteChantier({ chantier, estOuvert, onClic }) {
  const calc = calculerRotations(chantier);
  const centrale = centrales.find(c => c.id === chantier.centrale);
  const typeCamion = camions.find(t => t.id === chantier.typeCamion);
  const formule = formules.find(f => f.id === chantier.typeEnrobe);

  return (
    <div className={`planning-carte ${estOuvert ? "ouverte" : ""}`}>

      {/* En-tête cliquable */}
      <div className="planning-carte-header" onClick={onClic}>
        <div>
          <div className="planning-carte-nom">{chantier.nomChantier}</div>
          <div className="planning-carte-meta">
            {chantier.conducteur} · {chantier.tonnage}t
            {chantier.typeChantier === "enrobes" && formule && ` · ${formule.nom}`}
          </div>
        </div>
        <div className="planning-carte-right">
          {calc && <span className="planning-carte-camions">🚛 {calc.nbCamions}</span>}
          <span className="planning-carte-chevron">{estOuvert ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Détail dépliable */}
      {estOuvert && (
        <div className="planning-carte-detail">

          {/* Infos générales */}
          <div className="detail-section">
            <div className="detail-ligne">
              <span className="detail-label">Adresse</span>
              <span>{chantier.adresseChantier || "Non renseignée"}</span>
            </div>
            <div className="detail-ligne">
              <span className="detail-label">Horaires</span>
              <span>{chantier.heureDebut} → {chantier.heureFin}</span>
            </div>
            {centrale && (
              <div className="detail-ligne">
                <span className="detail-label">Centrale</span>
                <span>{centrale.nom} — {centrale.localisation}</span>
              </div>
            )}
            {typeCamion && (
              <div className="detail-ligne">
                <span className="detail-label">Camion</span>
                <span>{typeCamion.label}</span>
              </div>
            )}
            {chantier.prixTonneRetenu && (
              <div className="detail-ligne">
                <span className="detail-label">Prix retenu</span>
                <span>{chantier.prixTonneRetenu}€/t — Total : {chantier.coutTotalRetenu?.toLocaleString("fr-FR")}€</span>
              </div>
            )}
          </div>

          {/* Journal de calcul (enrobés uniquement) */}
          {calc && chantier.typeChantier === "enrobes" && (
            <div className="journal-calcul" style={{ marginTop: "1rem" }}>
              <div className="journal-calcul-titre">🧮 Journal de calcul</div>

              {/* Étape 1 — Localisation */}
              <div className="journal-etape">
                <div className="journal-etape-titre">1. Localisation</div>
                <div className="journal-etape-ligne">Zone détectée : {chantier.zoneId || "Non renseignée"}</div>
                <div className="journal-etape-ligne">Centrale : {centrale?.nom || calc.centraleId}</div>
                <div className="journal-etape-ligne">{chantier.chantierNuit ? "🌙 Coefficient nuit appliqué" : "☀️ Coefficient jour appliqué"}</div>
              </div>

              {/* Étape 2 — Temps de trajet */}
              <div className="journal-etape">
                <div className="journal-etape-titre">2. Temps de trajet</div>
                <div className="journal-etape-ligne">Coefficient {chantier.typeCamion} : ×{typeCamion?.coeff_vitesse ?? "?"}</div>
                <div className="journal-etape-resultat">→ {calc.tempsTrajet} min par trajet</div>
              </div>

              {/* Étape 3 — Temps de cycle */}
              <div className="journal-etape">
                <div className="journal-etape-titre">3. Temps de cycle</div>
                <div className="journal-etape-ligne">Chargement + bâchage : {typeCamion ? typeCamion.temps_chargement_enrobe + typeCamion.temps_bachage_enrobe : "?"} min</div>
                <div className="journal-etape-ligne">Trajet aller : {calc.tempsTrajet} min</div>
                <div className="journal-etape-ligne">Temps sur chantier : {typeCamion?.temps_sur_chantier ?? "?"} min</div>
                <div className="journal-etape-ligne">Trajet retour : {calc.tempsTrajet} min</div>
                <div className="journal-etape-resultat">→ Cycle total : {calc.tempsCycle} min</div>
              </div>

              {/* Étape 4 — Temps disponible */}
              <div className="journal-etape">
                <div className="journal-etape-titre">4. Temps disponible</div>
                <div className="journal-etape-ligne">Durée brute : {calc.tempsDisponible + calc.pauseChauffeur + calc.pauseRepas} min</div>
                <div className="journal-etape-ligne">− Pause chauffeur : {calc.pauseChauffeur} min</div>
                {calc.pauseRepas > 0 && (
                  <div className="journal-etape-ligne">− Pause repas : {calc.pauseRepas} min</div>
                )}
                <div className="journal-etape-resultat">→ {calc.tempsDisponible} min effectifs</div>
              </div>

              {/* Étape 5 — Résultat */}
              <div className="journal-etape" style={{ borderBottom: "none" }}>
                <div className="journal-etape-titre">5. Résultat optimisation</div>
                <div className="journal-etape-ligne">Rotations nécessaires : ⌈{chantier.tonnage} ÷ {calc.capacite}⌉ = {Math.ceil(parseFloat(chantier.tonnage) / calc.capacite)}</div>
                <div className="journal-etape-ligne">Rotations/camion : {calc.rotationsParCamion} ({calc.rotationsExactes} exactes)</div>
                <div className="journal-etape-ligne">Camions tonnage : {calc.nbCamionsTonnage}</div>
                <div className="journal-etape-ligne">Camions flux continu : {calc.nbCamionsFluxContinu}</div>
                <div className="journal-etape-resultat">→ {calc.nbCamions} camion(s) × {calc.rotationsParCamion} rotations</div>
                <div style={{ fontSize: "0.82rem", color: "#90EE90", marginTop: "0.4rem" }}>
                  ✅ {calc.nbCamions * calc.rotationsParCamion * calc.capacite}t capacité (objectif {chantier.tonnage}t)
                </div>
                {calc.dernierCamionStatut && (
                  <div style={{ fontSize: "0.82rem", color: "#FFD700", marginTop: "0.3rem" }}>
                    ⚠️ Dernier chargement : {calc.dernierChargement}t — {calc.dernierCamionStatut}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default RecapPlanning;
