// @vitest-environment jsdom
// In Vue 3.6, a Vapor component's setup has no `getCurrentInstance()` though
// `inject` works, like `app.runWithContext` here.
import { tabs } from "@ui-sdk/core/tabs"
import { createApp } from "vue"
import { expect, test } from "vitest"
import { usePart, usePrimitive } from "../src/primitive"

test("a root set up as a Vapor component points at vaporInteropPlugin", () => {
  expect(() =>
    createApp({}).runWithContext(() => usePrimitive(tabs, () => ({})))
  ).toThrow(
    "A ui-sdk root isn't set up in a VDOM component's setup. In a Vapor app, install vaporInteropPlugin"
  )
})

test("a part set up as a Vapor component points at vaporInteropPlugin", () => {
  expect(() =>
    createApp({}).runWithContext(() => usePart(tabs, "tab"))
  ).toThrow(
    "The tab part isn't set up in a VDOM component's setup. In a Vapor app, install vaporInteropPlugin, and define your own parts with defineComponent."
  )
})

test("a part outside any setup still says to call usePart in its setup", () => {
  expect(() => usePart(tabs, "tab")).toThrow(
    "The tab part must call usePart in its setup."
  )
})
