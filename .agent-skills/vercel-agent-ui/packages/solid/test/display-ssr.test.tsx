import { renderToString } from "@solidjs/web"
import { describe, expect, test } from "vitest"
import { Avatar, AvatarFallback, AvatarImage } from "../src/avatar"
import { Meter, MeterIndicator, MeterTrack, MeterValue } from "../src/meter"
import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
  ProgressValue,
} from "../src/progress"

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering avatars, progress bars and meters", () => {
  test("an avatar renders its fallback, and its image hidden so it starts loading", () => {
    const html = renderToString(() => (
      <Avatar>
        <AvatarImage src="/ada.png" alt="Ada" />
        <AvatarFallback>AL</AvatarFallback>
      </Avatar>
    ))
    expect(typeof window).toBe("undefined")
    expect(html).toMatch(
      /<img(?=[^>]*src="\/ada.png")(?=[^>]*aria-hidden="true")/
    )
    expect(html).toContain(">AL</span>")
  })

  test("a fallback with a delay isn't in the server markup", () => {
    expect(
      renderToString(() => (
        <Avatar>
          <AvatarFallback delay={500}>AL</AvatarFallback>
        </Avatar>
      ))
    ).not.toContain("AL")
  })

  test("a progress bar renders its value in English until the page's language is known", () => {
    const html = renderToString(() => (
      <Progress value={0.5} max={1} locale={undefined}>
        <ProgressValue />
        <ProgressTrack>
          <ProgressIndicator />
        </ProgressTrack>
      </Progress>
    ))
    expect(html).toMatch(/role="progressbar"[^>]*aria-valuenow="0.5"/)
    expect(html).toContain('aria-valuetext="50%"')
    expect(html).toContain(">50%</span>")
    // The indicator's width and the root's variable are inline, so the bar is right before hydration.
    expect(html).toContain("--progress-value:50%")
    expect(html).toMatch(
      /data-slot="progress-indicator"[^>]*style="[^"]*width:50%/
    )
  })

  test("a meter renders its value, width and variable before hydration", () => {
    const html = renderToString(() => (
      <Meter value={3} min={1} max={5}>
        <MeterValue />
        <MeterTrack>
          <MeterIndicator />
        </MeterTrack>
      </Meter>
    ))
    expect(html).toMatch(/role="meter"[^>]*aria-valuenow="3"/)
    expect(html).toContain('aria-valuetext="50%"')
    expect(html).toContain("--meter-value:50%")
    expect(html).toMatch(
      /data-slot="meter-indicator"[^>]*style="[^"]*width:50%/
    )
    expect(html).toContain(">50%</span>")
  })
})
