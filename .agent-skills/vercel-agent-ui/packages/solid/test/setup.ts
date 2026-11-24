// jsdom has no Web Animations API. Core asks elements for their animations
// when a popup closes, so an element answers with none.
Element.prototype.getAnimations ??= () => []
