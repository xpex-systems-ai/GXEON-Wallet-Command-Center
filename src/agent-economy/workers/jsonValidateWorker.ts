export interface JsonValidateInput {
  payload: unknown;
  schema?: {
    type?: string;
    required?: string[];
    properties?: Record<string, { type?: string }>;
  };
}

export interface JsonValidateWorkerOutput {
  valid: boolean;
  errors: string[];
  details: {
    parsedType: string;
    byteLength: number;
    keyCount?: number;
  };
}

export function executeJsonValidateWorker(input: JsonValidateInput): JsonValidateWorkerOutput {
  const errors: string[] = [];
  let parsed: unknown = input.payload;
  let byteLength = 0;

  if (typeof input.payload === 'string') {
    byteLength = Buffer.byteLength(input.payload, 'utf8');
    try {
      parsed = JSON.parse(input.payload);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        valid: false,
        errors: [`Invalid JSON syntax: ${msg}`],
        details: {
          parsedType: 'unparseable_string',
          byteLength,
        },
      };
    }
  } else {
    try {
      byteLength = Buffer.byteLength(JSON.stringify(input.payload ?? null), 'utf8');
    } catch {
      byteLength = 0;
    }
  }

  const parsedType = Array.isArray(parsed) ? 'array' : parsed === null ? 'null' : typeof parsed;
  let keyCount: number | undefined;

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    keyCount = Object.keys(parsed).length;
  }

  // Schema validation
  if (input.schema) {
    const { type, required, properties } = input.schema;

    if (type && type !== parsedType) {
      errors.push(`Type mismatch: expected '${type}', received '${parsedType}'`);
    }

    if (required && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      for (const field of required) {
        if (!(field in obj) || obj[field] === undefined) {
          errors.push(`Missing required field: '${field}'`);
        }
      }
    }

    if (properties && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      for (const [propName, propDef] of Object.entries(properties)) {
        if (propName in obj && obj[propName] !== undefined && propDef.type) {
          const val = obj[propName];
          const valType = Array.isArray(val) ? 'array' : val === null ? 'null' : typeof val;
          if (valType !== propDef.type) {
            errors.push(
              `Property '${propName}' type mismatch: expected '${propDef.type}', received '${valType}'`
            );
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    details: {
      parsedType,
      byteLength,
      keyCount,
    },
  };
}
