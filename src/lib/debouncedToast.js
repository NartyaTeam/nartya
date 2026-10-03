const timers = new Map();

/** `show` doit relire l'état final à son exécution. */
export function debouncedToast(key, show, delay = 600) {
  clearTimeout(timers.get(key));
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      show();
    }, delay)
  );
}
