import { frameLabel } from '@/constants/film';
import { getFilter } from '@/constants/filters';
import type { Recipe } from '@/types/recipes';

/** One line describing what a recipe does, e.g. "Mellow 80 + Film 35 40 · 그레인 · 빛샘 · Polaroid". */
export function recipeSummary(r: Recipe): string {
  const c = r.color;
  const parts = [`${getFilter(c.baseFilterId).name} ${c.intensity}${c.mix ? ` + ${getFilter(c.mix.filterId).name} ${c.mix.intensity}` : ''}`];
  const f = r.film;
  if (c.adjustments.grain > 0) parts.push('그레인');
  if (f.bloom.intensity > 0) parts.push('블룸');
  if (f.halation.intensity > 0) parts.push('할레이션');
  if (f.leak.intensity > 0) parts.push('빛샘');
  if (f.burn.intensity > 0) parts.push('번');
  if (f.dust > 0 || f.scratch > 0) parts.push('먼지·스크래치');
  if (r.frame.id !== 'none') parts.push(frameLabel(r.frame.id));
  if (r.stamp.show) parts.push('날짜');
  return parts.join(' · ');
}
