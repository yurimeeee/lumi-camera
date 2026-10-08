/**
 * Natural limits. A slider at 100 maps to these maxima, never more — every
 * value is relative to the face (or feature) it acts on, so the same slider
 * looks the same on a selfie and on a small face in a group photo.
 *
 * Units:
 *  - `…_RATIO` for the contour: share of the local face half-width the
 *    outline moves inward (face-bounding-box based).
 *  - `…_SCALE` for features: k in `source = centre + offset·(1 − k·w)`;
 *    the feature core grows by 1 / (1 − k) (k = 0.12 → ×1.14).
 *  - `…_SHIFT` for moves: share of the reference length named next to it.
 */

// ── Face contour (share of local face half-width) ─────────────
export const MAX_FACE_SLIM_RATIO = 0.075;
export const MAX_FACE_WIDTH_RATIO = 0.06;
export const MAX_JAW_RATIO = 0.075;
export const MAX_VLINE_RATIO = 0.085;
export const MAX_CHEEK_RATIO = 0.055;
export const MAX_FOREHEAD_RATIO = 0.05;

// ── Vertical (share of the eye-line → chin length L) ───────────
export const MAX_CHIN_SHIFT = 0.035;
export const MAX_VLINE_CHIN_LIFT = 0.012;
/** Midface: share of the eye → mouth distance. */
export const MAX_MIDFACE_RATIO = 0.08;
export const MAX_FACE_LENGTH_SHIFT = 0.045;
export const MAX_UPPER_FACE_SHIFT = 0.045;
export const MAX_LOWER_FACE_SHIFT = 0.04;

// ── Eyes ───────────────────────────────────────────────────────
export const MAX_EYE_SCALE = 0.12;
export const MAX_EYE_WIDTH_SCALE = 0.13;
export const MAX_EYE_HEIGHT_SCALE = 0.13;
/** Share of the eye width each eye moves. */
export const MAX_EYE_DISTANCE_SHIFT = 0.07;
/** Share of L. */
export const MAX_EYE_POSITION_SHIFT = 0.018;
/** Share of the eye width the outer corner rises / drops. */
export const MAX_OUTER_CORNER_SHIFT = 0.07;
/** Eye tilt about its centre, radians (≈ 5°). */
export const MAX_EYE_ANGLE = 0.085;

// ── Nose ───────────────────────────────────────────────────────
export const MAX_NOSE_SLIM_SCALE = 0.2;
export const MAX_NOSE_WIDTH_SCALE = 0.13;
export const MAX_NOSE_WING_RATIO = 0.15;
export const MAX_NOSE_TIP_SCALE = 0.14;
export const MAX_NOSE_SIZE_SCALE = 0.11;
/** Share of the nose length (nasion → base). */
export const MAX_NOSE_LENGTH_SHIFT = 0.07;
export const MAX_NOSE_POSITION_SHIFT = 0.06;
/** Nostrils narrow / widen toward the nose's midline. */
export const MAX_NOSTRIL_SCALE = 0.12;

// ── Lips ───────────────────────────────────────────────────────
export const MAX_LIP_SIZE_SCALE = 0.12;
export const MAX_LIP_WIDTH_SCALE = 0.12;
export const MAX_UPPER_LIP_SCALE = 0.2;
export const MAX_LOWER_LIP_SCALE = 0.18;
/** Share of L. */
export const MAX_MOUTH_POSITION_SHIFT = 0.024;
/** Share of the mouth half-width the corners lift. */
export const MAX_SMILE_SHIFT = 0.1;
/** Share of the mouth half-width the corners move up / down (no widening). */
export const MAX_MOUTH_CORNER_SHIFT = 0.085;
/** Philtrum: share of L the mouth moves, absorbed above the chin. */
export const MAX_PHILTRUM_SHIFT = 0.03;

// ── Safety nets (applied after everything is summed) ───────────
/** Contour inward/outward ratio after summing all face controls. */
export const MAX_CONTOUR_TOTAL = 0.14;
/** Feature scale k after summing (grow / shrink). */
export const MAX_SCALE_K = 0.24;
export const MIN_SCALE_K = -0.22;
/**
 * A move with a flat core of radius c·R and a smoothstep rim compresses the
 * sampling by 1.5·|t| / ((1 − c)·R), i.e. skin in the rim is magnified by
 * 1 / (1 − that). 0.22 keeps it under ~28 %.
 */
export const MAX_RIM_STRETCH = 0.22;
/** Same bound for vertical bands: |Δ| · 1.5 / bandwidth. */
export const MAX_BAND_STRETCH = 0.2;
/**
 * Scale primitives: largest local magnification / squeeze anywhere in the
 * rim (measured on the actual falloff curve, see `rimSafeK`).
 */
export const MAX_SCALE_DISTORTION = 0.33;
/**
 * Rotation primitives: shear in the rim is |θ| · r · |w′(r)| (more on an
 * elongated ellipse); kept under this.
 */
export const MAX_ROTATE_SHEAR = 0.22;
