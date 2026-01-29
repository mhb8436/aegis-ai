import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import pino from 'pino';
import type { AgentPermissionConfig, ToolPermission, ToolRestriction } from '@aegis/common';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

interface RawYamlAgentPermission {
  version: string;
  tools: Array<{
    name: string;
    allowed: boolean;
    restrictions?: Array<Record<string, unknown>>;
    rateLimit?: string;
    whitelist?: string[];
    blacklist?: string[];
  }>;
}

export const loadAgentPermissions = (rulesDir: string): AgentPermissionConfig => {
  const filePath = path.join(rulesDir, 'agent-permissions.yaml');
  if (!fs.existsSync(filePath)) {
    logger.warn('agent-permissions.yaml not found, using empty permission set');
    return { version: '1.0', tools: [] };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = yaml.load(content) as RawYamlAgentPermission;

  const tools: ToolPermission[] = parsed.tools.map((t) => ({
    name: t.name,
    allowed: t.allowed,
    restrictions: t.restrictions as ToolRestriction[] | undefined,
    rateLimit: t.rateLimit,
    whitelist: t.whitelist,
    blacklist: t.blacklist,
  }));

  logger.info(`Loaded ${tools.length} agent tool permissions`);
  return { version: parsed.version, tools };
};
