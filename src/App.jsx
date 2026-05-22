import { useState } from "react";
import "./App.css";
import Carte from "./components/Carte";

function App() {
  const [onglet, setOnglet] = useState("accueil");

  return (
    <div className="app">
      <header className="header">
        <h1>Colas AM — Optimiseur de transport</h1>
        <p>Alpes-Maritimes · Agences Cannes & Carros</p>
      </header>

      <nav className="nav">
        <button
          className={onglet === "saisie" ? "actif" : ""}
          onClick={() => setOnglet("saisie")}
        >
          Saisie des besoins
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
        {onglet === "saisie" && <p>Formulaire de saisie — à venir</p>}
        {onglet === "planning" && <p>Planning Gantt — à venir</p>}
        {onglet === "carte" && <Carte />}
      </main>
    </div>
  );
}

export default App;