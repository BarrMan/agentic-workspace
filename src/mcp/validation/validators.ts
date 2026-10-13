/**
 * JSON Schema validator interface
 */
export interface JsonSchema {
	type?: string | string[]; // Optional to allow "any type" schemas; arrays support nullable public schemas
	properties?: Record<string, JsonSchema>;
	required?: string[];
	items?: JsonSchema;
	enum?: string[];
	enumCaseInsensitive?: boolean;
	enumNormalizeWhitespace?: boolean;
	minLength?: number;
	maxLength?: number;
	minimum?: number;
	maximum?: number;
	maxItems?: number;
	additionalProperties?: boolean;
	preserveWhitespace?: boolean;
	description?: string;
	default?: unknown;
}

/**
 * Validation result interface
 */
export interface ValidationResult {
	isValid: boolean;
	errors: string[];
	sanitizedData?: Record<string, unknown>;
}

/**
 * Validates input against a JSON Schema
 */
export function validateInput(input: unknown, schema: JsonSchema): ValidationResult {
	if (typeof input !== "object" || input === null) {
		return {
			isValid: false,
			errors: ["Input must be an object"],
		};
	}

	const data = input as Record<string, unknown>;
	const errors = validateRequiredFields(data, schema.required);
	const sanitizedData = validateProperties(data, schema, errors);
	return {
		isValid: errors.length === 0,
		errors,
		sanitizedData: errors.length === 0 ? sanitizedData : undefined,
	};
}

function validateRequiredFields(data: Record<string, unknown>, required: string[] | undefined): string[] {
	return (required ?? []).flatMap((field) =>
		!(field in data) || data[field] === undefined || data[field] === null
			? [`Required field '${field}' is missing or null`]
			: [],
	);
}

function validateProperties(
	data: Record<string, unknown>,
	schema: JsonSchema,
	errors: string[],
): Record<string, unknown> {
	const sanitizedData: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(data)) {
		const fieldSchema = schema.properties?.[key];
		if (!fieldSchema) {
			if (schema.additionalProperties === false) errors.push(`Unknown field '${key}' is not allowed`);
			continue;
		}

		const fieldResult = validateField(key, value, fieldSchema);
		if (!fieldResult.isValid) {
			errors.push(...fieldResult.errors);
		} else if (fieldResult.sanitizedValue !== undefined) {
			sanitizedData[key] = fieldResult.sanitizedValue;
		}
	}
	return sanitizedData;
}

/**
 * Validates a single field against its schema
 */
function validateField(
	fieldName: string,
	value: unknown,
	schema: JsonSchema,
): { isValid: boolean; errors: string[]; sanitizedValue?: unknown } {
	if (value === undefined || value === null) {
		return { isValid: true, errors: [], sanitizedValue: value };
	}

	// If no type is specified, accept any type
	if (!schema.type) {
		return { isValid: true, errors: [], sanitizedValue: value };
	}

	// Nullable schemas use a JSON Schema type union. Null has already returned above, so
	// validate the value against the union's concrete type.
	const schemaType = concreteSchemaType(schema.type);
	if (!schemaType) {
		return { isValid: false, errors: [`Unknown schema type '${String(schema.type)}' for field '${fieldName}'`] };
	}

	const validator = fieldValidators[schemaType];
	return validator
		? validator(fieldName, value, schema)
		: { isValid: false, errors: [`Unknown schema type '${schemaType}' for field '${fieldName}'`] };
}

const fieldValidators: Record<
	string,
	(fieldName: string, value: unknown, schema: JsonSchema) => FieldValidationResult
> = {
	string: validateString,
	number: validateNumber,
	array: validateArray,
	boolean: (_fieldName, value) => ({
		isValid: true,
		errors: [],
		sanitizedValue: typeof value === "string" ? value.toLowerCase() === "true" : Boolean(value),
	}),
};

type FieldValidationResult = { isValid: boolean; errors: string[]; sanitizedValue?: unknown };

