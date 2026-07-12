import type { ToolParam, ToolSchema } from './ToolRegistry';
import type { AgentError } from '../agent/AgentTypes';

const MAX_DEPTH = 6;
const MAX_KEYS = 40;
const MAX_STRING = 8000;
const MAX_ARRAY = 50;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const typeOfValue = (value: unknown): string => {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
};

const matchesType = (value: unknown, expected: string): boolean => {
  if (expected === 'integer') {
    return typeof value === 'number' && Number.isInteger(value);
  }
  if (expected === 'number') {
    return typeof value === 'number' && Number.isFinite(value);
  }
  if (expected === 'string') {
    return typeof value === 'string';
  }
  if (expected === 'boolean') {
    return typeof value === 'boolean';
  }
  if (expected === 'object') {
    return isPlainObject(value);
  }
  if (expected === 'array') {
    return Array.isArray(value);
  }
  return true;
};

const validateParam = (
  path: string,
  value: unknown,
  param: ToolParam,
  depth: number,
): AgentError | null => {
  if (depth > MAX_DEPTH) {
    return { code: 'invalid_arguments', message: `Too deep at ${path}` };
  }

  if (!matchesType(value, param.type)) {
    return {
      code: 'invalid_arguments',
      message: `Bad type at ${path}: expected ${param.type}, got ${typeOfValue(value)}`,
    };
  }

  if (param.enum?.length && typeof value === 'string' && !param.enum.includes(value)) {
    return { code: 'invalid_arguments', message: `Bad enum at ${path}` };
  }

  if (typeof value === 'string' && value.length > MAX_STRING) {
    return { code: 'invalid_arguments', message: `String too long at ${path}` };
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY) {
      return { code: 'invalid_arguments', message: `Array too long at ${path}` };
    }
    if (param.items) {
      for (let i = 0; i < value.length; i += 1) {
        const err = validateParam(`${path}[${i}]`, value[i], param.items, depth + 1);
        if (err) {
          return err;
        }
      }
    }
    return null;
  }

  if (isPlainObject(value) && param.type === 'object') {
    const keys = Object.keys(value);
    if (keys.length > MAX_KEYS) {
      return { code: 'invalid_arguments', message: `Too many keys at ${path}` };
    }
    const props = param.properties || {};
    const required = param.required || [];
    for (const key of required) {
      const child = value[key];
      if (child == null || (typeof child === 'string' && !child.trim())) {
        return { code: 'invalid_arguments', message: `Missing ${path}.${key}` };
      }
    }
    for (const key of keys) {
      const childPath = `${path}.${key}`;
      const childSchema = props[key];
      if (!childSchema) {
        if (param.additionalProperties === false || param.additionalProperties == null) {
          return { code: 'invalid_arguments', message: `Unknown field ${childPath}` };
        }
        if (typeof param.additionalProperties === 'object') {
          const err = validateParam(childPath, value[key], param.additionalProperties, depth + 1);
          if (err) {
            return err;
          }
        }
        continue;
      }
      const err = validateParam(childPath, value[key], childSchema, depth + 1);
      if (err) {
        return err;
      }
    }
  }

  return null;
};

export const validateToolArgs = (
  name: string,
  schema: ToolSchema | undefined,
  args: Record<string, unknown>,
): AgentError | null => {
  if (!schema) {
    return null;
  }
  console.log('tool_validate', name);
  const root: ToolParam = {
    type: 'object',
    properties: schema.function.parameters.properties,
    required: schema.function.parameters.required,
    additionalProperties: schema.function.parameters.additionalProperties ?? false,
  };
  return validateParam(name, args, root, 0);
};

export const clampToolResult = (value: string, max = 20000): string => {
  if (value.length <= max) {
    return value;
  }
  console.log('tool_result_clamp', value.length);
  return `${value.slice(0, max)}…[truncated]`;
};
