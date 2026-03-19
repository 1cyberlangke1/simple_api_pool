declare module "node-cron" {
  export interface ScheduledTask {
    start(): void;
    stop(): void;
  }

  export function schedule(
    expression: string,
    func: () => void,
    options?: {
      scheduled?: boolean;
      timezone?: string;
    }
  ): ScheduledTask;
}

declare module "json-schema" {
  export interface JSONSchema7 {
    $id?: string;
    $schema?: string;
    $ref?: string;
    type?: string | string[];
    title?: string;
    description?: string;
    default?: unknown;
    multipleOf?: number;
    maximum?: number;
    exclusiveMaximum?: boolean | number;
    minimum?: number;
    exclusiveMinimum?: boolean | number;
    maxLength?: number;
    minLength?: number;
    pattern?: string;
    additionalItems?: boolean | JSONSchema7;
    items?: JSONSchema7 | JSONSchema7[];
    maxItems?: number;
    minItems?: number;
    uniqueItems?: boolean;
    maxProperties?: number;
    minProperties?: number;
    required?: string[];
    additionalProperties?: boolean | JSONSchema7;
    definitions?: Record<string, JSONSchema7>;
    properties?: Record<string, JSONSchema7>;
    patternProperties?: Record<string, JSONSchema7>;
    dependencies?: Record<string, JSONSchema7 | string[]>;
    enum?: unknown[];
    const?: unknown;
    allOf?: JSONSchema7[];
    anyOf?: JSONSchema7[];
    oneOf?: JSONSchema7[];
    not?: JSONSchema7;
  }
}