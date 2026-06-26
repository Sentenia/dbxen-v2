// Tiny event bus for easter eggs — lets the global keyboard listener poke
// individual components (e.g. fire the background storm, flare the burn card).
export function fireEgg(name, detail) {
  window.dispatchEvent(new CustomEvent('egg:' + name, { detail }));
}
export function onEgg(name, fn) {
  const h = (e) => fn(e.detail);
  window.addEventListener('egg:' + name, h);
  return () => window.removeEventListener('egg:' + name, h);
}
