import type { PatternId } from '../types/document';

/** Frame colour palette (Customize → Frame Color). */
export const FRAME_PALETTE: readonly { name: string; color: string }[] = [
  { name: 'Warm White', color: '#FBF8F2' },
  { name: 'Ivory', color: '#F7F0E1' },
  { name: 'Cream', color: '#F1E4C8' },
  { name: 'Beige', color: '#E4D3B8' },
  { name: 'Dusty Pink', color: '#E2C3BC' },
  { name: 'Sage', color: '#C7D0BA' },
  { name: 'Warm Gray', color: '#B5ACA2' },
  { name: 'Charcoal', color: '#37332F' },
];

export const BACKGROUND_COLORS: readonly string[] = ['#F7F4EF', '#FFFFFF', '#EFE6D6', '#E8DCCB', '#DCE3D6', '#E9D6D2', '#D5DCE3', '#2B2724'];

export const BACKGROUND_GRADIENTS: readonly { from: string; to: string; angle: number }[] = [
  { from: '#F7EFE3', to: '#E8D6C2', angle: 90 },
  { from: '#F3E2DC', to: '#D9C7D6', angle: 60 },
  { from: '#E6EDE4', to: '#C9D6CF', angle: 90 },
  { from: '#F6E7CF', to: '#E9B999', angle: 120 },
  { from: '#DDE4EC', to: '#F3EDE4', angle: 90 },
  { from: '#3A3430', to: '#1D1A18', angle: 90 },
];

export const BACKGROUND_PATTERNS: readonly { pattern: PatternId; name: string; color: string; ink: string }[] = [
  { pattern: 'dots', name: 'Dots', color: '#F4EDE2', ink: '#D9C9B4' },
  { pattern: 'grid', name: 'Grid', color: '#F8F4EC', ink: '#DCD3C6' },
  { pattern: 'stripes', name: 'Stripes', color: '#F3E7DF', ink: '#EAD3C8' },
  { pattern: 'check', name: 'Gingham', color: '#F6F0E6', ink: '#E7DACB' },
];

export const TEXT_COLORS: readonly string[] = ['#24211E', '#5B4A3E', '#8C6D62', '#FFFFFF', '#C2644A', '#6E8063'];
