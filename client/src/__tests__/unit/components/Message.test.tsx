import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { Message } from '@/components/Message';

describe('Message Component', () => {
  const createMockMsg = (overrides = {}) => ({
    id: '1',
    role: 'user',
    content: 'test content',
    timestamp: new Date(),
    ...overrides
  });

  it('renders user message correctly', () => {
    const msg = createMockMsg({ role: 'user', content: 'User question' });
    render(<Message msg={msg as any} />);
    expect(screen.getByText('User question')).toBeInTheDocument();
  });

  it('renders assistant message correctly', () => {
    const msg = createMockMsg({ role: 'assistant', content: 'AI Response' });
    render(<Message msg={msg as any} />);
    expect(screen.getByText('AI Response')).toBeInTheDocument();
  });

  it('renders sources if provided', () => {
    const msg = createMockMsg({ 
        role: 'assistant', 
        sources: [{ id: '1', title: 'Doc A' }, { id: '2', title: 'Doc B' }] 
    });
    render(<Message msg={msg as any} />);
    
    expect(screen.getByText('Doc A')).toBeInTheDocument();
    expect(screen.getByText('Doc B')).toBeInTheDocument();
  });

  it('displays formatted timestamp', () => {
    const date = new Date();
    date.setHours(12, 0, 0);
    const msg = createMockMsg({ timestamp: date });
    render(<Message msg={msg as any} />);
    expect(screen.getByText(/12:00/)).toBeInTheDocument();
  });
});
