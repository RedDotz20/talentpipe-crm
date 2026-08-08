import { useState } from 'react';
import { useNavigate, Link } from '@tanstack/react-router';
import { Anchor, Button, PasswordInput, Text, TextInput } from '@mantine/core';
import { useCompanySignup } from '@/hooks/auth';
import { AuthLayout } from './AuthLayout';

export function CompanySignupPage() {
  const [form, setForm] = useState({ companyName: '', slug: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const { mutateAsync: companySignup, isPending } = useCompanySignup();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    try {
      await companySignup({ companyName: form.companyName, slug: form.slug, email: form.email, password: form.password });
      navigate({ to: '/auth/signin' });
    } catch {
      setError('Signup failed');
    }
  };

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <AuthLayout title="Create your company">
      <form onSubmit={handleSubmit}>
        {error && (
          <Text c="red" size="sm" mb="md">
            {error}
          </Text>
        )}
        <TextInput label="Company name" placeholder="Acme Inc" size="md" radius="md" required value={form.companyName} onChange={update('companyName')} />
        <TextInput label="Company slug" placeholder="acme" size="md" radius="md" required mt="md" value={form.slug} onChange={update('slug')} />
        <TextInput label="Email" placeholder="you@company.com" size="md" radius="md" required mt="md" value={form.email} onChange={update('email')} />
        <PasswordInput label="Password" placeholder="Your password" size="md" radius="md" required mt="md" value={form.password} onChange={update('password')} />
        <PasswordInput label="Confirm password" placeholder="Confirm password" size="md" radius="md" required mt="md" value={form.confirmPassword} onChange={update('confirmPassword')} />
        <Button fullWidth mt="xl" size="md" radius="md" type="submit" loading={isPending}>
          Create account
        </Button>
      </form>
      <Text ta="center" mt="md">
        Already have an account?{' '}
        <Anchor component={Link} to="/auth/signin" fw={500}>
          Sign in
        </Anchor>
      </Text>
    </AuthLayout>
  );
}
