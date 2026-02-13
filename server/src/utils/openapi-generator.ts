/**
 * OPENAPI SPEC GENERATION
 * 
 * Generates OpenAPI 3.0 specification for the AIKB API
 * Serves Swagger UI at /api/docs and raw spec at /api/openapi.json
 * 
 * Usage:
 *   import { setupOpenAPI } from './openapi-generator';
 *   setupOpenAPI(app);
 */

import { z } from 'zod';
import type { Express, Request, Response } from 'express';

// ============================================================================
// SCHEMA DEFINITIONS
// ============================================================================

// Auth Schemas
export const LoginRequestSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

export const LoginResponseSchema = z.object({
  token: z.string().describe('JWT authentication token'),
  userId: z.string().uuid('Invalid user ID format'),
  user: z.object({
    id: z.string(),
    email: z.string(),
    role: z.enum(['VIEWER', 'EDITOR', 'MANAGER', 'ADMIN']),
    department: z.string()
  })
});

export const ErrorSchema = z.object({
  error: z.string().describe('Error message'),
  requestId: z.string().describe('Request ID for debugging'),
  statusCode: z.number(),
  timestamp: z.string().datetime()
});

// Document Schemas
export const DocumentSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  uploadedAt: z.string().datetime(),
  uploadedBy: z.string().email(),
  size: z.number().describe('File size in bytes'),
  vectorized: z.boolean().describe('Whether document has been vectorized'),
  driveFileId: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional()
});

export const DocumentListResponseSchema = z.object({
  documents: z.array(DocumentSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  hasMore: z.boolean()
});

// Chat Schemas
export const ChatRequestSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty'),
  context: z.object({
    department: z.string().optional(),
    role: z.enum(['VIEWER', 'EDITOR', 'MANAGER', 'ADMIN']).optional(),
    documentIds: z.array(z.string()).optional()
  }).optional()
});

export const IntegritySchema = z.object({
  verified: z.boolean(),
  score: z.number().min(0).max(1),
  vectorMatchPercentage: z.number(),
  sourceDocuments: z.array(z.object({
    id: z.string(),
    title: z.string(),
    relevanceScore: z.number()
  }))
});

export const ChatResponseSchema = z.object({
  response: z.string(),
  requestId: z.string(),
  integrity: IntegritySchema,
  processingTime: z.number().describe('Processing time in milliseconds'),
  tokensUsed: z.object({
    input: z.number(),
    output: z.number()
  })
});

// ============================================================================
// OPENAPI SPEC TYPES
// ============================================================================

interface OpenAPIParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required: boolean;
  schema: Record<string, any>;
  description?: string;
}

interface OpenAPIResponse {
  description: string;
  content?: {
    'application/json': {
      schema: Record<string, any>;
    };
  };
}

interface OpenAPIOperation {
  summary: string;
  description?: string;
  tags: string[];
  parameters?: OpenAPIParameter[];
  requestBody?: {
    required: boolean;
    content: {
      'application/json': {
        schema: Record<string, any>;
      };
    };
  };
  responses: Record<string, OpenAPIResponse>;
  security?: Array<Record<string, string[]>>;
}

interface OpenAPIPath {
  [method: string]: OpenAPIOperation;
}

interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    description: string;
    version: string;
    contact?: {
      name: string;
      email: string;
    };
  };
  servers: Array<{
    url: string;
    description: string;
  }>;
  paths: Record<string, OpenAPIPath>;
  components: {
    schemas: Record<string, any>;
    securitySchemes: Record<string, any>;
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert Zod schema to JSON Schema
 */
function zodToJsonSchema(schema: any): Record<string, any> {
  // Simplified conversion - in production would use a library like zod-to-json-schema
  const zodType = schema._type;

  switch (zodType) {
    case 'string':
      return {
        type: 'string',
        ...(schema._checks?.find((c: any) => c.kind === 'email') && { format: 'email' }),
        ...(schema._checks?.find((c: any) => c.kind === 'uuid') && { format: 'uuid' }),
        ...(schema._checks?.find((c: any) => c.kind === 'datetime') && { format: 'date-time' }),
        description: schema.description
      };

    case 'number':
      return {
        type: 'number',
        ...(schema._checks?.find((c: any) => c.kind === 'min') && { minimum: schema._checks.find((c: any) => c.kind === 'min').value }),
        ...(schema._checks?.find((c: any) => c.kind === 'max') && { maximum: schema._checks.find((c: any) => c.kind === 'max').value }),
        description: schema.description
      };

    case 'boolean':
      return { type: 'boolean', description: schema.description };

    case 'enum':
      return {
        type: 'string',
        enum: schema.options,
        description: schema.description
      };

    case 'object': {
      const properties: Record<string, any> = {};
      const required: string[] = [];

      if (schema.shape) {
        for (const [key, value] of Object.entries(schema.shape)) {
          properties[key] = zodToJsonSchema(value);
          if (!(value as any)._def?.defaultValue) {
            required.push(key);
          }
        }
      }

      return {
        type: 'object',
        properties,
        ...(required.length > 0 && { required }),
        description: schema.description
      };
    }

    case 'array':
      return {
        type: 'array',
        items: zodToJsonSchema(schema.element),
        description: schema.description
      };

    default:
      return { type: 'string', description: schema.description };
  }
}

// ============================================================================
// OPENAPI SPEC DEFINITION
// ============================================================================

export function generateOpenAPISpec(): OpenAPISpec {
  return {
    openapi: '3.0.0',
    info: {
      title: 'AIKB Knowledge Management API',
      description: 'Secure knowledge management system with RAG capabilities, RBAC, and auditability',
      version: '1.0.0',
      contact: {
        name: 'AIKB Support',
        email: 'support@aikb.example.com'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development'
      },
      {
        url: 'https://api.aikb.example.com',
        description: 'Production'
      }
    ],
    paths: {
      // =====================================================================
      // AUTH ENDPOINTS
      // =====================================================================
      '/auth/login': {
        post: {
          summary: 'User login',
          description: 'Authenticate with email and password. Returns JWT token for subsequent requests.',
          tags: ['Authentication'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: zodToJsonSchema(LoginRequestSchema)
              }
            }
          },
          responses: {
            200: {
              description: 'Login successful',
              content: {
                'application/json': {
                  schema: zodToJsonSchema(LoginResponseSchema)
                }
              }
            },
            401: {
              description: 'Invalid credentials',
              content: {
                'application/json': {
                  schema: zodToJsonSchema(ErrorSchema)
                }
              }
            },
            429: {
              description: 'Too many failed login attempts. Account temporarily locked.'
            }
          }
        }
      },

      '/auth/logout': {
        post: {
          summary: 'User logout',
          tags: ['Authentication'],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: 'Logout successful',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' }
                    }
                  }
                }
              }
            }
          }
        }
      },

      // =====================================================================
      // DOCUMENT ENDPOINTS
      // =====================================================================
      '/documents': {
        get: {
          summary: 'List documents',
          description: 'List all documents accessible to the current user based on RBAC rules',
          tags: ['Documents'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'search',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: 'Search term to filter documents by title or content'
            },
            {
              name: 'limit',
              in: 'query',
              required: false,
              schema: { type: 'number', default: 20 },
              description: 'Number of results to return (max 100)'
            },
            {
              name: 'offset',
              in: 'query',
              required: false,
              schema: { type: 'number', default: 0 },
              description: 'Number of results to skip'
            },
            {
              name: 'department',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: 'Filter by department'
            }
          ],
          responses: {
            200: {
              description: 'List of documents',
              content: {
                'application/json': {
                  schema: zodToJsonSchema(DocumentListResponseSchema)
                }
              }
            }
          }
        }
      },

      '/documents/upload': {
        post: {
          summary: 'Upload document',
          description: 'Upload a new document. File will be vectorized and indexed automatically.',
          tags: ['Documents'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    file: {
                      type: 'string',
                      format: 'binary',
                      description: 'Document file (PDF, DOC, DOCX, TXT)'
                    },
                    title: {
                      type: 'string',
                      description: 'Document title'
                    },
                    department: {
                      type: 'string',
                      description: 'Department or category'
                    }
                  },
                  required: ['file', 'title']
                }
              }
            }
          },
          responses: {
            201: {
              description: 'Document uploaded successfully',
              content: {
                'application/json': {
                  schema: zodToJsonSchema(DocumentSchema)
                }
              }
            },
            400: {
              description: 'Invalid file or missing required fields'
            }
          }
        }
      },

      '/documents/{id}': {
        get: {
          summary: 'Get document details',
          tags: ['Documents'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
              description: 'Document ID'
            }
          ],
          responses: {
            200: {
              description: 'Document details',
              content: {
                'application/json': {
                  schema: zodToJsonSchema(DocumentSchema)
                }
              }
            },
            404: {
              description: 'Document not found'
            }
          }
        },
        delete: {
          summary: 'Delete document',
          description: 'Delete a document. File will be removed from storage and index.',
          tags: ['Documents'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
              description: 'Document ID'
            }
          ],
          responses: {
            200: {
              description: 'Document deleted successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      requestId: { type: 'string' }
                    }
                  }
                }
              }
            },
            404: {
              description: 'Document not found'
            }
          }
        }
      },

      // =====================================================================
      // CHAT ENDPOINTS
      // =====================================================================
      '/query': {
        post: {
          summary: 'Query knowledge base',
          description: 'Submit a natural language query to the knowledge base. Returns AI-generated response with source documents.',
          tags: ['Chat'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: zodToJsonSchema(ChatRequestSchema)
              }
            }
          },
          responses: {
            200: {
              description: 'Query response with integrity verification',
              content: {
                'application/json': {
                  schema: zodToJsonSchema(ChatResponseSchema)
                }
              }
            },
            400: {
              description: 'Invalid request'
            }
          }
        }
      },

      '/chat/history': {
        get: {
          summary: 'Get chat history',
          tags: ['Chat'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'limit',
              in: 'query',
              required: false,
              schema: { type: 'number', default: 50 },
              description: 'Number of messages to retrieve'
            }
          ],
          responses: {
            200: {
              description: 'Chat history',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      messages: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            timestamp: { type: 'string', format: 'date-time' },
                            userMessage: { type: 'string' },
                            aiResponse: { type: 'string' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },

      // =====================================================================
      // ADMIN ENDPOINTS
      // =====================================================================
      '/admin/feature-flags': {
        get: {
          summary: 'List feature flags',
          description: 'Get all feature flags and their current status',
          tags: ['Admin'],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: 'Feature flags list',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      flags: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            enabled: { type: 'boolean' },
                            rolloutPercentage: { type: 'number' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },

      '/admin/feature-flags/{name}': {
        post: {
          summary: 'Update feature flag',
          description: 'Enable/disable a feature flag or adjust rollout percentage',
          tags: ['Admin'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'name',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Feature flag name'
            }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    enabled: { type: 'boolean' },
                    rolloutPercentage: { type: 'number', minimum: 0, maximum: 100 }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Feature flag updated'
            },
            400: {
              description: 'Invalid parameters'
            }
          }
        }
      },

      '/admin/metrics': {
        get: {
          summary: 'Get metrics summary',
          description: 'Get current system metrics (auth timing, cache hit rate, error rate)',
          tags: ['Admin'],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: 'Metrics summary',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      authResponseTime: {
                        type: 'object',
                        properties: {
                          p50: { type: 'number' },
                          p99: { type: 'number' }
                        }
                      },
                      cacheHitRate: { type: 'number' },
                      errorRate: { type: 'number' }
                    }
                  }
                }
              }
            }
          }
        }
      },

      '/health': {
        get: {
          summary: 'Health check',
          description: 'Check if the API is running and all critical services are healthy',
          tags: ['System'],
          responses: {
            200: {
              description: 'Service is healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
                      services: {
                        type: 'object',
                        properties: {
                          database: { type: 'boolean' },
                          vectorDb: { type: 'boolean' },
                          cache: { type: 'boolean' },
                          llm: { type: 'boolean' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },

    components: {
      schemas: {
        LoginRequest: zodToJsonSchema(LoginRequestSchema),
        LoginResponse: zodToJsonSchema(LoginResponseSchema),
        Document: zodToJsonSchema(DocumentSchema),
        DocumentList: zodToJsonSchema(DocumentListResponseSchema),
        ChatRequest: zodToJsonSchema(ChatRequestSchema),
        ChatResponse: zodToJsonSchema(ChatResponseSchema),
        Integrity: zodToJsonSchema(IntegritySchema),
        Error: zodToJsonSchema(ErrorSchema)
      },

      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from /auth/login endpoint'
        }
      }
    }
  };
}

// ============================================================================
// EXPRESS SETUP
// ============================================================================

/**
 * Setup OpenAPI documentation endpoints
 * - Swagger UI at /api/docs
 * - Raw spec at /api/openapi.json
 */
export function setupOpenAPI(app: Express): void {
  const spec = generateOpenAPISpec();

  // Serve raw OpenAPI JSON
  app.get('/api/openapi.json', (_req: Request, res: Response) => {
    res.json(spec);
  });

  // Serve Swagger UI HTML
  app.get('/api/docs', (_req: Request, res: Response) => {
    res.set('Content-Type', 'text/html');
    res.send(swaggerUIHtml(spec));
  });

  console.log('✓ OpenAPI documentation available at:');
  console.log('  - Swagger UI: http://localhost:3000/api/docs');
  console.log('  - Raw spec: http://localhost:3000/api/openapi.json');
}

// ============================================================================
// SWAGGER UI HTML
// ============================================================================

/**
 * Generate Swagger UI HTML page
 */
function swaggerUIHtml(spec: OpenAPISpec): string {
  const specJson = JSON.stringify(spec);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>AIKB API Documentation</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@3/swagger-ui.css">
    <style>
        body {
            margin: 0;
            padding: 0;
            background: #fafafa;
        }
        .topbar {
            background-color: #1976d2;
            padding: 20px;
            color: white;
            text-align: center;
            font-size: 24px;
            font-weight: bold;
        }
        .swagger-container {
            max-width: 1400px;
            margin: 0 auto;
        }
    </style>
</head>
<body>
    <div class="topbar">
        AIKB Knowledge Management API
    </div>
    <div class="swagger-container">
        <div id="swagger-ui"></div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@3/swagger-ui-bundle.js"></script>
    <script>
        window.onload = function() {
            SwaggerUIBundle({
                spec: ${specJson},
                dom_id: '#swagger-ui',
                presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIBundle.SwaggerUIStandalonePreset
                ],
                layout: "BaseLayout",
                deepLinking: true,
                defaultModelsExpandDepth: 1,
                tryItOutEnabled: true
            });
        }
    </script>
</body>
</html>
  `;
}

export default {
  generateOpenAPISpec,
  setupOpenAPI
};
