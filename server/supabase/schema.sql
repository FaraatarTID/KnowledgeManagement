-- AIKB Supabase Schema

-- Organizations
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    name TEXT NOT NULL,
    domain TEXT NOT NULL UNIQUE,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    organization_id UUID REFERENCES organizations (id),
    department TEXT,
    role TEXT,
    security_clearance TEXT DEFAULT 'INTERNAL',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documents
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    drive_file_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    content TEXT,
    summary TEXT,
    category TEXT,
    sensitivity TEXT DEFAULT 'INTERNAL',
    owner_email TEXT,
    ai_accessible BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document Chunks for RAG
CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    document_id UUID REFERENCES documents (id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding_id TEXT, -- Reference to Vertex AI Vector Search ID
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Logs
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    user_email TEXT,
    action TEXT NOT NULL,
    resource_id UUID,
    query TEXT,
    access_granted BOOLEAN,
    metadata JSONB DEFAULT '{}'
);