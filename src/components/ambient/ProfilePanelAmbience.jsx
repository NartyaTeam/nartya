import "./profile-panel-ambience.css";
import ProfileWeather, { isProfileWeather } from "./ProfileWeather";

/** Coins, séparateurs et bords de modules. */
export default function ProfilePanelAmbience({ id }) {
  if (!id) return null;
  if (isProfileWeather(id)) return <ProfileWeather id={id} panel />;
  const count = id === "storm" ? 2 : id === "rain" ? 15 : id === "snow" ? 13 : 9;
  return <div className={`profile-panel-ambience panel-${id}`} aria-hidden="true">{Array.from({ length: count }, (_, index) => <i key={index} />)}</div>;
}

