// @vitest-environment node
import { renderToString } from "react-dom/server"
import { describe, expect, test } from "vitest"
import { Avatar, AvatarFallback, AvatarImage } from "../src/avatar"
import { OTPInput, OTPInputGroup, OTPInputSlot } from "../src/otp-input"
import {
  Meter,
  MeterIndicator,
  MeterLabel,
  MeterTrack,
  MeterValue,
} from "../src/meter"
import { Progress, ProgressValue } from "../src/progress"

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering avatars, progress bars, meters and codes", () => {
  test("an avatar renders its fallback, and its image hidden so it starts loading", () => {
    const html = renderToString(
      <Avatar>
        <AvatarImage src="/ada.png" alt="Ada" />
        <AvatarFallback>AL</AvatarFallback>
      </Avatar>
    )
    expect(typeof window).toBe("undefined")
    expect(html).toMatch(/<img[^>]*src="\/ada.png"[^>]*aria-hidden="true"/)
    expect(html).toContain(">AL</span>")
  })

  test("a fallback with a delay isn't in the server markup", () => {
    expect(
      renderToString(
        <Avatar>
          <AvatarFallback delay={500}>AL</AvatarFallback>
        </Avatar>
      )
    ).not.toContain("AL")
  })

  test("a progress bar renders its value in English until the page's language is known", () => {
    const html = renderToString(
      <Progress value={0.5} max={1} locale={undefined}>
        <ProgressValue />
      </Progress>
    )
    expect(html).toMatch(/role="progressbar"[^>]*aria-valuenow="0.5"/)
    expect(html).toContain('aria-valuetext="50%"')
    expect(html).toContain(">50%</span>")
  })

  test("a meter renders its value, width and variable before hydration", () => {
    const html = renderToString(
      <Meter value={3} min={1} max={5}>
        <MeterLabel>Score</MeterLabel>
        <MeterValue />
        <MeterTrack>
          <MeterIndicator />
        </MeterTrack>
      </Meter>
    )
    expect(html).toMatch(
      /role="meter"[^>]*aria-valuemin="1"[^>]*aria-valuemax="5"[^>]*aria-valuenow="3"/
    )
    expect(html).toContain('aria-valuetext="50%"')
    expect(html).toContain("--meter-value:50%")
    expect(html).toMatch(
      /data-slot="meter-indicator"[^>]*style="[^"]*width:50%/
    )
    expect(html).toContain(">50%</span>")
  })

  test("a code renders one input with its value, and slots with characters", () => {
    const html = renderToString(
      <OTPInput aria-label="Code" defaultValue="12" maxLength={4} name="code">
        <OTPInputGroup>
          <OTPInputSlot index={0} />
          <OTPInputSlot index={1} />
          <OTPInputSlot index={2} />
        </OTPInputGroup>
      </OTPInput>
    )
    expect(html.match(/<input/g)).toHaveLength(1)
    expect(html).toMatch(/<input[^>]*value="12"/)
    expect(html).toMatch(
      /autoComplete="one-time-code"|autocomplete="one-time-code"/
    )
    expect(html).toMatch(/maxLength="4"|maxlength="4"/)
    expect(html).toContain(">1</div>")
  })
})
