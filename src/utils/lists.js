/** `key` = valeur stockée en base. */
export const LIST_STATUSES = [
  { key: "watching", label: "En cours" },
  { key: "planned", label: "À voir" },
  { key: "completed", label: "Terminé" },
  { key: "dropped", label: "Abandonné" },
];

export const LIST_STATUS_LABEL = Object.fromEntries(
  LIST_STATUSES.map((s) => [s.key, s.label])
);
