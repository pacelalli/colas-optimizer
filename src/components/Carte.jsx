// Imports
import { MapContainer, TileLayer, Marker, Popup, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import centrales from "../data/centrales.json";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// ─── ICÔNES PERSONNALISÉES ───────────────────────────────────────────────────
// Pin jaune pour les agences Colas
const iconAgence = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Pin gris/bleu pour les centrales
const iconCentrale = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// ─── AGENCES COLAS AM ────────────────────────────────────────────────────────
// Coordonnées approximatives — à ajuster si besoin
const agences = [
  { id: "carros",  nom: "Agence Carros",  lat: 43.7889, lng: 7.1856, adresse: "ZA de la Grave, 06510 Carros" },
  { id: "pegomas", nom: "Agence Pégomas", lat: 43.5953, lng: 6.9320, adresse: "Route de la Fénerie, 06580 Pégomas" },
];

function Carte() {
  return (
    <div style={{ height: "600px", borderRadius: "8px", overflow: "hidden" }}>
      <MapContainer
        center={[43.7102, 7.262]}
        zoom={9}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="© OpenStreetMap"
        />

        {/* ─── AGENCES (pins jaunes + label permanent) ─── */}
        {agences.map((agence) => (
          <Marker key={agence.id} position={[agence.lat, agence.lng]} icon={iconAgence}>
            <Tooltip permanent direction="top" offset={[0, -38]} className="label-agence">
              {agence.nom}
            </Tooltip>
            <Popup>
              <strong>{agence.nom}</strong>
              <br />
              {agence.adresse}
            </Popup>
          </Marker>
        ))}

        {/* ─── CENTRALES (pins gris + label permanent) ─── */}
        {centrales
          .filter((c) => c.lat && c.lng)
          .map((centrale) => (
            <Marker key={centrale.id} position={[centrale.lat, centrale.lng]} icon={iconCentrale}>
              <Tooltip permanent direction="top" offset={[0, -38]} className="label-centrale">
                {centrale.nom}
              </Tooltip>
              <Popup>
                <strong>{centrale.nom}</strong>
                <br />
                {centrale.localisation}
                <br />
                {centrale.propriete}
                <br />
                Fraisat : {centrale.fraisat === true ? "✓ Oui" : centrale.fraisat === false ? "✗ Non" : "Non renseigné"}
              </Popup>
            </Marker>
          ))}
      </MapContainer>
    </div>
  );
}

export default Carte;
