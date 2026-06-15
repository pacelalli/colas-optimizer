// Imports
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import centrales from "../data/centrales.json";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

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
        {centrales
          .filter((c) => c.lat && c.lng)
          .map((centrale) => (
            <Marker key={centrale.id} position={[centrale.lat, centrale.lng]}>
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