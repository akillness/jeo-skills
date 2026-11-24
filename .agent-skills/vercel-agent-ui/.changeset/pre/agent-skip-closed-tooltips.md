---
"@ui-sdk/core": patch
"@ui-sdk/web": patch
---

The agent snapshot leaves out a closed Tooltip whose trigger is a listed component, since its text is already that component's label. In web components, a dialog or menu trigger around a `<ui-button>` binds the button inside it, so a press by its label reaches it.
