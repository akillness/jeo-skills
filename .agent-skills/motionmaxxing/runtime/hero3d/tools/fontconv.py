#!/usr/bin/env python3
"""fontconv.py - make a font readable by hero3d (opentype.js): woff2 / woff / variable / otf -> static TTF.

hero3d's extrudedText uses three's TTFLoader (opentype.js), which cannot read woff2 and ignores variable axes.
brand.mjs and runtime/fonts ship woff2 / variable fonts, so convert once:

  python3 fontconv.py in.woff2 out.ttf                       # decompress (static font) -> TTF
  python3 fontconv.py InterVariable.woff2 out.ttf --wght 700 # pin a variable font at weight 700 (any axis: --axis opsz=32)
  python3 fontconv.py in.ttf out.ttf --text "Fathom"         # subset to the glyphs you extrude (small + fast)

Needs fontTools + brotli (pip install fonttools brotli). Licence: only convert fonts you may embed (OFL / the brand's own).
"""
import argparse, sys
from fontTools.ttLib import TTFont


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--wght', type=float, help='weight for a variable font (shortcut for --axis wght=N)')
    ap.add_argument('--axis', action='append', default=[], help='AXIS=VALUE, repeatable (wdth=100, opsz=32 ...)')
    ap.add_argument('--text', help='keep only the glyphs needed for this text (plus space and basic punctuation)')
    ap.add_argument('--latin', action='store_true', help='keep Basic Latin + Latin-1 punctuation (default when --text is absent: keep everything)')
    a = ap.parse_args()

    f = TTFont(a.src)
    if 'fvar' in f:
        from fontTools.varLib import instancer
        loc = {}
        for kv in a.axis:
            k, v = kv.split('='); loc[k] = float(v)
        if a.wght is not None: loc['wght'] = a.wght
        axes = {ax.axisTag: ax for ax in f['fvar'].axes}
        for k in axes:                       # any axis left unpinned goes to its default so the result is static
            loc.setdefault(k, axes[k].defaultValue)
        for k, v in loc.items():
            if k in axes: loc[k] = max(axes[k].minValue, min(axes[k].maxValue, v))
        f = instancer.instantiateVariableFont(f, loc, inplace=False)
        print('instanced variable font at', loc, file=sys.stderr)
    if a.text is not None or a.latin:
        from fontTools import subset
        opts = subset.Options(); opts.layout_features = ['kern', 'liga']; opts.name_IDs = ['*']; opts.notdef_outline = True
        sub = subset.Subsetter(opts)
        if a.text is not None:
            chars = set(a.text) | set(' .,;:!?-–—\'"()&@#%0123456789')
            sub.populate(text=''.join(sorted(chars)))
        else:
            sub.populate(unicodes=list(range(0x20, 0x7F)) + list(range(0xA0, 0x100)) + [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x20AC])
        sub.subset(f)
    f.flavor = None                           # plain sfnt (woff/woff2 wrapper removed)
    f.save(a.dst)
    print('wrote', a.dst, file=sys.stderr)


if __name__ == '__main__':
    main()
