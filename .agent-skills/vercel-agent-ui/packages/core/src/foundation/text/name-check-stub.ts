// What production builds get for `#name-check`: the same exports, doing
// nothing. See `name-check.ts`.

function nameFrom(_el: Element, _names: () => boolean) {
  return () => {}
}

function checkName(
  _el: HTMLElement,
  _part: string,
  _from: { component: string; id?: string }
) {}

export { checkName, nameFrom }
