// ─── PLANNING CAMIONS ─────────────────────────────────────────────────────────
// Affiche le planning détaillé par camion pour une journée sélectionnée
// Réorganise les données de optimiser() par camion via extrairePlanningParCamion()

import { useState } from "react";
import { optimiser, extrairePlanningParCamion } from "../utils/optimisation";
import centrales from "../data/centrales.json";
import camions from "../data/type_camions.json";
import React from "react";

// ─── UTILITAIRES CALENDRIER (identiques à RecapJournalier) ───────────────────
const JOURS = ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"];
const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
              "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

function premierJourDuMois(annee, mois) {
  const jour = new Date(annee, mois, 1).getDay();
  return jour === 0 ? 6 : jour - 1;
}

function nbJoursDansMois(annee, mois) {
  return new Date(annee, mois + 1, 0).getDate();
}

function formatDate(annee, mois, jour) {
  return `${annee}-${String(mois + 1).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
}

// ─── UTILITAIRE HEURE ────────────────────────────────────────────────────────
// Retourne l'heure de référence d'une mission (compatible enrobés et rabotage)
function heureRef(m) {
  return m.depart_centrale ?? m.debut_chargement ?? "00h00";
}

// ─── COMPOSANT PRINCIPAL ─────────────────────────────────────────────────────
function PlanningCamions({ chantiers }) {
  const today = new Date();
  const [moisAffiche, setMoisAffiche] = useState(today.getMonth());
  const [anneeAffichee, setAnneeAffichee] = useState(today.getFullYear());
  const [dateSelectionnee, setDateSelectionnee] = useState(null);
  const [camionOuvert, setCamionOuvert] = useState(null);

  // Index chantiers par date
  const chantierParDate = {};
  for (const c of chantiers) {
    if (!c.date) continue;
    if (!chantierParDate[c.date]) chantierParDate[c.date] = [];
    chantierParDate[c.date].push(c);
  }

  // Chantiers + planning camions pour la date sélectionnée
  const chantiersJour = dateSelectionnee ? (chantierParDate[dateSelectionnee] ?? []) : [];
  const resultat = chantiersJour.length > 0 ? optimiser(chantiersJour) : null;
  const planningParCamion = resultat ? extrairePlanningParCamion(resultat.plannings) : [];

  // Séparation Colas / Locatiers
  const camionsColas = planningParCamion.filter(c => c.proprietaire === "Colas");
  const camionsLocatiers = planningParCamion.filter(c => c.proprietaire === "Locatier");

  // Navigation mois
  const moisPrecedent = () => {
    if (moisAffiche === 0) { setMoisAffiche(11); setAnneeAffichee(a => a - 1); }
    else setMoisAffiche(m => m - 1);
    setDateSelectionnee(null);
  };
  const moisSuivant = () => {
    if (moisAffiche === 11) { setMoisAffiche(0); setAnneeAffichee(a => a + 1); }
    else setMoisAffiche(m => m + 1);
    setDateSelectionnee(null);
  };

  // Génération calendrier
  const nbJours = nbJoursDansMois(anneeAffichee, moisAffiche);
  const decalage = premierJourDuMois(anneeAffichee, moisAffiche);
  const cases = [];

  for (let i = 0; i < decalage; i++) {
    cases.push(<div key={`vide-${i}`} className="cal-case vide" />);
  }

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
            setCamionOuvert(null);
          }
        }}
      >
        <span className="cal-num">{j}</span>
        {aDesChantiers && (
          <span className="cal-badge">
            {(() => {
              const r = optimiser(chantierParDate[dateStr] ?? []);
              return `${r.totalCamions} camion${r.totalCamions > 1 ? "s" : ""}`;
            })()}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="formulaire">
      <h2>PLANNING CAMIONS</h2>

      {/* Calendrier */}
      <div className="cal-container">
        <div className="cal-nav">
          <button className="cal-nav-btn" onClick={moisPrecedent}>←</button>
          <span className="cal-titre">{MOIS[moisAffiche]} {anneeAffichee}</span>
          <button className="cal-nav-btn" onClick={moisSuivant}>→</button>
        </div>
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

      {/* Planning camions du jour sélectionné */}
      {dateSelectionnee && planningParCamion.length > 0 && (
        <div className="planning-jour">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
            <h3 className="planning-jour-titre">
              📅 {new Date(dateSelectionnee + "T12:00:00").toLocaleDateString("fr-FR", {
                weekday: "long", day: "numeric", month: "long", year: "numeric"
              })}
            </h3>
            <div style={{ fontSize: "0.85rem", color: "var(--colas-gris)" }}>
              {camionsColas.length} Colas · {camionsLocatiers.length} locatier{camionsLocatiers.length > 1 ? "s" : ""}
            </div>
          </div>

          {/* Deux colonnes jour / nuit */}
          <div className="planning-colonnes">

            {/* Colonne JOUR */}
            <div className="planning-colonne">
              <div className="planning-colonne-titre">☀️ Camions de jour</div>
              {planningParCamion.filter(c => c.missions.some(m => {
                const h = parseInt(heureRef(m).split("h")[0]);
                return h >= 6 && h < 20;
              })).length === 0
                ? <p className="planning-vide">Aucun camion de jour</p>
                : planningParCamion
                    .filter(c => c.missions.some(m => {
                      const h = parseInt(heureRef(m).split("h")[0]);
                      return h >= 6 && h < 20;
                    }))
                    .map(c => (
                      <CarteCamion
                        key={c.camionId}
                        camion={c}
                        estOuvert={camionOuvert === c.camionId}
                        onClic={() => setCamionOuvert(camionOuvert === c.camionId ? null : c.camionId)}
                      />
                    ))
              }
            </div>

            {/* Colonne NUIT */}
            <div className="planning-colonne">
              <div className="planning-colonne-titre">🌙 Camions de nuit</div>
              {planningParCamion.filter(c => c.missions.some(m => {
                const h = parseInt(heureRef(m).split("h")[0]);
                return h >= 20 || h < 6;
              })).length === 0
                ? <p className="planning-vide">Aucun camion de nuit</p>
                : planningParCamion
                    .filter(c => c.missions.some(m => {
                      const h = parseInt(heureRef(m).split("h")[0]);
                      return h >= 20 || h < 6;
                    }))
                    .map(c => (
                      <CarteCamion
                        key={c.camionId}
                        camion={c}
                        estOuvert={camionOuvert === c.camionId}
                        onClic={() => setCamionOuvert(camionOuvert === c.camionId ? null : c.camionId)}
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

// ─── CARTE CAMION ─────────────────────────────────────────────────────────────
function CarteCamion({ camion, estOuvert, onClic }) {
  const typeCamion = camions.find(t => t.id === camion.type);

  return (
    <div className={`planning-carte ${estOuvert ? "ouverte" : ""}`}
         style={{ borderLeftColor: camion.proprietaire === "Colas" ? "var(--colas-jaune)" : "#E30613" }}>

      {/* En-tête cliquable */}
      <div className="planning-carte-header" onClick={onClic}>
        <div>
          <div className="planning-carte-nom">
            {camion.proprietaire === "Colas" ? "🟡" : "🔴"} {camion.immatriculation}
          </div>
          <div className="planning-carte-meta">
            {typeCamion?.label ?? camion.type} · {camion.missions.length} rotation{camion.missions.length > 1 ? "s" : ""}
          </div>
        </div>
        <div className="planning-carte-right">
          <span className="planning-carte-camions">✅ Libre à {camion.libreA}</span>
          <span className="planning-carte-chevron">{estOuvert ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Détail dépliable */}
      {estOuvert && (
        <div className="planning-carte-detail">
          <div className="detail-section">
            {camion.missions.map((m, i) => {
              const centrale = centrales.find(c => c.id === m.centraleId);

              // Détection passage minuit
              const toMin = h => {
                if (!h) return 0;
                const [hh, mm] = h.replace("h", ":").split(":").map(Number);
                return hh * 60 + mm;
              };
              const passageMinuit = i > 0 && (() => {
                const prevMin = toMin(heureRef(camion.missions[i-1]));
                const currMin = toMin(heureRef(m));
                return prevMin > currMin && (prevMin - currMin) > 60;
              })();

              return (
                <React.Fragment key={i}>
                  {/* Séparateur passage minuit */}
                  {passageMinuit && (
                    <div style={{
                      fontSize: "0.75rem",
                      color: "var(--colas-jaune)",
                      fontWeight: 600,
                      padding: "4px 0",
                      textAlign: "center",
                      borderTop: "1px dashed var(--colas-jaune)"
                    }}>
                      ── passage minuit ──
                    </div>
                  )}

                  {/* Rotation */}
                  <div style={{
                    padding: "0.6rem 0",
                    borderBottom: "1px solid #f0f0f0",
                    fontSize: "0.82rem"
                  }}>

                    {/* Numéro rotation + chantier */}
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <strong>Rotation {m.rotation}</strong>
                      <span style={{ color: "var(--colas-gris)" }}>📍 {m.chantier}</span>
                    </div>

                    {/* Centrale */}
                    <div style={{ color: "var(--colas-gris)", marginBottom: "4px" }}>
                      🏭 {centrale?.nom ?? m.centraleId}
                    </div>

                    {/* Timeline — adaptée selon type (enrobés ou rabotage) */}
                    {m.depart_centrale ? (
                      // Timeline enrobés : centrale → chantier → centrale
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        <span className="time-chip">{m.depart_centrale}</span>
                        <span style={{ opacity: 0.4 }}>→</span>
                        <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>chargement</span>
                        <span style={{ opacity: 0.4 }}>→</span>
                        <span className="time-chip">{m.arrivee_chantier}</span>
                        <span style={{ opacity: 0.4 }}>→</span>
                        <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>chantier</span>
                        <span style={{ opacity: 0.4 }}>→</span>
                        <span className="time-chip">{m.retour_centrale}</span>
                      </div>
                    ) : (
                      // Timeline rabotage : chantier → centrale → chantier
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        <span className="time-chip">{m.debut_chargement}</span>
                        <span style={{ opacity: 0.4 }}>→</span>
                        <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>chargement fraisat</span>
                        <span style={{ opacity: 0.4 }}>→</span>
                        <span className="time-chip">{m.arrivee_centrale}</span>
                        <span style={{ opacity: 0.4 }}>→</span>
                        <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>centrale</span>
                        <span style={{ opacity: 0.4 }}>→</span>
                        <span className="time-chip">{m.retour_chantier}</span>
                      </div>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default PlanningCamions;
