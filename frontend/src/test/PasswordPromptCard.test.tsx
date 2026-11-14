import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PasswordPromptCard } from '../components/import/PasswordPromptCard';

describe('PasswordPromptCard', () => {
  it('renders password input and submit button', () => {
    const onPasswordChange = vi.fn();
    const onSubmit = vi.fn();

    render(
      <PasswordPromptCard
        pdfPassword=""
        onPasswordChange={onPasswordChange}
        onSubmit={onSubmit}
        loading={false}
      />
    );

    const input = screen.getByPlaceholderText(/กรอกรหัสผ่าน|Enter password/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'password');

    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toBeDisabled();
  });

  it('triggers onPasswordChange when typing into input', () => {
    const onPasswordChange = vi.fn();
    const onSubmit = vi.fn();

    render(
      <PasswordPromptCard
        pdfPassword=""
        onPasswordChange={onPasswordChange}
        onSubmit={onSubmit}
        loading={false}
      />
    );

    const input = screen.getByPlaceholderText(/กรอกรหัสผ่าน|Enter password/i);
    fireEvent.change(input, { target: { value: 'Secret123' } });

    expect(onPasswordChange).toHaveBeenCalledWith('Secret123');
  });

  it('triggers onSubmit on form submit', () => {
    const onPasswordChange = vi.fn();
    const onSubmit = vi.fn((e) => e.preventDefault());

    render(
      <PasswordPromptCard
        pdfPassword="MyPassword"
        onPasswordChange={onPasswordChange}
        onSubmit={onSubmit}
        loading={false}
      />
    );

    const button = screen.getByRole('button');
    expect(button).not.toBeDisabled();

    fireEvent.click(button);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('disables button when loading is true', () => {
    const onPasswordChange = vi.fn();
    const onSubmit = vi.fn();

    render(
      <PasswordPromptCard
        pdfPassword="MyPassword"
        onPasswordChange={onPasswordChange}
        onSubmit={onSubmit}
        loading={true}
      />
    );

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });
});
