/**
 * API Authentication Module
 *
 * Provides API key authentication for the API server.
 * Supports multiple API keys with optional metadata.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { ValidationError } from "../scripts/shared/errors";

/**
 * API Key metadata for tracking and audit purposes
 */
export interface ApiKeyMeta {
  /** Human-readable name/identifier for the key */
  name: string;
  /** Optional description of the key's purpose */
  description?: string;
  /** Whether the key is currently active */
  active: boolean;
  /** Creation timestamp */
  createdAt: Date;
}

/**
 * API Key record with hash and metadata
 */
interface ApiKeyRecord {
  /** SHA-256 hash of the API key */
  hash: string;
  /** Metadata about the key */
  meta: ApiKeyMeta;
}

/**
 * Authentication result
 */
export interface AuthResult {
  /** Whether authentication succeeded */
  success: boolean;
  /** API key metadata if authenticated */
  meta?: ApiKeyMeta;
  /** Error message if authentication failed */
  error?: string;
}

/**
 * API Key Authentication class
 *
 * Manages API key validation using bcrypt hashing.
 * Keys are loaded from environment variables in format: API_KEY_<name>
 */
export class ApiKeyAuth {
  private static instance: ApiKeyAuth;
  private apiKeys: Map<string, ApiKeyRecord> = new Map();

  public constructor() {
    this.loadKeysFromEnv();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ApiKeyAuth {
    if (!ApiKeyAuth.instance) {
      ApiKeyAuth.instance = new ApiKeyAuth();
    }
    return ApiKeyAuth.instance;
  }

  /**
   * Load API keys from environment variables
   * Format: API_KEY_<name> = <key value>
   */
  private loadKeysFromEnv(): void {
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith("API_KEY_") && value) {
        const name = key.slice(8); // Remove "API_KEY_" prefix
        this.addKey(name, value, {
          name,
          description: `API key loaded from environment variable ${key}`,
          active: true,
          createdAt: new Date(),
        });
      }
    }
  }

  /**
   * Add an API key (for testing purposes)
   */
  addKey(
    name: string,
    keyValue: string,
    meta: Omit<ApiKeyMeta, "createdAt"> & { createdAt?: Date }
  ): void {
    const hash = this.hashKey(keyValue);
    this.apiKeys.set(hash, {
      hash,
      meta: {
        ...meta,
        createdAt: meta.createdAt ?? new Date(),
      },
    });
  }

  /**
   * Hash function for API keys using SHA-256
   * Returns a cryptographically secure hash with sha256_ prefix
   */
  private hashKey(key: string): string {
    const hash = createHash("sha256").update(key).digest("hex");
    return `sha256_${hash}`;
  }

  /**
   * Verify an API key using timing-safe comparison
   */
  private verifyKey(key: string, hash: string): boolean {
    const computedHash = this.hashKey(key);
    // Both hashes are guaranteed to be the same length (sha256_ + 64 hex chars)
    const hashBuffer = Buffer.from(computedHash);
    const storedBuffer = Buffer.from(hash);

    // Ensure buffers are same length before comparison (defensive check)
    if (hashBuffer.length !== storedBuffer.length) {
      return false;
    }

    return timingSafeEqual(hashBuffer, storedBuffer);
  }

  /**
   * Authenticate a request using an API key from the Authorization header
   *
   * Expected format: "Bearer <api-key>" or "Api-Key <api-key>"
   */
  authenticate(authHeader: string | null): AuthResult {
    // Check if authentication is enabled
    if (!this.isAuthenticationEnabled()) {
      // No keys configured, allow all requests
      return {
        success: true,
        meta: {
          name: "default",
          description: "Authentication disabled - no API keys configured",
          active: true,
          createdAt: new Date(),
        },
      };
    }

    // Check if Authorization header is present
    if (!authHeader) {
      return {
        success: false,
        error:
          "Missing Authorization header. Expected format: 'Bearer <api-key>' or 'Api-Key <api-key>'",
      };
    }

    // Extract the key value
    const key = this.extractKeyFromHeader(authHeader);
    if (!key) {
      return {
        success: false,
        error:
          "Invalid Authorization header format. Expected format: 'Bearer <api-key>' or 'Api-Key <api-key>'",
      };
    }

    // Validate key format (basic check)
    if (key.length < 16) {
      return {
        success: false,
        error:
          "Invalid API key format. Keys must be at least 16 characters long.",
      };
    }

    // Verify the key against all registered keys
    for (const [hash, record] of this.apiKeys.entries()) {
      if (this.verifyKey(key, hash)) {
        if (!record.meta.active) {
          return {
            success: false,
            error: `API key '${record.meta.name}' is inactive.`,
          };
        }
        return {
          success: true,
          meta: record.meta,
        };
      }
    }

    return {
      success: false,
      error: "Invalid API key.",
    };
  }

  /**
   * Extract API key value from Authorization header
   */
  private extractKeyFromHeader(header: string): string | null {
    const parts = header.trim().split(/\s+/);
    if (parts.length !== 2) {
      return null;
    }

    const [scheme, key] = parts;
    if (
      scheme.toLowerCase() === "bearer" ||
      scheme.toLowerCase() === "api-key"
    ) {
      return key;
    }

    return null;
  }

  /**
   * Check if authentication is enabled (at least one API key configured)
   */
  isAuthenticationEnabled(): boolean {
    return this.apiKeys.size > 0;
  }

  /**
   * Get all registered API key metadata (excluding hashes)
   */
  listKeys(): ApiKeyMeta[] {
    return Array.from(this.apiKeys.values()).map((record) => record.meta);
  }

  /**
   * Clear all API keys (for testing purposes)
   */
  clearKeys(): void {
    this.apiKeys.clear();
  }
}

/**
 * Create an authentication error response
 */
export function createAuthErrorResponse(
  message: string,
  statusCode = 401
): Response {
  return new Response(
    JSON.stringify({
      error: message,
      suggestions: [
        "Provide a valid API key in the Authorization header",
        "Use format: 'Authorization: Bearer <api-key>' or 'Authorization: Api-Key <api-key>'",
        "Contact administrator to request API key access",
      ],
    }),
    {
      status: statusCode,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": 'Bearer realm="API", scope="api-access"',
      },
    }
  );
}

/**
 * Authentication middleware for API routes
 */
export function requireAuth(authHeader: string | null): AuthResult {
  const auth = ApiKeyAuth.getInstance();
  return auth.authenticate(authHeader);
}

/**
 * Get the singleton auth instance
 */
export function getAuth(): ApiKeyAuth {
  return ApiKeyAuth.getInstance();
}
