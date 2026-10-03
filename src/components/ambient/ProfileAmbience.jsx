import "./profile-ambience.css";
import ProfileWeather, { isProfileWeather } from "./ProfileWeather";

export default function ProfileAmbience({ id }) {
  if (!id) return null;
  if (isProfileWeather(id)) return <ProfileWeather id={id} />;
  const count = id === "storm" ? 5 : id === "rain" ? 34 : id === "snow" ? 28 : 18;
  return (
    <div className={`profile-ambience profile-ambience--${id}`} aria-hidden="true">
      <div className="profile-ambience__wash" />
      <div className="profile-ambience__particles">
        {Array.from({ length: count }, (_, index) => <i key={index} />)}
      </div>
      <div className="profile-ambience__vignette" />
    </div>
  );
}

