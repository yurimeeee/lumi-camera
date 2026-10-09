import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistStorage } from '@/stores/storage';

import { toTemplate } from '../model/document';
import type { StudioDocument, StudioTemplate } from '../types/document';

/** Saved Frame Studio templates (frame, paper, background, layout, decorations — never photos). */

export const TEMPLATE_LIMIT = 40;
export const TEMPLATE_NAME_MAX = 24;

interface TemplateState {
  templates: StudioTemplate[];
  save: (name: string, doc: StudioDocument) => StudioTemplate;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
}

export function normalizeTemplateName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, TEMPLATE_NAME_MAX);
}

function isTemplate(t: unknown): t is StudioTemplate {
  const o = t as StudioTemplate | null;
  return !!o && typeof o.id === 'string' && typeof o.name === 'string' && !!o.doc && Array.isArray(o.doc.layers) && o.doc.version === 1;
}

export const useTemplateStore = create<TemplateState>()(
  persist(
    (set) => ({
      templates: [],
      save: (name, doc) => {
        const template = toTemplate(doc, normalizeTemplateName(name) || 'My Frame');
        set((s) => ({ templates: [template, ...s.templates].slice(0, TEMPLATE_LIMIT) }));
        return template;
      },
      rename: (id, name) => {
        const clean = normalizeTemplateName(name);
        if (clean) set((s) => ({ templates: s.templates.map((t) => (t.id === id ? { ...t, name: clean } : t)) }));
      },
      remove: (id) => set((s) => ({ templates: s.templates.filter((t) => t.id !== id) })),
    }),
    {
      name: 'lumi.frameTemplates',
      version: 1,
      storage: persistStorage,
      partialize: ({ templates }) => ({ templates }),
      merge: (persisted, current) => {
        const raw = (persisted as { templates?: unknown[] } | null)?.templates;
        return { ...current, templates: Array.isArray(raw) ? raw.filter(isTemplate) : [] };
      },
    },
  ),
);
