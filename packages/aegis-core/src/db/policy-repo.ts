import type pg from 'pg';
import type { PolicyRule } from '@aegis/common';

export interface PolicyRepo {
  findAll(): Promise<PolicyRule[]>;
  create(rule: PolicyRule): Promise<void>;
  update(id: string, updates: Partial<PolicyRule>): Promise<PolicyRule | null>;
  remove(id: string): Promise<boolean>;
}

export const createPolicyRepo = (pool: pg.Pool): PolicyRepo => ({
  async findAll(): Promise<PolicyRule[]> {
    const { rows } = await pool.query(
      'SELECT * FROM detection_rules ORDER BY priority DESC',
    );
    return rows.map(mapRow);
  },

  async create(rule: PolicyRule): Promise<void> {
    await pool.query(
      `INSERT INTO detection_rules (id, name, description, category, severity, action, is_active, priority, patterns)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        rule.id,
        rule.name,
        rule.description,
        rule.category,
        rule.severity,
        rule.action,
        rule.isActive,
        rule.priority,
        JSON.stringify(rule.patterns),
      ],
    );
  },

  async update(id: string, updates: Partial<PolicyRule>): Promise<PolicyRule | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (updates.name !== undefined) { fields.push(`name = $${idx++}`); values.push(updates.name); }
    if (updates.description !== undefined) { fields.push(`description = $${idx++}`); values.push(updates.description); }
    if (updates.category !== undefined) { fields.push(`category = $${idx++}`); values.push(updates.category); }
    if (updates.severity !== undefined) { fields.push(`severity = $${idx++}`); values.push(updates.severity); }
    if (updates.action !== undefined) { fields.push(`action = $${idx++}`); values.push(updates.action); }
    if (updates.isActive !== undefined) { fields.push(`is_active = $${idx++}`); values.push(updates.isActive); }
    if (updates.priority !== undefined) { fields.push(`priority = $${idx++}`); values.push(updates.priority); }
    if (updates.patterns !== undefined) { fields.push(`patterns = $${idx++}`); values.push(JSON.stringify(updates.patterns)); }

    if (fields.length === 0) return null;

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const { rows } = await pool.query(
      `UPDATE detection_rules SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );

    return rows.length > 0 ? mapRow(rows[0]) : null;
  },

  async remove(id: string): Promise<boolean> {
    const { rowCount } = await pool.query(
      'DELETE FROM detection_rules WHERE id = $1',
      [id],
    );
    return (rowCount ?? 0) > 0;
  },
});

const mapRow = (row: Record<string, unknown>): PolicyRule => ({
  id: row.id as string,
  name: row.name as string,
  description: (row.description as string) ?? '',
  category: row.category as PolicyRule['category'],
  severity: row.severity as PolicyRule['severity'],
  action: row.action as PolicyRule['action'],
  isActive: row.is_active as boolean,
  priority: row.priority as number,
  patterns: typeof row.patterns === 'string'
    ? JSON.parse(row.patterns)
    : (row.patterns as PolicyRule['patterns']) ?? [],
});
