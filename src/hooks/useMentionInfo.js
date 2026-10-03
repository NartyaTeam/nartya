import { useEffect, useState } from "react";

/** `undefined` pendant la résolution, `null` si l'épisode n'est pas résolvable. */
export function useMentionInfo(resolver, season, episode) {
  const [info, setInfo] = useState(undefined);

  useEffect(() => {
    let alive = true;
    setInfo(undefined);
    if (!resolver?.info) {
      setInfo(null);
      return;
    }
    resolver
      .info(season, episode)
      .then((r) => alive && setInfo(r || null))
      .catch(() => alive && setInfo(null));
    return () => {
      alive = false;
    };
  }, [resolver, season, episode]);

  return info;
}
