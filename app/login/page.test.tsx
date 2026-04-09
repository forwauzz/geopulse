import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

vi.mock('./login-form', () => ({
  LoginForm: (props: { nextPath: string; isSignUp?: boolean; bundleKey?: string }) =>
    React.createElement('div', {
      'data-testid': 'login-form',
      'data-next': props.nextPath,
      'data-signup': props.isSignUp ? 'true' : 'false',
      'data-bundle': props.bundleKey ?? '',
    }),
}));

describe('LoginPage', () => {
  it('renders a single sign-up shell with sign-in escape hatch for pricing-tier signup', async () => {
    const { default: LoginPage } = await import('./page');
    const html = renderToStaticMarkup(
      await LoginPage({
        searchParams: Promise.resolve({
          mode: 'signup',
          next: '/pricing',
          bundle: 'agency_core',
        }),
      }),
    );

    expect(html).toContain('Create your account');
    expect(html).toContain('Or sign in');
    expect(html).toContain('data-testid="login-form"');
    expect(html).toContain('data-signup="true"');
    expect(html).toContain('data-bundle="agency_core"');
  });
});
