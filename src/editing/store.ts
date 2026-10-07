import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { EDITING_ENGINE_VERSION, EDITING_SCHEMA_VERSION } from './config.ts';
import { canonicalJson, inputFingerprint, profileContent, record, text, validateProfile, validateTransition, version } from './contracts.ts';
import { generateContent } from './planner.ts';
import type { EditingPlan, EditingPlanStatus, EditingProfile, EditingProfileInput, ReferenceImage, ReferenceImageInput } from './types.ts';

export class EditingStore {
  db: DatabaseSync;
  constructor(db: DatabaseSync) { this.db = db; }
  transaction(fn: () => void): void { this.db.exec('BEGIN IMMEDIATE'); try { fn(); this.db.exec('COMMIT'); } catch (e) { this.db.exec('ROLLBACK'); throw e; } }
  migrateEditing(): void {
    const current = Number(this.db.prepare('PRAGMA user_version').get()?.user_version);
    if (current > EDITING_SCHEMA_VERSION) throw new Error('Banco de edição de versão mais recente.');
    this.transaction(() => {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS editing_profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL, profileVersion INTEGER NOT NULL CHECK(profileVersion>=1), data TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS editing_plans (id TEXT PRIMARY KEY, profileId TEXT NOT NULL REFERENCES editing_profiles(id), photoId TEXT NOT NULL REFERENCES photos(id), inputFingerprint TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('DRAFT','GENERATED','REVIEWED','EXPORTED','STALE')), data TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, UNIQUE(profileId,photoId));
        CREATE TABLE IF NOT EXISTS reference_images (id TEXT PRIMARY KEY, profileId TEXT NOT NULL REFERENCES editing_profiles(id), photoId TEXT REFERENCES photos(id), externalPath TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('REFERENCE','BEFORE','AFTER')), pairId TEXT, fingerprint TEXT NOT NULL, data TEXT NOT NULL, createdAt TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS editing_plans_profile ON editing_plans(profileId);
        CREATE INDEX IF NOT EXISTS editing_plans_photo ON editing_plans(photoId);
        CREATE INDEX IF NOT EXISTS reference_images_profile ON reference_images(profileId);
        PRAGMA user_version=${EDITING_SCHEMA_VERSION};`);
    });
  }
  private hasTable(table: string): boolean { return !!this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table); }
  private read<T>(table: string, id: string): T {
    text(id, 'Identificador');
    const row = this.hasTable(table) ? this.db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(id) : undefined;
    if (!row) throw new Error(`Registro de ${table} inexistente.`);
    return JSON.parse(String(row.data)) as T;
  }
  createEditingProfile(input: EditingProfileInput): EditingProfile {
    validateProfile(input);
    const now = new Date().toISOString();
    const profile: EditingProfile = { ...structuredClone(input), id: randomUUID(), profileVersion: 1, createdAt: now, updatedAt: now };
    this.db.prepare('INSERT INTO editing_profiles VALUES(?,?,?,?,?,?)').run(profile.id, profile.name, profile.profileVersion, JSON.stringify(profile), now, now);
    return profile;
  }
  getEditingProfile(id: string): EditingProfile { const p = this.read<EditingProfile>('editing_profiles', id); validateProfile(p); version(p.profileVersion); return p; }
  listEditingProfiles(): EditingProfile[] {
    if (!this.hasTable('editing_profiles')) return [];
    return this.db.prepare('SELECT id FROM editing_profiles ORDER BY createdAt,id').all().map(r => this.getEditingProfile(String(r.id)));
  }
  updateEditingProfile(id: string, input: EditingProfileInput): EditingProfile {
    validateProfile(input); const old = this.getEditingProfile(id);
    const changed = profileContent(old) !== profileContent(input);
    const profile = { ...structuredClone(input), id, profileVersion: old.profileVersion + Number(changed), createdAt: old.createdAt, updatedAt: new Date().toISOString() };
    version(profile.profileVersion);
    this.transaction(() => {
      this.db.prepare('UPDATE editing_profiles SET name=?,profileVersion=?,data=?,updatedAt=? WHERE id=?').run(profile.name, profile.profileVersion, JSON.stringify(profile), profile.updatedAt, id);
      if (changed) for (const plan of this.rawPlans('profileId', id)) this.markStale(plan);
    });
    return profile;
  }
  deleteEditingProfile(id: string): void {
    this.getEditingProfile(id);
    if (this.rawPlans('profileId', id).length || this.listReferenceImages(id).length) throw new Error('Perfil possui planos ou referências; remova-os explicitamente antes de excluir.');
    this.db.prepare('DELETE FROM editing_profiles WHERE id=?').run(id);
  }
  private source(id: string) {
    text(id, 'Fotografia');
    const photo = this.db.prepare('SELECT originalPath,hash,analysisStatus FROM photos WHERE id=?').get(id);
    if (!photo) throw new Error('Fotografia de origem inexistente.');
    return photo;
  }
  createEditingPlan(profileId: string, sourcePhotoId: string): EditingPlan {
    const profile = this.getEditingProfile(profileId), source = this.source(sourcePhotoId);
    if (source.analysisStatus !== 'DONE' || !source.hash) throw new Error('Origem sem análise/hash válido.');
    const now = new Date().toISOString();
    const plan: EditingPlan = { id: randomUUID(), profileId, sourcePhotoId, sourceOriginalPath: String(source.originalPath), profileVersion: profile.profileVersion, engineVersion: EDITING_ENGINE_VERSION, inputFingerprint: inputFingerprint(profile, String(source.hash)), generatedAt: null, createdAt: now, updatedAt: now, baseStyle: [], sceneCorrection: [], finalAdjustment: [], explanation: [], sceneAdvisories: [], missingSignals: [], status: 'DRAFT', statusHistory: [{ status: 'DRAFT', at: now }], xmpPath: null };
    this.db.prepare('INSERT INTO editing_plans VALUES(?,?,?,?,?,?,?,?)').run(plan.id, profileId, sourcePhotoId, plan.inputFingerprint, plan.status, JSON.stringify(plan), now, now);
    return plan;
  }
  private rawPlans(column?: 'profileId' | 'photoId', id?: string): EditingPlan[] {
    if (!this.hasTable('editing_plans')) return [];
    const rows = column ? this.db.prepare(`SELECT data FROM editing_plans WHERE ${column}=? ORDER BY createdAt,id`).all(id!) : this.db.prepare('SELECT data FROM editing_plans ORDER BY createdAt,id').all();
    return rows.map(r => JSON.parse(String(r.data)) as EditingPlan);
  }
  private savePlan(plan: EditingPlan): void {
    this.db.prepare('UPDATE editing_plans SET status=?,data=?,updatedAt=? WHERE id=?').run(plan.status, JSON.stringify(plan), plan.updatedAt, plan.id);
  }
  private markStale(plan: EditingPlan): EditingPlan {
    if (plan.status !== 'STALE') {
      plan.status = 'STALE'; plan.updatedAt = new Date().toISOString();
      plan.statusHistory.push({ status: 'STALE', at: plan.updatedAt }); this.savePlan(plan);
    }
    return plan;
  }
  private photoData(id: string) {
    text(id, 'Fotografia');
    const row = this.db.prepare('SELECT p.originalPath,p.hash,p.analysisStatus,p.width,p.height,m.data AS metadataData,a.data AS analysisData FROM photos p LEFT JOIN photo_metadata m ON m.photoId=p.id LEFT JOIN photo_analysis a ON a.photoId=p.id WHERE p.id=?').get(id);
    if (!row) throw new Error('Fotografia de origem inexistente.');
    return row as { originalPath: string; hash: string | null; analysisStatus: string; width: number | null; height: number | null; metadataData: string | null; analysisData: string | null };
  }
  private planFor(profileId: string, photoId: string): EditingPlan | null {
    const row = this.db.prepare('SELECT data FROM editing_plans WHERE profileId=? AND photoId=?').get(profileId, photoId);
    return row ? JSON.parse(String(row.data)) as EditingPlan : null;
  }
  photoAsset(id: string): { id: string; fileName: string; originalPath: string; previewPath: string | null; thumbnailPath: string | null; mtime: number } {
    text(id, 'Fotografia');
    const row = this.db.prepare('SELECT id,fileName,originalPath,previewPath,thumbnailPath,mtime FROM photos WHERE id=?').get(id);
    if (!row) throw new Error('Fotografia de origem inexistente.');
    return row as { id: string; fileName: string; originalPath: string; previewPath: string | null; thumbnailPath: string | null; mtime: number };
  }
  generateEditingPlan(id: string): EditingPlan {
    const plan = this.getEditingPlan(id);
    if (plan.status !== 'DRAFT' && plan.status !== 'STALE') throw new Error('Plano já gerado não pode ser regenerado automaticamente.');
    const profile = this.getEditingProfile(plan.profileId);
    const photo = this.photoData(plan.sourcePhotoId);
    if (photo.analysisStatus !== 'DONE' || !photo.hash || !photo.analysisData) throw new Error('Origem sem análise/hash válido.');
    const content = generateContent(profile, { analysis: JSON.parse(photo.analysisData), width: Number(photo.width ?? 0), height: Number(photo.height ?? 0), metadata: photo.metadataData ? JSON.parse(photo.metadataData) : {} });
    const now = new Date().toISOString();
    plan.baseStyle = content.baseStyle; plan.sceneCorrection = content.sceneCorrection; plan.finalAdjustment = content.finalAdjustment;
    plan.explanation = content.explanation; plan.sceneAdvisories = content.sceneAdvisories; plan.missingSignals = content.missingSignals;
    plan.inputFingerprint = inputFingerprint(profile, String(photo.hash));
    plan.profileVersion = profile.profileVersion; plan.engineVersion = EDITING_ENGINE_VERSION;
    plan.generatedAt = now; plan.status = 'GENERATED'; plan.updatedAt = now;
    plan.statusHistory.push({ status: 'GENERATED', at: now });
    this.savePlan(plan); return plan;
  }
  generateEditingPlans(profileId: string, photoIds: string[]): { generated: EditingPlan[]; skipped: { photoId: string; reason: string }[] } {
    this.getEditingProfile(profileId);
    const generated: EditingPlan[] = [], skipped: { photoId: string; reason: string }[] = [];
    for (const photoId of new Set(photoIds)) {
      try {
        const existing = this.planFor(profileId, photoId);
        if (existing) { const plan = this.verifyEditingPlan(existing); generated.push(plan.status === 'DRAFT' || plan.status === 'STALE' ? this.generateEditingPlan(plan.id) : plan); }
        else { const draft = this.createEditingPlan(profileId, photoId); generated.push(this.generateEditingPlan(draft.id)); }
      } catch (e) { skipped.push({ photoId, reason: e instanceof Error ? e.message : String(e) }); }
    }
    return { generated, skipped };
  }
  invalidateEditingPlansForPhoto(id: string): void { for (const p of this.rawPlans('photoId', id)) this.markStale(p); }
  verifyEditingPlansForPhoto(id: string): void { for (const p of this.rawPlans('photoId', id)) this.verifyEditingPlan(p); }
  verifyEditingPlan(plan: EditingPlan): EditingPlan {
    version(plan.engineVersion); version(plan.profileVersion);
    const profile = this.getEditingProfile(plan.profileId), source = this.source(plan.sourcePhotoId);
    const valid = source.analysisStatus === 'DONE' && source.hash && source.originalPath === plan.sourceOriginalPath && profile.profileVersion === plan.profileVersion && plan.engineVersion === EDITING_ENGINE_VERSION && inputFingerprint(profile, String(source.hash)) === plan.inputFingerprint;
    return valid ? plan : this.markStale(plan);
  }
  getEditingPlan(id: string): EditingPlan { return this.verifyEditingPlan(this.read<EditingPlan>('editing_plans', id)); }
  listEditingPlans(profileId?: string): EditingPlan[] {
    if (!this.hasTable('editing_plans')) return [];
    if (profileId !== undefined) this.getEditingProfile(profileId);
    return this.rawPlans(profileId === undefined ? undefined : 'profileId', profileId).map(p => this.verifyEditingPlan(p));
  }
  updateEditingPlanStatus(id: string, status: EditingPlanStatus): EditingPlan {
    const plan = this.getEditingPlan(id); validateTransition(plan.status, status);
    // Phase A has no generator/exporter: valid structural transitions cannot manufacture their evidence.
    if (status === 'GENERATED' && (plan.generatedAt === null || plan.status === 'STALE')) throw new Error('Plano deve ser gerado pelo motor antes de GENERATED.');
    if (status === 'EXPORTED' && !plan.xmpPath) throw new Error('Plano não possui exportação XMP.');
    plan.status = status; plan.updatedAt = new Date().toISOString();
    plan.statusHistory.push({ status, at: plan.updatedAt }); this.savePlan(plan); return plan;
  }
  deleteEditingPlan(id: string): void { this.read<EditingPlan>('editing_plans', id); this.db.prepare('DELETE FROM editing_plans WHERE id=?').run(id); }
  addReferenceImage(input: ReferenceImageInput): ReferenceImage {
    const r = record(input); this.getEditingProfile(input.profileId);
    if (r.photoId !== null) { text(r.photoId, 'Fotografia'); this.source(r.photoId); }
    text(r.externalPath, 'Caminho de referência'); text(r.fingerprint, 'Fingerprint');
    if (!/^[a-f0-9]{64}$/.test(input.fingerprint)) throw new Error('Fingerprint de referência inválido.');
    if (!['REFERENCE', 'BEFORE', 'AFTER'].includes(input.kind)) throw new Error('Tipo de referência inválido.');
    if (r.pairId !== null) text(r.pairId, 'Par');
    const reference = { ...structuredClone(input), id: randomUUID(), createdAt: new Date().toISOString() };
    this.db.prepare('INSERT INTO reference_images VALUES(?,?,?,?,?,?,?,?,?)').run(reference.id, reference.profileId, reference.photoId, reference.externalPath, reference.kind, reference.pairId, reference.fingerprint, canonicalJson(reference), reference.createdAt);
    return reference;
  }
  listReferenceImages(profileId?: string): ReferenceImage[] {
    if (!this.hasTable('reference_images')) return [];
    if (profileId !== undefined) this.getEditingProfile(profileId);
    const rows = profileId === undefined ? this.db.prepare('SELECT data FROM reference_images ORDER BY createdAt,id').all() : this.db.prepare('SELECT data FROM reference_images WHERE profileId=? ORDER BY createdAt,id').all(profileId);
    return rows.map(r => JSON.parse(String(r.data)) as ReferenceImage);
  }
  removeReferenceImage(id: string): void { this.read<ReferenceImage>('reference_images', id); this.db.prepare('DELETE FROM reference_images WHERE id=?').run(id); }
}
