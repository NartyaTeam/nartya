import "./theme-ambience.css";

export default function ThemeAmbience({ token }) {
  if (token === "raijin") return <div className="theme-ambience theme-ambience-phantom" aria-hidden="true"><i /><i /><i /></div>;
  if (token === "kurotsuki") return <div className="theme-ambience theme-ambience-sakura" aria-hidden="true">{Array.from({ length: 10 }, (_, index) => <i key={index} />)}</div>;
  if (token === "transmutation") return <div className="theme-ambience theme-ambience-alchemy" aria-hidden="true"><i /><i /><i /><i /></div>;
  if (token === "grand_line") return <div className="theme-ambience theme-ambience-ocean" aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <i key={index} />)}</div>;
  return null;
}
