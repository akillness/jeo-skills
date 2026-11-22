// The accent ring and the sticker rim are driven by a `--accent` custom property set inline.
// React's CSSProperties has no index signature for those, so declare one here rather than casting
// every style object at the call site.
import 'react';

declare module 'react' {
  interface CSSProperties {
    [customProperty: `--${string}`]: string | number | undefined;
  }
}
