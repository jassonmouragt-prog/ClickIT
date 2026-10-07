import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { Analysis, DecisionPatch, Metadata, Photo, Project, ProjectStatus, Settings } from '../types/domain.ts';
import type { Candidate, RankedGroup } from '../ai/grouping.ts';
import { ANALYSIS_VERSION } from '../lib/config.ts';
import { EditingStore } from '../editing/store.ts';
type Row = Record<string, string | number | null | Uint8Array>;
function decode<T>(v: unknown, fallback: T): T { return typeof v === 'string' ? JSON.parse(v) as T : fallback; }
export class Store extends EditingStore {
  constructor(file: string) {
    super(new DatabaseSync(file));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, sourcePath TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, status TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, projectId TEXT NOT NULL REFERENCES projects(id), originalPath TEXT NOT NULL, fileName TEXT NOT NULL, extension TEXT NOT NULL, fileSize INTEGER NOT NULL, mtime REAL NOT NULL, width INTEGER NOT NULL DEFAULT 0, height INTEGER NOT NULL DEFAULT 0, captureDate TEXT, thumbnailPath TEXT, previewPath TEXT, analysisStatus TEXT NOT NULL DEFAULT 'PENDING', error TEXT, hash TEXT, UNIQUE(projectId,originalPath));
      CREATE INDEX IF NOT EXISTS photo_project ON photos(projectId);
      CREATE TABLE IF NOT EXISTS photo_metadata (photoId TEXT PRIMARY KEY REFERENCES photos(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS photo_analysis (photoId TEXT PRIMARY KEY REFERENCES photos(id), data TEXT NOT NULL, version TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS photo_embeddings (photoId TEXT PRIMARY KEY REFERENCES photos(id), data TEXT);
      CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY, projectId TEXT NOT NULL REFERENCES projects(id), type TEXT NOT NULL, representativePhotoId TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS group_photos (groupId TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE, photoId TEXT UNIQUE NOT NULL REFERENCES photos(id), similarity REAL NOT NULL, rank INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS photo_decisions (photoId TEXT PRIMARY KEY REFERENCES photos(id), status TEXT NOT NULL DEFAULT 'UNDECIDED', source TEXT NOT NULL DEFAULT 'AI', createdAt TEXT NOT NULL, rating INTEGER NOT NULL DEFAULT 0 CHECK(rating BETWEEN 0 AND 5), favorite INTEGER NOT NULL DEFAULT 0, keep INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS decision_history (id INTEGER PRIMARY KEY, photoId TEXT NOT NULL, groupId TEXT, aiChoice TEXT, originalRanking TEXT, scores TEXT, humanPatch TEXT NOT NULL, createdAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
      UPDATE projects SET status='INTERRUPTED' WHERE status IN ('INDEXING','ANALYZING');`);
    try { this.migrateEditing(); } catch (error) { this.db.close(); throw error; }
  }
  close(): void { this.db.close(); }
  projects(): Project[] {
    return this.db.prepare(`SELECT p.*, COUNT(f.id) count, COALESCE(SUM(f.analysisStatus='DONE'),0) analyzed, COALESCE(SUM(f.analysisStatus='FAILED'),0) failed FROM projects p LEFT JOIN photos f ON p.id=f.projectId GROUP BY p.id ORDER BY p.updatedAt DESC`).all() as unknown as Project[];
  }
  project(id: string): Project { const p = this.projects().find(p => p.id === id); if (!p) throw new Error('Projeto não encontrado.'); return p; }
  create(name: string, sourcePath: string): Project {
    const id = randomUUID(), now = new Date().toISOString();
    this.db.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run(id, name, sourcePath, now, now, 'NEW'); return this.project(id);
  }
  status(id: string, status: ProjectStatus): void { this.db.prepare('UPDATE projects SET status=?,updatedAt=? WHERE id=?').run(status, new Date().toISOString(), id); }
  index(projectId: string, file: { path: string; name: string; extension: string; size: number; mtime: number }): boolean {
    const old = this.db.prepare('SELECT id,fileSize,mtime FROM photos WHERE projectId=? AND originalPath=?').get(projectId, file.path);
    if (old && old.fileSize === file.size && old.mtime === file.mtime) return false;
    this.transaction(() => {
      if (old) {
        const id = String(old.id);
        this.invalidateEditingPlansForPhoto(id);
        this.db.prepare("UPDATE photos SET fileSize=?,mtime=?,analysisStatus='PENDING',error=NULL,thumbnailPath=NULL,previewPath=NULL WHERE id=?").run(file.size, file.mtime, id);
        for (const table of ['photo_analysis', 'photo_metadata', 'photo_embeddings', 'group_photos']) this.db.prepare(`DELETE FROM ${table} WHERE photoId=?`).run(id);
        this.db.prepare("UPDATE photo_decisions SET status='UNDECIDED' WHERE photoId=? AND source='AI'").run(id);
      } else {
        const id = randomUUID();
        this.db.prepare('INSERT INTO photos(id,projectId,originalPath,fileName,extension,fileSize,mtime) VALUES(?,?,?,?,?,?,?)').run(id, projectId, file.path, file.name, file.extension, file.size, file.mtime);
        this.db.prepare('INSERT INTO photo_decisions(photoId,createdAt) VALUES(?,?)').run(id, new Date().toISOString());
      }
    }); return true;
  }
  photos(projectId: string): Photo[] {
    const rows = this.db.prepare(`SELECT p.*, m.data metadata, a.data analysis, d.status decision,d.source,d.rating,d.favorite,d.keep,gp.groupId,gp.rank,gp.similarity,g.type groupType FROM photos p LEFT JOIN photo_metadata m ON m.photoId=p.id LEFT JOIN photo_analysis a ON a.photoId=p.id LEFT JOIN photo_decisions d ON d.photoId=p.id LEFT JOIN group_photos gp ON gp.photoId=p.id LEFT JOIN groups g ON g.id=gp.groupId WHERE p.projectId=? ORDER BY COALESCE(p.captureDate,p.fileName),p.fileName`).all(projectId);
    return rows.map(row => ({ ...row, metadata: decode<Metadata>(row.metadata, {}), analysis: decode<Analysis | null>(row.analysis, null), favorite: !!row.favorite, keep: !!row.keep, duplicate: row.groupType === 'DUPLICATE' }) as unknown as Photo);
  }
  photo(id: string): Photo {
    const row = this.db.prepare('SELECT projectId FROM photos WHERE id=?').get(id);
    if (!row) throw new Error('Fotografia não encontrada.');
    return this.photos(String(row.projectId)).find(p => p.id === id)!;
  }
  asset(id: string, kind: 'thumbnail' | 'preview' | 'original'): string | null {
    const column = { thumbnail: 'thumbnailPath', preview: 'previewPath', original: 'originalPath' }[kind];
    const row = this.db.prepare(`SELECT ${column} value FROM photos WHERE id=?`).get(id); return row?.value ? String(row.value) : null;
  }
  preview(id: string, result: { width: number; height: number; thumbnailPath: string; previewPath: string }): void {
    this.db.prepare('UPDATE photos SET width=?,height=?,thumbnailPath=?,previewPath=?,error=NULL WHERE id=?').run(result.width, result.height, result.thumbnailPath, result.previewPath, id);
  }
  previewFailed(id: string, message: string): void {
    this.db.prepare('UPDATE photos SET thumbnailPath=NULL,previewPath=NULL,error=? WHERE id=?').run(message, id);
  }
  result(id: string, result: { width: number; height: number; captureDate: string | null; thumbnailPath: string; previewPath: string; metadata: Metadata; analysis: Analysis; embedding: number[] | null; hash: string }): void {
    this.transaction(() => {
      this.db.prepare("UPDATE photos SET width=?,height=?,captureDate=?,thumbnailPath=?,previewPath=?,hash=?,analysisStatus='DONE',error=NULL WHERE id=?").run(result.width, result.height, result.captureDate, result.thumbnailPath, result.previewPath, result.hash, id);
      this.db.prepare('INSERT OR REPLACE INTO photo_metadata VALUES(?,?)').run(id, JSON.stringify(result.metadata));
      this.db.prepare('INSERT OR REPLACE INTO photo_analysis VALUES(?,?,?)').run(id, JSON.stringify(result.analysis), ANALYSIS_VERSION);
      this.db.prepare('INSERT OR REPLACE INTO photo_embeddings VALUES(?,?)').run(id, result.embedding ? JSON.stringify(result.embedding) : null);
      this.verifyEditingPlansForPhoto(id);
    });
  }
  failed(id: string, message: string): void { this.db.prepare("UPDATE photos SET analysisStatus='FAILED',error=? WHERE id=?").run(message, id); }
  candidates(projectId: string): Candidate[] {
    return (this.db.prepare(`SELECT p.id,p.captureDate date,p.hash,a.data analysis,e.data embedding FROM photos p JOIN photo_analysis a ON a.photoId=p.id LEFT JOIN photo_embeddings e ON e.photoId=p.id WHERE p.projectId=? AND p.analysisStatus='DONE'`).all(projectId) as Row[]).map(r => ({ id: String(r.id), date: r.date ? String(r.date) : null, hash: String(r.hash), analysis: decode<Analysis>(r.analysis, {} as Analysis), embedding: decode<number[] | null>(r.embedding, null) }));
  }
  saveGroups(projectId: string, groups: RankedGroup[], candidates: Candidate[]): void {
    const byId = new Map(candidates.map(c => [c.id, c]));
    this.transaction(() => {
      this.db.prepare('DELETE FROM groups WHERE projectId=?').run(projectId);
      for (const group of groups) {
        const id = randomUUID();
        this.db.prepare('INSERT INTO groups VALUES(?,?,?,?)').run(id, projectId, group.duplicate ? 'DUPLICATE' : group.ids.length > 1 ? 'SIMILAR' : 'SINGLE', group.ids[0]!);
        group.ids.forEach((photoId, index) => {
          const a = byId.get(photoId)!.analysis;
          this.db.prepare('INSERT INTO group_photos VALUES(?,?,?,?)').run(id, photoId, group.similarities[index]!, index + 1);
          const review = a.blur === 'UNCERTAIN' || a.blur === 'POSSIBLE_BLUR' || a.eyesScore === 20;
          this.db.prepare("UPDATE photo_decisions SET status=?,createdAt=? WHERE photoId=? AND source='AI'").run(review ? 'REVIEW' : index === 0 ? 'AI_SELECTED' : 'UNDECIDED', new Date().toISOString(), photoId);
          this.db.prepare('UPDATE photo_analysis SET data=? WHERE photoId=?').run(JSON.stringify(a), photoId);
        });
      }
    });
  }
  decide(id: string, patch: DecisionPatch): void {
    const photo = this.photo(id);
    const ranking = photo.groupId ? this.db.prepare('SELECT photoId,rank FROM group_photos WHERE groupId=? ORDER BY rank').all(photo.groupId) : [];
    this.transaction(() => {
      this.db.prepare('INSERT INTO decision_history(photoId,groupId,aiChoice,originalRanking,scores,humanPatch,createdAt) VALUES(?,?,?,?,?,?,?)').run(id, photo.groupId, ranking[0]?.photoId ?? null, JSON.stringify(ranking), JSON.stringify(photo.analysis), JSON.stringify(patch), new Date().toISOString());
      this.db.prepare("UPDATE photo_decisions SET status=?,source='USER',rating=?,favorite=?,keep=?,createdAt=? WHERE photoId=?").run(patch.keep ? 'SELECTED' : patch.status ?? photo.decision, patch.rating ?? photo.rating, Number(patch.favorite ?? photo.favorite), Number(patch.keep ?? photo.keep), new Date().toISOString(), id);
    });
  }
  settings(value?: Settings): Settings {
    if (value) this.db.prepare('INSERT OR REPLACE INTO settings VALUES(1,?)').run(JSON.stringify(value));
    return decode<Settings>(this.db.prepare('SELECT data FROM settings WHERE id=1').get()?.data, { mode: 'AUTO', concurrency: 1 });
  }
}
