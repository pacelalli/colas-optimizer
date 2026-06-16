// FICHIER QUI PERMET DE GERER L'ENSEMBLE DE LA PAGE HTML ( navigation entre les onglets, liste des chantiers sasis, décide quoi afficher et partage les données)

//Import des fichiers base de données (.JSON)
import { useState } from "react";
import "./App.css";
import Carte from "./components/Carte";
import FormulaireChantier from "./components/FormulaireChantier";
import RecapJournalier from "./components/RecapJournalier";
import PlanningCamions from "./components/PlanningCamions";

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
        {onglet === "planning" && <PlanningCamions chantiers={chantiers} />}
        {onglet === "carte" && <Carte chantiers={chantiers} />}
      </main>
    </div>
  );
}

export default App;