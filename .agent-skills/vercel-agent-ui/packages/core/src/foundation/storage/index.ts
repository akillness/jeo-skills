// What the rest of core may import from storage's files. import-layers checks every
// import from another folder against this list. Nothing imports this file, so bundles
// don't pay for it.
export {
  literal,
  readSaved,
  createCookieStorage,
  createLocalStorage,
  createSessionStorage,
  type CookieStorageOptions,
  type StorageScriptOptions,
  type ValueStorage,
} from "./storage"
