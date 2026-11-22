// Props: none. The nav mark as a real body instead of a drawing of one: six cream faces in a CSS
// 3D box, held in the pose whose projection is the flat mark (docs/brand/logo-mark.svg) — so the
// header looks unchanged while nothing moves — and turning once about a screen diagonal on load.
// Decorative: the wordmark beside it is the link text, so the whole mark is aria-hidden.
import '../styles/brand-cube-logo.css';

// Face order is irrelevant to the paint (each face carries its own transform); it only keeps the
// markup readable. The dot is a sibling of the faces: it is pinned to a cube corner, not to a face.
const FACES = ['front', 'back', 'right', 'left', 'top', 'bottom'] as const;

export default function BrandCubeLogo() {
  return (
    <span className="brand-cube" aria-hidden="true">
      <span className="brand-cube__turn">
        <span className="brand-cube__box">
          {FACES.map((face) => (
            <span key={face} className={`brand-cube__face brand-cube__face--${face}`} />
          ))}
          <span className="brand-cube__dot" />
        </span>
      </span>
    </span>
  );
}
