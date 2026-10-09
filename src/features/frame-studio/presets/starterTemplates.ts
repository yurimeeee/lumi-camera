import { addDecoration, applyFrame, applyLayout, createDocument, presetFrameStyle, setMargin, toTemplate, updateFrame } from '../model/document';
import type { StudioDocument, StudioTemplate } from '../types/document';

/**
 * Built-in starting points, made with the same document operations a user
 * would use (so they double as living examples of the template system).
 */

function build(name: string, make: () => StudioDocument): StudioTemplate {
  return { ...toTemplate(make(), name), id: `starter:${name}` };
}

let starters: StudioTemplate[] | null = null;

export function starterTemplates(): StudioTemplate[] {
  if (!starters) {
    starters = [
      build('Cream Polaroid', () => {
        let d = createDocument([], 'classic_polaroid');
        d = updateFrame(d, [], { color: '#F1E4C8', texture: 'cream_canvas', textureIntensity: 35, shadow: 40 });
        d = setMargin(d, 8);
        return { ...d, background: { ...d.background, fill: { kind: 'texture', textureId: 'linen' } } };
      }),
      build('My Vintage Diary', () => {
        let d = createDocument([], 'journal_page');
        d = setMargin(d, 6);
        d = { ...d, background: { ...d.background, fill: { kind: 'texture', textureId: 'aged_paper' } } };
        return addDecoration(addDecoration(d, 'washi_tape'), 'heart_doodle');
      }),
      build('Travel Scrapbook', () => {
        let d = applyLayout(createDocument([]), 'scrapbook');
        d = applyFrame(d, presetFrameStyle('vintage_polaroid'));
        d = { ...d, background: { ...d.background, fill: { kind: 'texture', textureId: 'kraft_paper' } } };
        return addDecoration(addDecoration(d, 'pink_tape'), 'sage_tape');
      }),
      build('Soft Film', () => {
        let d = createDocument([], 'film_strip');
        d = updateFrame(d, [], { photoFade: 35 });
        return setMargin(d, 5);
      }),
    ];
  }
  return starters;
}
