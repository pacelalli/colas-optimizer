// ─── RÉCAPITULATIF & PLANNING ────────────────────────────────────────────────
import { useState } from "react";
import { optimiser, calculerRotations, optimiserJournee } from "../utils/optimisation";
import { analyserCompatibilites, proposerComblement } from "../utils/scoreCompatibilite";
import { detailTempsTrajet } from "../utils/calculs/calculsCommuns";
import centrales from "../data/centrales.json";
import camions from "../data/type_camions.json";
import formules from "../data/formules_enrobes.json";

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

// ─── LIBELLÉS DU CYCLE SELON LE TYPE DE CHANTIER ─────────────────────────────
// Retourne les lignes de détail du cycle pour le journal de calcul
function detailCycle(typeChantier, typeCamion, tempsTrajet) {
  if (!typeCamion) return [];
  switch (typeChantier) {
    case "enrobes":
      return [
        `Chargement + bâchage : ${typeCamion.temps_chargement_enrobe + typeCamion.temps_bachage_enrobe} min`,
        `Trajet aller : ${tempsTrajet} min`,
        `Temps sur chantier : ${typeCamion.temps_sur_chantier_enrobe} min`,
        `Trajet retour : ${tempsTrajet} min`,
      ];
    case "beton":
    case "materiau":
      return [
        `Chargement : ${typeCamion.temps_chargement_apport} min`,
        `Trajet aller : ${tempsTrajet} min`,
        `Déchargement sur chantier : ${typeCamion.temps_sur_chantier_apport} min`,
        `Trajet retour : ${tempsTrajet} min`,
      ];
    case "fraisat":
      return [
        `Chargement fraisat (derrière raboteuse) : ${typeCamion.temps_sur_chantier_rabotage} min`,
        `Trajet vers centrale : ${tempsTrajet} min`,
        `Déchargement à la centrale : ${typeCamion.temps_dechargement_rabotage} min`,
        `Trajet retour chantier : ${tempsTrajet} min`,
      ];
    case "terrassement":
      return [
        `Chargement déblais (derrière pelleteuse) : ${typeCamion.temps_sur_chantier_deblais} min`,
        `Trajet vers centrale : ${tempsTrajet} min`,
        `Déchargement à la centrale : ${typeCamion.temps_dechargement_deblais} min`,
        `Trajet retour chantier : ${tempsTrajet} min`,
      ];
    default:
      return [
        `Trajet aller : ${tempsTrajet} min`,
        `Trajet retour : ${tempsTrajet} min`,
      ];
  }
}

