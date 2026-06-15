// Import des fichiers base de données (.JSON)
import { useState } from "react";
import { optimiser, calculerRotations } from "../utils/optimisation";
import centrales from "../data/centrales.json";

function RecapJournalier({ chantiers }) {
  const [chantierSelectionne, setChantierSelectionne] = useState(null);

  if (chantiers.length === 0) {
    return (
      <div className="formulaire">
        <h2>Récapitulatif journalier</h2>
        <p style={{ color: "var(--colas-gris)", marginTop: "1rem" }}>
          Aucun besoin saisi pour le moment.
        </p>
      </div>
    );
  }

  const resultat = optimiser(chantiers);
  const totalTonnes = chantiers.reduce((acc, c) => acc + parseFloat(c.tonnage), 0);
  const chantierDetail = chantierSelectionne
    ? chantiers.find((c) => c.id === chantierSelectionne)
    : null;
  const calc = chantierDetail ? calculerRotations(chantierDetail) : null;

  return (
    <div className="formulaire">
      <h2>Récapitulatif journalier</h2>

      {/* Totaux agence */}
      <div className="recap-totaux">
        <div className="recap-carte">
          <div className="recap-valeur">{chantiers.length}</div>
          <div className="recap-label">Chantiers</div>
        </div>
        <div className="recap-carte">
          <div className="recap-valeur">{totalTonnes}t</div>
          <div className="recap-label">Tonnage total</div>
        </div>
        <div className="recap-carte">
          <div className="recap-valeur">{resultat.camionsColas}</div>
          <div className="recap-label">Camions Colas</div>
        </div>
        <div className="recap-carte" style={{
          borderTopColor: resultat.locatiers > 0 ? "#E30613" : "#1DB954"
        }}>
          <div className="recap-valeur">{resultat.locatiers}</div>
          <div className="recap-label">Locatiers à commander</div>
        </div>
      </div>

      {/* Sélecteur de chantier */}
      <div className="form-section">
        <h3>Détail par chantier</h3>
        <div className="form-row">
          <label>Sélectionner un chantier</label>
          <select
            value={chantierSelectionne || ""}
            onChange={(e) => setChantierSelectionne(Number(e.target.value))}
          >
            <option value="">-- Choisir un chantier --</option>
            {chantiers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.date} — {c.nomChantier} — {c.conducteur}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Détail du chantier sélectionné */}
      {chantierDetail && calc && (
        <div className="form-section">

          {/* Infos générales */}
          <div className="recap-chantier" style={{ marginBottom: "1rem" }}>
            <div className="recap-chantier-header">
              <strong>{chantierDetail.nomChantier}</strong>
              <span>{chantierDetail.conducteur}</span>
            </div>
            <div className="recap-chantier-detail">
              <span>📅 {chantierDetail.date}</span>
              <span>{chantierDetail.chantierNuit ? "🌙 Nuit" : "☀️ Jour"}</span>
              <span>🏭 {centrales.find(c => c.id === calc.centraleId)?.nom || calc.centraleId}</span>
              <span>📦 {chantierDetail.tonnage}t de {chantierDetail.typeEnrobe || "?"}</span>
              <span>🚛 {chantierDetail.typeCamion}</span>
              <span>⏰ {chantierDetail.heureDebut} → {chantierDetail.heureFin}</span>
            </div>
          </div>

          {/* Journal de calcul */}
          <div style={{
            background: "var(--colas-noir)",
            borderRadius: "4px",
            padding: "1.25rem",
            color: "white"
          }}>
            <div style={{
              fontSize: "0.85rem",
              textTransform: "uppercase",
              letterSpacing: "1px",
              color: "var(--colas-jaune)",
              marginBottom: "1rem",
              paddingBottom: "0.5rem",
              borderBottom: "1px solid rgba(255,255,255,0.1)"
            }}>
              🧮 Journal de calcul
            </div>

            {/* Étape 1 */}
            <div className="journal-etape">
              <div className="journal-etape-titre">1. Localisation</div>
              <div className="journal-etape-ligne">Zone : {chantierDetail.zoneId || "Non renseignée"}</div>
              <div className="journal-etape-ligne">Centrale : {centrales.find(c => c.id === calc.centraleId)?.nom || calc.centraleId}</div>
              <div className="journal-etape-ligne">{chantierDetail.chantierNuit ? "🌙 Matrice nuit appliquée" : "☀️ Matrice jour appliquée"}</div>
            </div>

            {/* Étape 2 */}
            <div className="journal-etape">
              <div className="journal-etape-titre">2. Temps de trajet</div>
              <div className="journal-etape-ligne">Temps base VL : {Math.round(calc.tempsTrajet / (chantierDetail.typeCamion === "semi" ? 1.35 : chantierDetail.typeCamion === "8x4" ? 1.25 : 1.15))} min</div>
              <div className="journal-etape-ligne">Coefficient {chantierDetail.typeCamion} : ×{chantierDetail.typeCamion === "semi" ? 1.35 : chantierDetail.typeCamion === "8x4" ? 1.25 : 1.15}</div>
              <div className="journal-etape-resultat">→ {calc.tempsTrajet} min par trajet</div>
            </div>

            {/* Étape 3 */}
            <div className="journal-etape">
              <div className="journal-etape-titre">3. Temps de cycle complet</div>
              <div className="journal-etape-ligne">Chargement + bâchage : {calc.tempsCycle - calc.tempsTrajet * 2 - (chantierDetail.typeCamion === "semi" ? 60 : chantierDetail.typeCamion === "8x4" ? 45 : 35)} min</div>
              <div className="journal-etape-ligne">Trajet aller : {calc.tempsTrajet} min</div>
              <div className="journal-etape-ligne">Temps sur chantier : {chantierDetail.typeCamion === "semi" ? 60 : chantierDetail.typeCamion === "8x4" ? 45 : 35} min</div>
              <div className="journal-etape-ligne">Trajet retour : {calc.tempsTrajet} min</div>
              <div className="journal-etape-resultat">→ Cycle total : {calc.tempsCycle} min</div>
            </div>

            {/* Étape 4 */}
            <div className="journal-etape">
              <div className="journal-etape-titre">4. Temps disponible</div>
              <div className="journal-etape-ligne">Durée brute : {calc.tempsDisponible + calc.pauseChauffeur + calc.pauseRepas} min</div>
              <div className="journal-etape-ligne">− Pause chauffeur : {calc.pauseChauffeur} min</div>
              {calc.pauseRepas > 0 && (
                <div className="journal-etape-ligne">− Pause repas : {calc.pauseRepas} min</div>
              )}
              <div className="journal-etape-resultat">→ {calc.tempsDisponible} min effectifs</div>
            </div>

            {/* Étape 5 */}
            <div className="journal-etape" style={{ borderBottom: "none" }}>
              <div className="journal-etape-titre">5. Résultat optimisation</div>
              <div className="journal-etape-ligne">Rotations nécessaires : ⌈{chantierDetail.tonnage} ÷ {calc.capacite}⌉ = {Math.ceil(parseFloat(chantierDetail.tonnage) / calc.capacite)}</div>
              <div className="journal-etape-ligne">Rotations max/camion : ⌊{calc.tempsDisponible} ÷ {calc.tempsCycle}⌋ = {calc.rotationsParCamion}</div>
              <div className="journal-etape-ligne">Camions nécessaires : ⌈{Math.ceil(parseFloat(chantierDetail.tonnage) / calc.capacite)} ÷ {calc.rotationsParCamion}⌉ = {calc.nbCamions}</div>
              <div className="journal-etape-resultat" style={{ marginTop: "0.5rem" }}>
                → {calc.nbCamions} camion(s) × {calc.rotationsParCamion} rotations
              </div>
              <div style={{ fontSize: "0.85rem", color: "#90EE90", marginTop: "0.4rem" }}>
                ✅ {calc.nbCamions * calc.rotationsParCamion * calc.capacite}t livrées (objectif {chantierDetail.tonnage}t)
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

export default RecapJournalier;