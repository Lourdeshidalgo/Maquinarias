// El middleware inyecta la empresa y el usuario activos como headers en cada
// request a las rutas /api/tenant/*. Estos helpers los leen, así no repetimos
// la misma lógica en los ~25 endpoints.
//
// Aceptamos cualquier objeto con `headers` (Request o NextRequest) en lugar de
// exigir NextRequest: algunas rutas reciben un Request plano.

type WithHeaders = { headers: { get(name: string): string | null } };

/** Empresa (tenant) activa. Si falta el header, el request es inválido. */
export function getTenantId(req: WithHeaders): string {
  const empresaId = req.headers.get('x-empresa-id');
  if (!empresaId) {
    throw new Error('Tenant context is missing.');
  }
  return empresaId;
}

/** Usuario activo, o null si el header no vino (ej. rutas públicas de la empresa). */
export function getUserId(req: WithHeaders): string | null {
  return req.headers.get('x-user-id');
}

/** Usuario activo. Lanza error si falta: usar en rutas que exigen un usuario. */
export function requireUserId(req: WithHeaders): string {
  const userId = req.headers.get('x-user-id');
  if (!userId) {
    throw new Error('User context is missing.');
  }
  return userId;
}
