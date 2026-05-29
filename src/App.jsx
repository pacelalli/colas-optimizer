import { useState } from "react";
import "./App.css";
import Carte from "./components/Carte";
import FormulaireChantier from "./components/FormulaireChantier";
import { optimiser } from "./utils/optimisation";

function App() {
  const [onglet, setOnglet] = useState("accueil");
  const [chantiers, setChantiers] = useState([]);

  const ajouterChantier = (chantier) => {
    setChantiers((prev) => [...prev, chantier]);
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-logo">COLAS</div>
        <div className="header-text">
          <h1>Optimiseur de transport</h1>
          <p>Alpes-Maritimes · Agences Cannes & Carros</p>
        </div>
      </header>

      <nav className="nav">
        <button
          className={onglet === "saisie" ? "actif" : ""}
          onClick={() => setOnglet("saisie")}
        >
          Saisie des besoins
        </button>
        <button
          className={onglet === "recap" ? "actif" : ""}
          onClick={() => setOnglet("recap")}
        >
          Récap journalier {chantiers.length > 0 && `(${chantiers.length})`}
        </button>
        <button
          className={onglet === "planning" ? "actif" : ""}
          onClick={() => setOnglet("planning")}
        >
          Planning camions
        </button>
        <button
          className={onglet === "carte" ? "actif" : ""}
          onClick={() => setOnglet("carte")}
        >
          Carte
        </button>
      </nav>

      <main className="contenu">
        {onglet === "accueil" && (
          <div className="accueil">
            <h2>Bienvenue</h2>
            <p>
              Cet outil permet d'optimiser la flotte de camions à l'échelle
              de l'agence, en mutualisant les rotations entre chantiers.
            </p>
            <button onClick={() => setOnglet("saisie")}>
              Commencer la saisie →
            </button>
          </div>
        )}
        {onglet === "saisie" && (
          <FormulaireChantier onAjoutChantier={ajouterChantier} />
        )}
        {onglet === "recap" && (
          <RecapJournalier chantiers={chantiers} />
        )}
        {onglet === "planning" && <p>Planning Gantt — à venir</p>}
        {onglet === "carte" && <Carte chantiers={chantiers} />}
      </main>
    </div>
  );
}

function RecapJournalier({ chantiers }) {
  if (chantiers.length === 0) {
    return (
      <div className="accueil">
        <h2>Récapitulatif journalier</h2>
        <p>Aucun besoin saisi pour le moment.</p>
      </div>
    );
  }

  const resultat = optimiser(chantiers);
  const totalTonnes = chantiers.reduce((acc, c) => acc + parseFloat(c.tonnage), 0);

  return (
    <div className="formulaire">
      <h2>Récapitulatif & Optimisation</h2>

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
        <div className="recap-carte" style={{ borderTopColor: resultat.locatiers > 0 ? "#E30613" : "#1DB954" }}>
          <div className="recap-valeur">{resultat.locatiers}</div>
          <div className="recap-label">Locatiers à commander</div>
        </div>
      </div>

      <h3 style={{ marginBottom: "1rem", fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: "1px" }}>
        Planning des rotations
      </h3>

      {resultat.plannings.map((p, idx) => (
        <div key={idx} className="recap-chantier" style={{
          borderLeftColor: p.proprietaire === "Colas" ? "var(--colas-jaune)" : "#E30613"
        }}>
          <div className="recap-chantier-header">
            <strong>
              {p.proprietaire === "Locatier" ? "🔴 LOCATIER" : "🟡 " + p.immatriculation}
              {" — "}{p.type}
            </strong>
            <span>{p.chantier}</span>
          </div>
          <div className="recap-chantier-detail">
            <span>🏭 {p.centrale}</span>
            <span>🔄 {p.rotations.length} rotation(s)</span>
            {p.libreA && <span>✅ Libre à {p.libreA}</span>}
          </div>
          <div style={{ marginTop: "0.75rem" }}>
            {p.rotations.map((r) => (
              <div key={r.rotation} style={{
                fontSize: "0.82rem",
                color: "var(--colas-gris)",
                padding: "0.25rem 0",
                borderTop: "1px solid #f0f0f0"
              }}>
                Rotation {r.rotation} — Départ : <strong>{r.depart_centrale}</strong> → Chantier : <strong>{r.arrivee_chantier}</strong> → Retour : <strong>{r.retour_centrale}</strong>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default App;