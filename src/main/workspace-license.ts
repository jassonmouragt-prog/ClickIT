import { LICENSED } from '../licensing/types.ts';
import type { LicenseView } from '../licensing/types.ts';
export async function requireWorkspaceLicense(license: { status(): Promise<LicenseView> }): Promise<void> {
  const status = await license.status();
  if (!LICENSED.has(status.state)) throw new Error(status.message ?? 'Licença pendente.');
}
