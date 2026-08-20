import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { permissionPresets, users } from '@/database/schema';
import { BaseRepository } from '@/repositories/base.repository';
import { ROLE_PERMISSIONS } from '@/common/permissions/permissions';

export interface PermissionPresetRow {
  id: string;
  name: string;
  role: string;
  permissions: string[];
  isDefault: boolean;
  isEnabled: boolean;
  createdBy: string | null;
  createdAt: Date;
}

export interface ResolveParams {
  presetPermissions: string[] | null;
  presetGlobalPermissions: string[] | null;
  role: string;
}

export function resolveEffectivePermissions(params: ResolveParams): string[] {
  const source =
    params.presetPermissions ??
    params.presetGlobalPermissions ??
    ROLE_PERMISSIONS[params.role as keyof typeof ROLE_PERMISSIONS] ??
    [];
  return [...new Set(source)];
}

// jsonb column types as unknown; the app contract stores string[].
function toPresetRow(
  row: typeof permissionPresets.$inferSelect,
): PermissionPresetRow {
  return { ...row, permissions: row.permissions as string[] };
}

@Injectable()
export class PermissionRepository extends BaseRepository {
  async findDefaults(): Promise<PermissionPresetRow[]> {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(permissionPresets)
        .where(eq(permissionPresets.isDefault, true))
        .orderBy(permissionPresets.role)
        .execute();
      return rows.map(toPresetRow);
    });
  }

  async findAll(schema: string): Promise<PermissionPresetRow[]> {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select()
        .from(permissionPresets)
        .where(eq(permissionPresets.isDefault, false))
        .orderBy(permissionPresets.name)
        .execute();
      return rows.map(toPresetRow);
    });
  }

  async findById(
    id: string,
    schema: string,
  ): Promise<PermissionPresetRow | null> {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select()
        .from(permissionPresets)
        .where(eq(permissionPresets.id, id))
        .execute();
      return rows.map(toPresetRow)[0] ?? null;
    });
  }

  async findByName(
    name: string,
    schema: string,
  ): Promise<PermissionPresetRow | null> {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select()
        .from(permissionPresets)
        .where(sql`lower(${permissionPresets.name}) = lower(${name})`)
        .limit(1)
        .execute();
      return rows.map(toPresetRow)[0] ?? null;
    });
  }

  async create(
    data: {
      name: string;
      role: string;
      permissions: string[];
      isDefault?: boolean;
      createdBy?: string;
    },
    schema: string,
  ): Promise<PermissionPresetRow> {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .insert(permissionPresets)
        .values({
          name: data.name,
          role: data.role,
          permissions: data.permissions,
          isDefault: data.isDefault ?? false,
          createdBy: data.createdBy ?? null,
        })
        .returning()
        .execute();
      return toPresetRow(rows[0]);
    });
  }

  async update(
    id: string,
    data: { name?: string; permissions?: string[] },
    schema: string,
  ): Promise<PermissionPresetRow | null> {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .update(permissionPresets)
        .set({
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.permissions !== undefined
            ? { permissions: data.permissions }
            : {}),
        })
        .where(eq(permissionPresets.id, id))
        .returning()
        .execute();
      return rows.map(toPresetRow)[0] ?? null;
    });
  }

  async remove(id: string, schema: string): Promise<void> {
    return this.withDb(schema, async (db) => {
      await db
        .delete(permissionPresets)
        .where(eq(permissionPresets.id, id))
        .execute();
    });
  }

  async setEnabled(
    id: string,
    enabled: boolean,
    schema: string,
  ): Promise<PermissionPresetRow | null> {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .update(permissionPresets)
        .set({ isEnabled: enabled })
        .where(eq(permissionPresets.id, id))
        .returning()
        .execute();
      return rows[0] ? toPresetRow(rows[0]) : null;
    });
  }

  async countUsersWithPreset(
    presetId: string,
    schema: string,
  ): Promise<number> {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(users)
        .where(eq(users.presetId, presetId))
        .execute();
      return rows[0]?.n ?? 0;
    });
  }

  async findEffectivePermissions(
    userId: string,
    schema: string,
  ): Promise<string[]> {
    const row = await this.withDb(schema, async (db) => {
      const rows = await db
        .select({
          presetId: users.presetId,
          role: users.role,
          presetPermissions: permissionPresets.permissions,
        })
        .from(users)
        .leftJoin(permissionPresets, eq(permissionPresets.id, users.presetId))
        .where(eq(users.id, userId))
        .execute();
      return rows[0] ?? null;
    });
    if (!row) return [];

    let globalPermissions: string[] | null = null;
    if (row.presetId && !row.presetPermissions) {
      const global = await this.findById(row.presetId, 'public');
      globalPermissions = global?.permissions ?? null;
    }

    return resolveEffectivePermissions({
      presetPermissions: (row.presetPermissions ?? null) as unknown as
        string[] | null,
      presetGlobalPermissions: globalPermissions,
      role: row.role,
    });
  }
}
