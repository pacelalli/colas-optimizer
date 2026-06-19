// FICHIER QUI PERMET DE GERER L'ENSEMBLE DE LA PAGE HTML ( navigation entre les onglets, liste des chantiers sasis, décide quoi afficher et partage les données)

//Import des fichiers base de données (.JSON)
import { useState } from "react";
import "./App.css";
import Carte from "./components/Carte";
import FormulaireChantier from "./components/FormulaireChantier";
import RecapJournalier from "./components/RecapJournalier";
import PlanningCamions from "./components/PlanningCamions";
import chantiersTest from "./data/chantiers_test.json";

function App() {
  const [onglet, setOnglet] = useState("accueil");
  const [chantiers, setChantiers] = useState([]);
  const [afficherScenarios, setAfficherScenarios] = useState(false);
  const [chantierAModifier, setChantierAModifier] = useState(null);

  const ajouterChantier = (chantier) => {
    setChantiers((prev) => [...prev, chantier]);
  };

  const modifierChantier = (chantierModifie) => {
    setChantiers(prev => prev.map(c => c.id === chantierModifie.id ? chantierModifie : c));
    setChantierAModifier(null);
    setOnglet("recap");
  };

 const chargerScenario = (scenario) => {
  setChantiers(prev => [...prev, ...scenario.chantiers]);
  setAfficherScenarios(false);
  setOnglet("recap");
};

  return (
    <div className="app">
      <header className="header">
        <div className="header-logo">COLAS</div>
        <div className="header-text">
          <h1>Optimiseur de transport</h1>
          <p>Agence des Alpes-Maritimes -  Carros & Pégomas </p>
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
          Planning chantiers {chantiers.length > 0 && `(${chantiers.length})`}
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
        <button
          className={afficherScenarios ? "actif" : ""}
          onClick={() => setAfficherScenarios(!afficherScenarios)}
        >
          🧪 Tests
        </button>
      </nav>

      {/* Menu scénarios de test */}
      {afficherScenarios && (
        <div style={{
          background: "var(--colas-noir)",
          padding: "1rem",
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
          justifyContent: "center"
        }}>
          {chantiersTest.map(scenario => (
            <button
              key={scenario.id}
              onClick={() => chargerScenario(scenario)}
              style={{
                background: "var(--colas-jaune)",
                color: "var(--colas-noir)",
                border: "none",
                borderRadius: "6px",
                padding: "0.5rem 1rem",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "0.85rem"
              }}
            >
              {scenario.nom}
            </button>
          ))}
          <button
            onClick={() => { setChantiers([]); setAfficherScenarios(false); }}
            style={{
              background: "#E30613",
              color: "white",
              border: "none",
              borderRadius: "6px",
              padding: "0.5rem 1rem",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.85rem"
            }}
          >
            🗑️ Vider
          </button>
        </div>
      )}

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
          <FormulaireChantier
            onAjoutChantier={ajouterChantier}
            chantierAModifier={chantierAModifier}
            onModifierChantier={modifierChantier}
          />
        )}
        {onglet === "recap" && (
          <RecapJournalier
            chantiers={chantiers}
            onModifier={(chantier) => {
              setChantierAModifier(chantier);
              setOnglet("saisie");
            }}
          />
        )}
        {onglet === "planning" && <PlanningCamions chantiers={chantiers} />}
        {onglet === "carte" && <Carte chantiers={chantiers} />}
      </main>
    </div>
  );
}

export default App;
