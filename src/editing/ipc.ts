import type { EditingStore } from './store.ts';
import { record, validateProfile } from './contracts.ts';
import { id } from '../lib/validation.ts';
import { importReferences, referenceView } from './references.ts';
export type EditingHandler = (...args: unknown[]) => unknown;
export type ReferenceChooser = (mode: 'REFERENCE' | 'PAIR') => Promise<string[] | null>;
function profileInput(value: unknown) {
  const p = record(value);
  if (Object.keys(p).some(k => !['name', 'source', 'presetPath', 'q', 'c'].includes(k))) throw new Error('Campo de perfil não permitido.');
  validateProfile(p);
  if (p.name.trim().length > 120) throw new Error('Nome do perfil deve ter até 120 caracteres.');
  return { ...p, name: p.name.trim() };
}
export function registerEditingHandlers(owner: (channel: string, action: EditingHandler) => void, store: EditingStore, choose: ReferenceChooser): void {
  owner('editing:profiles:list', () => store.listEditingProfiles());
  owner('editing:profiles:get', value => store.getEditingProfile(id(value)));
  owner('editing:profiles:create', value => store.createEditingProfile(profileInput(value)));
  owner('editing:profiles:update', (value, input) => store.updateEditingProfile(id(value), profileInput(input)));
  owner('editing:profiles:delete', value => store.deleteEditingProfile(id(value)));
  owner('editing:profiles:duplicate', value => {
    const p = store.getEditingProfile(id(value));
    return store.createEditingProfile({ name: `Cópia de ${p.name}`.slice(0, 120), source: p.source, presetPath: p.presetPath, q: p.q, c: p.c });
  });
  owner('editing:references:list', async value => {
    const refs = store.listReferenceImages(value === undefined ? undefined : id(value));
    const result = []; for (const ref of refs) result.push(await referenceView(ref)); return result;
  });
  owner('editing:references:add', async (value, mode) => {
    const profileId = id(value); store.getEditingProfile(profileId);
    if (mode !== 'REFERENCE' && mode !== 'PAIR') throw new Error('Tipo de referência inválido.');
    const files = await choose(mode); return files === null ? [] : importReferences(store, profileId, mode, files);
  });
  owner('editing:references:remove', value => store.removeReferenceImage(id(value)));
}
