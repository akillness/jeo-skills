import * as React from "react"
import { describe, expect, test, vi } from "vitest"
import { mergeProps, mergeRefs, renderElement } from "../src/use-primitive"

describe("render elements", () => {
  test("a handler on the render element runs first, then the part's own", () => {
    const calls: string[] = []
    const element = renderElement(
      "button",
      { onClick: () => calls.push("part") },
      <button onClick={() => calls.push("element")} />
    ) as React.ReactElement<{ onClick: (event: unknown) => void }>
    element.props.onClick({ defaultPrevented: false })
    expect(calls).toEqual(["element", "part"])
  })

  test("preventDefault() in the render element's handler skips the part's", () => {
    const part = vi.fn()
    const element = renderElement(
      "button",
      { onClick: part },
      <button onClick={(event) => event.preventDefault()} />
    ) as React.ReactElement<{ onClick: (event: unknown) => void }>
    let prevented = false
    element.props.onClick({
      preventDefault: () => (prevented = true),
      isDefaultPrevented: () => prevented,
    })
    expect(part).not.toHaveBeenCalled()
  })

  test("an undefined className on the render element adds nothing", () => {
    const element = renderElement(
      "button",
      { className: "part" },
      <button className={undefined} />
    ) as React.ReactElement<{
      className: string
    }>
    expect(element.props.className).toBe("part")
  })

  test("each ref is called once", () => {
    const part = vi.fn()
    const own = vi.fn()
    const element = renderElement(
      "button",
      { ref: part },
      <button ref={own} />
    ) as React.ReactElement<{
      ref: (el: unknown) => void
    }>
    element.props.ref("node")
    expect(part).toHaveBeenCalledTimes(1)
    expect(own).toHaveBeenCalledTimes(1)
  })

  test("mergeProps keeps a __proto__ key from parsed JSON off Object.prototype", () => {
    const parsed = JSON.parse('{"__proto__":{"polluted":true},"id":"a"}')
    expect(mergeProps({ className: "a" }, parsed)).toMatchObject({ id: "a" })
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
  })

  test("mergeProps combines class names and styles, and later props win otherwise", () => {
    expect(
      mergeProps(
        { className: "a", style: { color: "red" }, id: "x" },
        { className: "b", style: { top: 0 }, id: "y" }
      )
    ).toEqual({
      className: "a b",
      style: { color: "red", top: 0 },
      id: "y",
    })
  })
})

describe("merged refs", () => {
  test("runs the cleanup a callback ref returns, and clears the others", () => {
    const calls: string[] = []
    const object = { current: null as string | null }
    const plain = (el: string | null) => calls.push(`plain ${el}`)
    const withCleanup = (el: string | null) => {
      calls.push(`attach ${el}`)
      return () => calls.push("cleanup")
    }
    const inner = mergeRefs(object, plain) as React.RefCallback<string>
    const merged = mergeRefs(inner, withCleanup) as (
      el: string | null
    ) => (() => void) | void
    const cleanup = merged("node")
    expect(object.current).toBe("node")
    expect(typeof cleanup).toBe("function")
    ;(cleanup as () => void)()
    expect(calls).toEqual([
      "plain node",
      "attach node",
      "plain null",
      "cleanup",
    ])
    expect(object.current).toBeNull()
  })
})
