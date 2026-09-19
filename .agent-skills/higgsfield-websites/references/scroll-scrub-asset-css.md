# Scroll scrub CSS asset

Read `references/scroll-scrub.md` first. Copy the fenced source into
`app/src/components/scroll-scrub/scroll-scrub.css` and replace composition
values through the design brief.

```css
.scroll-scrub {
  --ss-progress: 0;
  position: relative;
  isolation: isolate;
  color: var(--ss-ink);
  background: var(--ss-bg);
}

.scroll-scrub__stage {
  position: sticky;
  top: 0;
  z-index: 0;
  width: 100%;
  height: 100dvh;
  overflow: hidden;
  background: var(--ss-bg);
}

.scroll-scrub__media,
.scroll-scrub__layer,
.scroll-scrub__picture,
.scroll-scrub__poster,
.scroll-scrub__video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.scroll-scrub__media {
  z-index: 0;
}

.scroll-scrub__layer {
  margin: 0;
  overflow: hidden;
  opacity: 0;
  will-change: opacity;
}

.scroll-scrub__layer:first-child {
  opacity: 1;
}

.scroll-scrub__poster,
.scroll-scrub__video {
  display: block;
  object-fit: cover;
  object-position: var(--ss-object-position);
}

.scroll-scrub__poster {
  z-index: 0;
}

.scroll-scrub__video {
  z-index: 1;
}

.scroll-scrub__layer[data-video-painted="true"] .scroll-scrub__poster {
  visibility: hidden;
}

.scroll-scrub__progress {
  position: absolute;
  z-index: 5;
  top: 0;
  right: 0;
  left: 0;
  height: 2px;
  background: color-mix(in srgb, var(--ss-ink) 14%, transparent);
  pointer-events: none;
}

.scroll-scrub__progress span {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--ss-accent);
  transform: scaleX(var(--ss-progress));
  transform-origin: left center;
}

.scroll-scrub__route {
  position: absolute;
  z-index: 6;
  top: clamp(1rem, 3vw, 2rem);
  right: clamp(1rem, 4vw, 4rem);
  left: clamp(1rem, 4vw, 4rem);
  display: flex;
  justify-content: flex-end;
  gap: 0.25rem;
  pointer-events: auto;
}

.scroll-scrub__route-button {
  min-height: 2.75rem;
  padding: 0.65rem 0.9rem;
  border: 0;
  color: var(--ss-muted);
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.scroll-scrub__route-button:hover,
.scroll-scrub__route-button[aria-current="step"] {
  color: var(--ss-ink);
}

.scroll-scrub__route-button[aria-current="step"] {
  text-decoration: underline;
  text-decoration-color: var(--ss-accent);
  text-decoration-thickness: 0.15em;
  text-underline-offset: 0.3em;
}

.scroll-scrub__route-button:focus-visible {
  outline: 2px solid var(--ss-accent);
  outline-offset: 3px;
}

.scroll-scrub__story {
  position: relative;
  z-index: 3;
  margin-top: -100dvh;
  pointer-events: none;
}

.scroll-scrub__chapter,
.scroll-scrub__connector-band {
  position: relative;
}

.scroll-scrub__chapter-pin {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  min-height: 100dvh;
  padding: clamp(5rem, 9vw, 8rem) clamp(1.25rem, 6vw, 6rem);
  pointer-events: none;
}

.scroll-scrub__chapter[data-align="right"] .scroll-scrub__chapter-pin {
  justify-content: flex-end;
}

.scroll-scrub__copy {
  position: relative;
  width: min(40rem, 48vw);
  pointer-events: auto;
}

.scroll-scrub__copy::before {
  position: absolute;
  z-index: -1;
  inset: -3rem -5rem;
  content: "";
  background: radial-gradient(
    ellipse at center,
    color-mix(in srgb, var(--ss-bg) 88%, transparent) 0%,
    color-mix(in srgb, var(--ss-bg) 58%, transparent) 52%,
    transparent 76%
  );
  pointer-events: none;
}

.scroll-scrub__kicker {
  max-width: 30ch;
  margin: 0 0 1rem;
  color: var(--ss-accent);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.scroll-scrub__title {
  max-width: 13ch;
  margin: 0;
  color: var(--ss-ink);
  font: inherit;
  font-size: clamp(2.75rem, 6vw, 6.75rem);
  font-weight: 700;
  line-height: 0.94;
  letter-spacing: -0.045em;
  text-wrap: balance;
}

.scroll-scrub__body {
  max-width: 42ch;
  margin: 1.5rem 0 0;
  color: var(--ss-muted);
  font-size: clamp(1rem, 1.35vw, 1.2rem);
  line-height: 1.55;
}

.scroll-scrub__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin: 1.5rem 0 0;
  padding: 0;
  list-style: none;
}

.scroll-scrub__tags li {
  padding: 0.45rem 0.7rem;
  border: 1px solid color-mix(in srgb, var(--ss-ink) 20%, transparent);
  color: var(--ss-ink);
  font-size: 0.82rem;
}

.scroll-scrub__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 2rem;
}

@media (max-width: 860px) {
  .scroll-scrub__poster,
  .scroll-scrub__video {
    object-position: var(--ss-mobile-position);
  }

  .scroll-scrub__route {
    right: max(0.75rem, env(safe-area-inset-right));
    left: max(0.75rem, env(safe-area-inset-left));
    justify-content: flex-start;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: thin;
  }

  .scroll-scrub__route-button {
    flex: 0 0 auto;
  }

  .scroll-scrub__chapter-pin,
  .scroll-scrub__chapter[data-align="right"] .scroll-scrub__chapter-pin {
    align-items: flex-end;
    justify-content: flex-start;
    padding: 6.5rem max(1.25rem, env(safe-area-inset-right))
      calc(4rem + env(safe-area-inset-bottom))
      max(1.25rem, env(safe-area-inset-left));
  }

  .scroll-scrub__copy {
    width: min(100%, 36rem);
  }

  .scroll-scrub__copy::before {
    inset: -3rem -2rem;
    background: linear-gradient(
      to top,
      var(--ss-bg) 0%,
      color-mix(in srgb, var(--ss-bg) 82%, transparent) 58%,
      transparent 100%
    );
  }

  .scroll-scrub__title {
    max-width: 14ch;
    font-size: clamp(2.3rem, 11vw, 4.5rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  .scroll-scrub__chapter {
    min-height: 100dvh !important;
  }

  .scroll-scrub__connector-band {
    display: none;
  }

  .scroll-scrub__progress span {
    transition: none;
  }
}
```
