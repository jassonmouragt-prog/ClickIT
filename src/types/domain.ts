export type Decision = 'UNDECIDED' | 'AI_SELECTED' | 'SELECTED' | 'REVIEW' | 'REJECTED';
import type { LicenseView } from '../licensing/types.ts';
import type { EditingProfile, EditingProfileInput, EditingPlanView, PlanScope, ReferenceImage } from '../editing/types.ts';
import type { ReferenceView } from '../editing/references.ts';
export { type LicenseView };
export type ProjectStatus = 'NEW' | 'INDEXING' | 'ANALYZING' | 'INTERRUPTED' | 'READY';
export interface Project { id: string; name: string; sourcePath: string; createdAt: string; updatedAt: string; status: ProjectStatus; count: number; analyzed: number; failed: number }
export interface Metadata { camera?: string; lens?: string; iso?: number; aperture?: number; shutterSpeed?: string; focalLength?: string }
export interface Face { x: number; y: number; width: number; height: number; sharpness: number; eyes: 'OPEN' | 'CLOSED' | 'UNCERTAIN'; eyesConfidence?: number; leftEyeScore?: number | null; rightEyeScore?: number | null; leftEyeState?: 'OPEN' | 'CLOSED' | 'UNCERTAIN'; rightEyeState?: 'OPEN' | 'CLOSED' | 'UNCERTAIN'; blinkLeft: number; blinkRight: number }
export interface Analysis {
  version: string; sharpness: number; regionalSharpness: number; exposure: number;
  faceScore: number | null; eyesScore: number | null; aestheticScore: null;
  overall: number; blur: 'CLEAR' | 'DOF_POSSIBLE' | 'POSSIBLE_BLUR' | 'UNCERTAIN';
  confidence: number; faces: Face[]; facesAvailable: boolean;
  embeddingAvailable: boolean; insight: string;
}
export interface Photo {
  id: string; projectId: string; originalPath: string; fileName: string; extension: string;
  fileSize: number; mtime: number; width: number; height: number; captureDate: string | null;
  thumbnailPath: string | null; previewPath: string | null; analysisStatus: 'PENDING' | 'DONE' | 'FAILED';
  metadata: Metadata; analysis: Analysis | null; decision: Decision; source: 'AI' | 'USER';
  rating: number; favorite: boolean; keep: boolean; groupId: string | null; rank: number | null;
  similarity: number | null; duplicate: boolean; error: string | null;
}
export interface Progress { projectId: string; kind: 'INDEX' | 'PREVIEW' | 'ANALYSIS' | 'EXPORT'; stage: string; done: number; total: number; failed: number; active: boolean; error?: string }
export interface Settings { mode: 'AUTO' | 'ECO' | 'BALANCED' | 'PERFORMANCE'; concurrency: number }
export interface SystemInfo { cpu: string; cores: number; ramGB: number; gpu: string; recommendedWorkers: number; embeddingModel: boolean; faceModel: boolean; version: string }
export interface DecisionPatch { status?: Decision; rating?: number; favorite?: boolean; keep?: boolean }
export interface FaceJob { id: string; url: string }
export interface FaceReply { id: string; faces: Face[]; error?: string }
export interface ExportResult { copied: number; total: number; cancelled: boolean; destination: string | null; errors: string[] }
export interface ClickITApi {
  editingProfiles(): Promise<EditingProfile[]>;
  editingProfile(id: string): Promise<EditingProfile>;
  createEditingProfile(input: EditingProfileInput): Promise<EditingProfile>;
  updateEditingProfile(id: string, input: EditingProfileInput): Promise<EditingProfile>;
  deleteEditingProfile(id: string): Promise<void>;
  duplicateEditingProfile(id: string): Promise<EditingProfile>;
editingReferences(profileId?: string): Promise<ReferenceView[]>;
  addEditingReference(profileId: string, mode: 'REFERENCE' | 'PAIR'): Promise<ReferenceImage[]>;
  removeEditingReference(id: string): Promise<void>;
  editingPlans(profileId?: string): Promise<EditingPlanView[]>;
  generateEditingPlans(profileId: string, scope: PlanScope): Promise<{ generated: EditingPlanView[]; skipped: { photoId: string; reason: string }[] }>;
  editingPlan(id: string): Promise<EditingPlanView>;
  deleteEditingPlan(id: string): Promise<void>;
  projects(): Promise<Project[]>; create(name: string): Promise<Project | null>;
  photos(projectId: string): Promise<Photo[]>; index(projectId: string): Promise<void>;
  analyze(projectId: string): Promise<void>; cancel(): Promise<void>;
  decide(photoId: string, patch: DecisionPatch): Promise<void>;
  export(projectId: string, mode: 'COPY' | 'LIST'): Promise<ExportResult>;
  system(): Promise<SystemInfo>; settings(value?: Settings): Promise<Settings>;
  progress(): Promise<Progress | null>; onProgress(callback: (p: Progress) => void): () => void;
  onFaceJob(callback: (job: FaceJob) => void): () => void; faceReply(reply: FaceReply): void;
  diagnostic(event: string, details: Record<string, string | number>): void;
  faceReady(): void;
  licenseStatus(): Promise<LicenseView>;
  activateLicense(key: string): Promise<LicenseView>;
  deactivateLicense(): Promise<LicenseView>;
}
declare global { interface Window { clickit: ClickITApi } }
