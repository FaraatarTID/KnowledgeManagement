import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatInput } from '@/components/ChatInput';

describe('ChatInput Component', () => {
  const mockOnSend = vi.fn();
  const mockOnChange = vi.fn();

  beforeEach(() => {
    mockOnSend.mockClear();
    mockOnChange.mockClear();
  });

  it('renders input field and button', () => {
    render(<ChatInput value="" onChange={mockOnChange} onSend={mockOnSend} isLoading={false} />);
    expect(screen.getByPlaceholderText(/Ask me anything/i)).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('calls onChange when input updates', () => {
    render(<ChatInput value="" onChange={mockOnChange} onSend={mockOnSend} isLoading={false} />);
    const input = screen.getByPlaceholderText(/Ask me anything/i);
    fireEvent.change(input, { target: { value: 'Hello' } });
    expect(mockOnChange).toHaveBeenCalledWith('Hello');
  });

  it('calls onSend when button clicked', () => {
    render(<ChatInput value="Hello" onChange={mockOnChange} onSend={mockOnSend} isLoading={false} />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(mockOnSend).toHaveBeenCalled();
  });

  it('calls onSend when Enter pressed', () => {
    render(<ChatInput value="Hello" onChange={mockOnChange} onSend={mockOnSend} isLoading={false} />);
    const input = screen.getByPlaceholderText(/Ask me anything/i);

    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 });
    expect(mockOnSend).toHaveBeenCalled();
  });

  it('disables input and button when loading', () => {
    render(<ChatInput value="Hi" onChange={mockOnChange} onSend={mockOnSend} isLoading={true} />);
    const input = screen.getByPlaceholderText(/Ask me anything/i);
    const button = screen.getByRole('button');

    expect(input).toBeDisabled();
    expect(button).toBeDisabled();
  });
});