// ─── COMPOSANT PRINCIPAL ─────────────────────────────────────────────────────
function RecapPlanning({ chantiers, onModifier, optimisationsAppliquees = [], onToggleOptimisation }) {
  const today = new Date();
  const [moisAffiche, setMoisAffiche] = useState(today.getMonth());
  const [anneeAffichee, setAnneeAffichee] = useState(today.getFullYear());
  const [dateSelectionnee, setDateSelectionnee] = useState(null);
  const [chantierOuvert, setChantierOuvert] = useState(null);
  const [resultatOptimisation, setResultatOptimisation] = useState(null);

  const chantierParDate = {};
  for (const c of chantiers) {
    if (!c.date) continue;
    if (!chantierParDate[c.date]) chantierParDate[c.date] = [];
    chantierParDate[c.date].push(c);
  }

  const chantiersJourSelectionne = dateSelectionnee ? (chantierParDate[dateSelectionnee] ?? []) : [];
  const chantiersJour = chantiersJourSelectionne.filter(c => !c.chantierNuit);
  const chantiersNuit = chantiersJourSelectionne.filter(c => c.chantierNuit);
  const compat = analyserCompatibilites(chantiersJourSelectionne);

  // Clé stable d'un renfort + compteurs basés sur les optimisations APPLIQUÉES
  const cleRenfort = (rf) => `${rf.chantierAId}->${rf.chantierBId}`;
  const renfortsDuJour = resultatOptimisation?.renforts ?? [];
  const economieAppliquee = renfortsDuJour.filter(rf => optimisationsAppliquees.includes(cleRenfort(rf))).length;
  const totalAvant = resultatOptimisation?.totalCamionsAvant ?? 0;
  const totalApres = totalAvant - economieAppliquee;

  const moisPrecedent = () => {
    if (moisAffiche === 0) { setMoisAffiche(11); setAnneeAffichee(a => a - 1); }
    else setMoisAffiche(m => m - 1);
    setDateSelectionnee(null); setChantierOuvert(null);
  };
  const moisSuivant = () => {
    if (moisAffiche === 11) { setMoisAffiche(0); setAnneeAffichee(a => a + 1); }
    else setMoisAffiche(m => m + 1);
    setDateSelectionnee(null); setChantierOuvert(null);
  };

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
        className={["cal-case", aDesChantiers ? "avec-chantiers" : "", estSelectionnee ? "selectionnee" : "", estAujourdhui ? "aujourd-hui" : ""].join(" ")}
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

  return (
    <div className="formulaire">
      <h2>PLANNING DES CHANTIERS</h2>

      <div className="cal-container">
        <div className="cal-nav">
          <button className="cal-nav-btn" onClick={moisPrecedent}>←</button>
          <span className="cal-titre">{MOIS[moisAffiche]} {anneeAffichee}</span>
          <button className="cal-nav-btn" onClick={moisSuivant}>→</button>
        </div>
        <div className="cal-grille">
          {JOURS.map(j => <div key={j} className="cal-entete">{j}</div>)}
          {cases}
        </div>
        {chantiers.length === 0 && (
          <p style={{ textAlign: "center", opacity: 0.5, fontSize: "0.85rem", marginTop: "1rem" }}>
            Aucun chantier saisi — commencez par la saisie des besoins
          </p>
        )}
      </div>

      {dateSelectionnee && chantiersJourSelectionne.length > 0 && (
        <div className="planning-jour">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
            <h3 className="planning-jour-titre">
              📅 {new Date(dateSelectionnee + "T12:00:00").toLocaleDateString("fr-FR", {
                weekday: "long", day: "numeric", month: "long", year: "numeric"
              })}
            </h3>
            {chantiersJourSelectionne.length >= 2 && (
              <button className="btn-optimiser" onClick={() => setResultatOptimisation(optimiserJournee(chantiersJourSelectionne))}>
                🔧 Optimiser cette journée
              </button>
            )}
          </div>

          <div className="planning-colonnes">
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
                    onModifier={onModifier}
                  />
                ))
              }
            </div>
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
                    onModifier={onModifier}
                  />
                ))
              }
            </div>
          </div>

          {resultatOptimisation && (
            <div className="optimisation-resultat">
              <div className="optimisation-header">
                <span>⚡ Optimisation réalisée</span>
                <span className="optimisation-economie">
                  {economieAppliquee > 0
                    ? `✅ ${economieAppliquee} camion(s) économisé(s)`
                    : "Aucune optimisation appliquée pour le moment"}
                </span>
              </div>
              <div className="optimisation-chiffres">
                <div>Avant : <strong>{totalAvant} camions</strong></div>
                <div>Après : <strong>{totalApres} camions</strong></div>
              </div>
              {compat.toutes.length > 0 && (
                <div className="optimisation-renforts">
                  <div className="optimisation-renforts-titre">Relations entre chantiers</div>
                  <div className="relations">
                    {compat.pertinentes.length === 0 && (
                      <p className="planning-vide">Aucune paire compatible (score ≥ 2) sur cette journée.</p>
                    )}
                    {compat.pertinentes.map((r, i) => {
                      const col = r.score === 4 ? "#2E7D32" : r.score === 3 ? "#C99700" : r.score === 2 ? "#EA7317" : "#9A9A9A";
                      const rf = resultatOptimisation.renforts.find(x =>
                        (x.chantierA === r.a.nomChantier && x.chantierB === r.b.nomChantier) ||
                        (x.chantierA === r.b.nomChantier && x.chantierB === r.a.nomChantier)
                      );
                      const cle = rf ? cleRenfort(rf) : null;
                      const estAppliquee = cle && optimisationsAppliquees.includes(cle);
                      const chantierBObj = rf ? chantiersJourSelectionne.find(c => c.id === rf.chantierBId) : null;
                      const comblement = (rf && !rf.retireCamionEntier && chantierBObj) ? proposerComblement(chantierBObj) : null;
                      return (
                        <div key={i} className={"rel-card" + (estAppliquee ? " appliquee" : "")} style={{ "--score-col": col }}>
                          <div className="rel-top">
                            <span className="rel-paire">{r.source.nomChantier} → {r.cible.nomChantier}</span>
                            <span className="rel-badge" style={{ background: col }}>{r.score}/4</span>
                          </div>
                          <div className="rel-reco" style={{ color: col }}>{r.recommandation}</div>
                          <div className="rel-criteres">
                            <span className={"crit " + (r.criteres.camion ? "ok" : "ko")}>{r.criteres.camion ? "✓" : "✗"} Type camion</span>
                            <span className={"crit " + (r.criteres.proximite ? "ok" : "ko")}>{r.criteres.proximite ? "✓" : "✗"} Proximité</span>
                            <span className={"crit " + (r.criteres.materiaux ? "ok" : "ko")}>{r.criteres.materiaux ? "✓" : "✗"} Matériaux</span>
                            <span className={"crit " + (r.criteres.centrale ? "ok" : "ko")}>{r.criteres.centrale ? "✓" : "✗"} Centrale</span>
                          </div>
                          {rf && (
                            <div className="rel-action">
                              🚛 1er camion de <strong>{rf.chantierA}</strong> libre à <strong>{rf.heureFinRotationsA}</strong> → repositionnement ({rf.tempsRepositionnement} min) → renforce <strong>{rf.chantierB}</strong> dès <strong>{rf.heureDispoB}</strong> (1 rotation, {rf.tonnageRenfort} t)
                              {rf.retireCamionEntier ? (
                                <div style={{ marginTop: "0.3rem", opacity: 0.85 }}>
                                  {rf.distanceKm} km · le renfort couvre le camion marginal → <strong>−1 camion</strong>
                                </div>
                              ) : comblement && comblement.option ? (
                                <div style={{ marginTop: "0.4rem" }}>
                                  Pour retirer un {comblement.typeRetire} de {rf.chantierB} : <strong>{comblement.tonnageMarginal} t</strong> à couvrir → renfort {comblement.renfort} t → reste <strong>{comblement.trou} t</strong>.
                                  <div style={{ marginTop: "0.25rem" }}>
                                    Comblement le moins cher : <strong>{comblement.option.nb} × {comblement.option.type}</strong> ({comblement.option.cout} €)
                                  </div>
                                  <div className="rel-bilan" style={{ color: comblement.bilanNet < 0 ? "#2E7D32" : "#CB2B3E" }}>
                                    Bilan : −1 {comblement.typeRetire} (−{comblement.prixRetire} €) + {comblement.option.nb} × {comblement.option.type} (+{comblement.option.cout} €) = <strong>{comblement.bilanNet > 0 ? "+" : ""}{comblement.bilanNet} €</strong> {comblement.bilanNet < 0 ? "✅ gain" : "→ non recommandé"}
                                  </div>
                                </div>
                              ) : comblement ? (
                                <div className="rel-bilan" style={{ marginTop: "0.4rem", color: "#2E7D32" }}>
                                  Le renfort couvre tout le camion marginal → <strong>−1 {comblement.typeRetire}</strong> ({comblement.bilanNet} €) ✅
                                </div>
                              ) : null}
                            </div>
                          )}
                          {rf && (
                            <button
                              className={"rel-appliquer" + (estAppliquee ? " active" : "")}
                              onClick={() => onToggleOptimisation && onToggleOptimisation(cle)}
                            >
                              {rf.retireCamionEntier
                                ? (estAppliquee ? "✓ Optimisation appliquée — annuler" : "Appliquer cette optimisation")
                                : (estAppliquee ? "✓ Proposition retenue — annuler" : (comblement && comblement.option ? `Proposer l'optimisation — commander ${comblement.option.nb} × ${comblement.option.type}` : "Proposer l'optimisation"))}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {compat.faibles.length > 0 && (
                    <div className="rel-faibles">+ {compat.faibles.length} autre(s) paire(s) peu pertinente(s) (0-1/4)</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── CARTE CHANTIER ───────────────────────────────────────────────────────────
function CarteChantier({ chantier, estOuvert, onClic, onModifier }) {
  const calc = calculerRotations(chantier);
  const centrale = centrales.find(c => c.id === chantier.centrale);
  const typeCamion = camions.find(t => t.id === chantier.typeCamion);
  const dt = calc ? detailTempsTrajet(calc.centraleId, chantier.zoneId, chantier.chantierNuit, typeCamion, chantier.typeTrajet ?? "urbain") : null;
  const formule = formules.find(f => f.id === chantier.typeEnrobe);

  // Tonnage affiché : pour le béton on montre le tonnage converti, sinon le tonnage brut
  const tonnageAffiche = chantier.typeChantier === "beton"
    ? `${chantier.volumeM3 ?? chantier.tonnage}m³`
    : `${chantier.tonnage}t`;

  return (
    <div className={`planning-carte ${estOuvert ? "ouverte" : ""}`}>
      <div className="planning-carte-header" onClick={onClic}>
        <div>
          <div className="planning-carte-nom">{chantier.nomChantier}</div>
          <div className="planning-carte-meta">
            {chantier.conducteur} · {tonnageAffiche}
            {chantier.typeChantier === "enrobes" && formule && ` · ${formule.nom}`}
          </div>
        </div>
        <div className="planning-carte-right">
          {calc && <span className="planning-carte-camions">🚛 {calc.nbCamions}</span>}
          <span className="planning-carte-chevron">{estOuvert ? "▲" : "▼"}</span>
        </div>
      </div>

      {estOuvert && (
        <div className="planning-carte-detail">
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

          {/* Journal de calcul — pour TOUS les types de chantiers */}
          {calc && (
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
                <div className="journal-etape-ligne">Type de trajet : {chantier.typeTrajet ?? "urbain"}</div>
                {dt && (
                  <>
                    <div className="journal-etape-ligne">Trajet de base ({centrale?.nom || calc.centraleId} → {chantier.zoneId}) : {dt.tempsBase} min</div>
                    <div className="journal-etape-ligne">× coefficient {dt.isNuit ? "nuit" : "jour"} : ×{dt.coeffTrafic}</div>
                    <div className="journal-etape-ligne">× coefficient {dt.libelleTrajet} ({typeCamion?.label ?? chantier.typeCamion}) : ×{dt.coeffCamion}</div>
                  </>
                )}
                <div className="journal-etape-resultat">→ {dt ? `${dt.tempsBase} × ${dt.coeffTrafic} × ${dt.coeffCamion} = ` : ""}{calc.tempsTrajet} min par trajet</div>
              </div>

              {/* Étape 3 — Temps de cycle (libellés selon le type) */}
              <div className="journal-etape">
                <div className="journal-etape-titre">3. Temps de cycle</div>
                {detailCycle(chantier.typeChantier, typeCamion, calc.tempsTrajet).map((ligne, idx) => (
                  <div key={idx} className="journal-etape-ligne">{ligne}</div>
                ))}
                <div className="journal-etape-resultat">→ Cycle total : {calc.tempsCycle} min</div>
              </div>

              {/* Étape 4 — Temps disponible */}
              <div className="journal-etape">
                <div className="journal-etape-titre">4. Temps disponible</div>
                <div className="journal-etape-ligne">Pause totale : {calc.pauseTotale} min ({chantier.chantierNuit ? "nuit" : "jour"})</div>
                <div className="journal-etape-resultat">→ {calc.tempsDisponible} min effectifs</div>
              </div>

              {/* Étape 5 — Résultat */}
              <div className="journal-etape" style={{ borderBottom: "none" }}>
                <div className="journal-etape-titre">5. Résultat optimisation</div>
                <div className="journal-etape-ligne">Rotations nécessaires : ⌈{Math.round(calc.tonnage)} ÷ {calc.capacite}⌉ = {calc.rotationsTotales}</div>
                <div className="journal-etape-ligne">Rotations/camion : {calc.rotationsParCamion} ({calc.rotationsExactes} exactes)</div>
                <div className="journal-etape-ligne">Camions tonnage : {calc.nbCamionsTonnage}</div>
                <div className="journal-etape-resultat">→ {calc.nbCamions} camion(s)</div>
                <div style={{ fontSize: "0.82rem", color: "#2e7d32", marginTop: "0.4rem" }}>
                  ✅ {calc.tonnageRealisable}t réalisables (objectif {Math.round(calc.tonnage)}t)
                </div>
                {!calc.chantierRealisableEnJour && (
                  <div style={{ fontSize: "0.82rem", color: "#FF6B6B", marginTop: "0.4rem" }}>
                    ⚠️ Tonnage non atteignable en une journée avec {calc.nbCamions} camion(s) — {calc.nbJoursNecessaires} jour(s) nécessaires
                  </div>
                )}
                {calc.dernierCamionStatut && (
                  <div style={{ fontSize: "0.82rem", color: "#FFA500", marginTop: "0.3rem" }}>
                    ⚠️ Dernier chargement : {calc.dernierChargement}t — {calc.dernierCamionStatut}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bouton modifier */}
          {onModifier && (
            <button
              onClick={() => onModifier(chantier)}
              style={{
                marginTop: "0.75rem",
                background: "var(--colas-noir)",
                color: "var(--colas-jaune)",
                border: "none",
                borderRadius: "4px",
                padding: "0.4rem 1rem",
                cursor: "pointer",
                fontSize: "0.82rem",
                fontWeight: 600,
              }}
            >
              ✏️ Modifier ce chantier
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default RecapPlanning;