function concreteSchemaType(type: JsonSchema["type"]): string | undefined {
	return Array.isArray(type) ? type.find((entry) => entry !== "null") : type;
}

function validateString(fieldName: string, value: unknown, schema: JsonSchema) {
	if (typeof value !== "string") return { isValid: false, errors: [`Field '${fieldName}' must be a string`] };
	const sanitizedValue =
		schema.preserveWhitespace || fieldName === "separator"
			? sanitizeStringPreserveWhitespace(value)
			: sanitizeString(value);
	const errors = validateStringLength(fieldName, sanitizedValue, schema);
	const canonicalValue = matchEnumValue(sanitizedValue, schema);
	if (schema.enum && canonicalValue === undefined)
		errors.push(`Field '${fieldName}' must be one of: ${schema.enum.join(", ")}`);
	return { isValid: errors.length === 0, errors, sanitizedValue: canonicalValue ?? sanitizedValue };
}

function validateStringLength(fieldName: string, value: string, schema: JsonSchema): string[] {
	const errors: string[] = [];
	if (schema.minLength !== undefined && value.length < schema.minLength)
		errors.push(`Field '${fieldName}' must be at least ${schema.minLength} characters long`);
	if (schema.maxLength !== undefined && value.length > schema.maxLength)
		errors.push(
			`Field '${fieldName}' exceeds maximum length of ${schema.maxLength} characters (${value.length} characters)`,
		);
	return errors;
}

function matchEnumValue(value: string, schema: JsonSchema): string | undefined {
	if (!schema.enum) return value;
	const normalize = (candidate: string) => {
		const withoutWhitespace = schema.enumNormalizeWhitespace ? candidate.replace(/\s+/g, "") : candidate;
		return schema.enumCaseInsensitive ? withoutWhitespace.toLowerCase() : withoutWhitespace;
	};
	return schema.enum.find((option) => normalize(option) === normalize(value));
}

function validateNumber(fieldName: string, value: unknown, schema: JsonSchema) {
	const sanitizedValue = typeof value === "string" ? Number.parseFloat(value) : value;
	if (typeof sanitizedValue !== "number" || Number.isNaN(sanitizedValue))
		return { isValid: false, errors: [`Field '${fieldName}' must be a number`] };
	const errors: string[] = [];
	if (schema.minimum !== undefined && sanitizedValue < schema.minimum)
		errors.push(`Field '${fieldName}' must be at least ${schema.minimum}`);
	if (schema.maximum !== undefined && sanitizedValue > schema.maximum)
		errors.push(`Field '${fieldName}' must be at most ${schema.maximum}`);
	return { isValid: errors.length === 0, errors, sanitizedValue };
}

function validateArray(fieldName: string, value: unknown, schema: JsonSchema) {
	if (!Array.isArray(value)) return { isValid: false, errors: [`Field '${fieldName}' must be an array`] };
	const errors =
		schema.maxItems !== undefined && value.length > schema.maxItems
			? [`Field '${fieldName}' must have at most ${schema.maxItems} items`]
			: [];
	const sanitizedValue = schema.items
		? value.flatMap((item, index) => {
				const result = validateField(`${fieldName}[${index}]`, item, schema.items as JsonSchema);
				if (!result.isValid) errors.push(...result.errors);
				return result.isValid && result.sanitizedValue !== undefined ? [result.sanitizedValue] : [];
			})
		: [];
	return { isValid: errors.length === 0, errors, sanitizedValue };
}

/**
 * Sanitizes string input to prevent various injection attacks
 */
function sanitizeString(input: string): string {
	if (typeof input !== "string") {
		return String(input);
	}

	// Remove null bytes
	let sanitized = input.replace(/\0/g, "");

	// Trim whitespace
	sanitized = sanitized.trim();

	// Normalize line endings
	sanitized = sanitized.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

	return sanitized;
}

function sanitizeStringPreserveWhitespace(input: string): string {
	if (typeof input !== "string") {
		return String(input);
	}

	return input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
