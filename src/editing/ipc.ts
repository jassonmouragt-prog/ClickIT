import type { Photo } from '../types/domain.ts';
import type { EditingPlan, EditingPlanView, EditingPreviewResult, PlanScope } from './types.ts';
import type { EditingStore } from './store.ts';
import { record, text, validateOverrides, validateProfile } from './contracts.ts';
import { id } from '../lib/validation.ts';
import { importReferences, referenceView } from './references.ts';
import { effectiveAdjustments } from './preview-map.ts';
import { PreviewCancelledError, renderEditingPreview } from './preview.ts';
export type EditingHandler = (...args: unknown[]) => unknown;
export type ReferenceChooser = (mode: 'REFERENCE' | 'PAIR') => Promise<string[] | null>;
export type ProjectPhotos = (projectId: string) => Photo[];
function profileInput(value: unknown) {
  const p = record(value);
  if (Object.keys(p).some(k => !['name', 'source', 'presetPath', 'q', 'c'].includes(k))) throw new Error('Campo de perfil não permitido.');
  validateProfile(p);
  if (p.name.trim().length > 120) throw new Error('Nome do perfil deve ter até 120 caracteres.');
  return { ...p, name: p.name.trim() };
}
function validatePlanScope(value: unknown): PlanScope {
  const r = record(value);
  const kind = r.kind;
  if (kind === 'PHOTO') { text(r.photoId, 'Fotografia'); return { kind, photoId: r.photoId }; }
  if (kind === 'SELECTED' || kind === 'PICKS' || kind === 'FAVORITES' || kind === 'ALL') { text(r.projectId, 'Projeto'); return { kind, projectId: r.projectId }; }
  throw new Error('Escopo de plano inválido.');
}
function resolveScope(scope: PlanScope, photos: ProjectPhotos): string[] {
  if (scope.kind === 'PHOTO') return [scope.photoId];
  const items = photos(scope.projectId);
  if (scope.kind === 'SELECTED') return items.filter(p => p.decision === 'SELECTED').map(p => p.id);
  if (scope.kind === 'PICKS') return items.filter(p => p.decision === 'AI_SELECTED' || p.decision === 'SELECTED').map(p => p.id);
  if (scope.kind === 'FAVORITES') return items.filter(p => p.favorite).map(p => p.id);
  return items.map(p => p.id);
}
function planView(store: EditingStore, plan: EditingPlan): EditingPlanView {
  const asset = store.photoAsset(plan.sourcePhotoId);
  return { plan, profileName: store.getEditingProfile(plan.profileId).name, photo: { id: asset.id, fileName: asset.fileName, previewUrl: asset.previewPath ? `clickit://photo/${asset.id}/preview?v=${asset.mtime}` : '', originalPath: asset.originalPath } };
}
export function registerEditingHandlers(owner: (channel: string, action: EditingHandler) => void, store: EditingStore, choose: ReferenceChooser, photos: ProjectPhotos, previewDir: string): void {
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
  owner('editing:plans:list', value => store.listEditingPlans(value === undefined ? undefined : id(value)).map(plan => planView(store, plan)));
  owner('editing:plans:get', value => planView(store, store.getEditingPlan(id(value))));
  owner('editing:plans:generate', (value, scope) => {
    const profileId = id(value); store.getEditingProfile(profileId);
    const photoIds = resolveScope(validatePlanScope(scope), photos);
    const result = store.generateEditingPlans(profileId, photoIds);
    return { generated: result.generated.map(plan => planView(store, plan)), skipped: result.skipped };
  });
  owner('editing:plans:delete', value => store.deleteEditingPlan(id(value)));
  // Fase D — preview não destrutivo. Nenhum handler toca no arquivo original;
  // todos já passam pelo guard requireWorkspaceLicense do chamador.
  const renderTokens = new Map<string, number>();
  owner('editing:preview:render', async (value, proposed) => {
    const plan = store.getEditingPlan(id(value));
    if (plan.status === 'DRAFT') throw new Error('Plano ainda não foi gerado.');
    if (plan.status === 'STALE') throw new Error('Plano desatualizado — gere o plano novamente antes de visualizar a prévia.');
    const overrides = proposed === undefined ? (plan.manualOverrides ?? {}) : validateOverrides(proposed);
    const asset = store.photoAsset(plan.sourcePhotoId);
    if (!asset.previewPath) throw new Error('Prévia base indisponível. Aguarde a geração dos previews da foto.');
    const { applied, unsupported, values } = effectiveAdjustments(plan.finalAdjustment, overrides);
    const token = (renderTokens.get(plan.id) ?? 0) + 1;
    renderTokens.set(plan.id, token);
    try {
      const outcome = await renderEditingPreview({
        basePreviewPath: asset.previewPath, photoHash: store.photoHash(plan.sourcePhotoId),
        inputFingerprint: plan.inputFingerprint, values, cacheDir: previewDir,
        shouldCancel: () => renderTokens.get(plan.id) !== token,
      });
      const result: EditingPreviewResult = { planId: plan.id, status: plan.status, fingerprint: outcome.fingerprint, url: outcome.url, cached: outcome.cached, renderMs: outcome.renderMs, applied, unsupported, overrides };
      return result;
    } catch (error) {
      if (error instanceof PreviewCancelledError) throw new Error('Prévia interrompida por nova alteração.');
      throw error;
    }
  });
  owner('editing:overrides:save', (value, overrides) => planView(store, store.setEditingPlanOverrides(id(value), overrides)));
  owner('editing:overrides:reset', (value, param) => planView(store, store.resetEditingPlanOverrides(id(value), param ?? null)));
  owner('editing:plans:review', value => planView(store, store.updateEditingPlanStatus(id(value), 'REVIEWED')));
}
