import "./profile-weather.css";

export const isProfileWeather = (id) => ["snow", "rain", "storm", "autumn"].includes(id);

// Graines stables : les particules restent en place quand le profil se met à jour. Un hash
// entier, car une suite linéaire corrélait position, durée et délai.
const seed = (index, salt) => {
  let h = (index * 2654435761 + salt * 40503) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 60013); h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
};

export default function ProfileWeather({ id, panel = false }) {
  const wet = id === "rain" || id === "storm";
  const autumn = id === "autumn";
  const count = panel ? (wet ? 44 : id === "snow" ? 38 : 32) : (wet ? 100 : id === "snow" ? 90 : 42);
  const slot = 112 / count;
  return (
    <div className={`profile-weather weather-${id}${panel ? " profile-weather--panel" : ""}`} aria-hidden="true">
      <div className="profile-weather__light" />
      <div className="profile-weather__mist" />
      {id === "storm" && <>
        <div className="profile-weather__flash" />
        <svg className="profile-weather__bolt profile-weather__bolt--a" viewBox="0 0 200 500" preserveAspectRatio="none"><path d="M125 0 80 112 113 106 51 246 86 229 22 410 M82 172 139 222 125 274" /></svg>
        <svg className="profile-weather__bolt profile-weather__bolt--b" viewBox="0 0 200 500" preserveAspectRatio="none"><path d="M60 0 95 90 68 100 120 230 90 220 145 380" /></svg>
      </>}
      {id === "snow" && (
        // Définie une fois, réutilisée par chaque particule.
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
          <defs>
            <g id="weather-snowflake-arm">
              <line x1="50" y1="50" x2="50" y2="6" />
              <line x1="50" y1="20" x2="36" y2="10" />
              <line x1="50" y1="20" x2="64" y2="10" />
              <line x1="50" y1="33" x2="40" y2="26" />
              <line x1="50" y1="33" x2="60" y2="26" />
            </g>
            <g id="weather-snowflake">
              <use href="#weather-snowflake-arm" />
              <use href="#weather-snowflake-arm" transform="rotate(60 50 50)" />
              <use href="#weather-snowflake-arm" transform="rotate(120 50 50)" />
              <use href="#weather-snowflake-arm" transform="rotate(180 50 50)" />
              <use href="#weather-snowflake-arm" transform="rotate(240 50 50)" />
              <use href="#weather-snowflake-arm" transform="rotate(300 50 50)" />
            </g>
          </defs>
        </svg>
      )}
      <div className="profile-weather__field">
        {Array.from({ length: count }, (_, index) => {
          const depth = Math.floor(seed(index, 9) * 3);
          const duration = wet ? 1.1 + seed(index, 2) * 1.2 : autumn ? 9 + seed(index, 2) * 8 : 12 + seed(index, 2) * 17 - depth * 2;
          const leafSign = seed(index, 6) > 0.5 ? 1 : -1;
          const drift = wet ? 44 + depth * 14 : autumn ? leafSign * (70 + seed(index, 5) * 90) : (seed(index, 5) - .5) * 110;
          const left = -6 + slot * index + (seed(index, 1) - .5) * slot * 1.6;
          const snow = id === "snow";
          return <span key={index} className={`profile-weather__lane depth-${depth}`} style={{
            left: `${left}%`,
            "--duration": `${duration}s`,
            "--delay": `${-seed(index, 3) * duration}s`,
            "--sway": `${3 + seed(index, 4) * 5}s`,
            "--drift": `${drift}px`,
            "--size": `${wet ? 1 : autumn ? 9 + depth * 5 : snow ? 7 + depth * 6 : 3 + depth * 3}px`,
            "--alpha": .24 + depth * .2,
            "--spin": `${leafSign * (280 + seed(index, 7) * 400)}deg`,
            "--tilt": `${(seed(index, 8) - .5) * 50}deg`,
            "--rot": `${seed(index, 10) * 360}deg`,
          }}>
            {snow ? (
              <svg viewBox="0 0 100 100" stroke="currentColor" strokeWidth="6" strokeLinecap="round" fill="none">
                <use href="#weather-snowflake" />
              </svg>
            ) : <b />}
          </span>;
        })}
      </div>
    </div>
  );
}
