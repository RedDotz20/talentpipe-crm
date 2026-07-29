import { useState } from 'react';
import { useNavigate, Link } from '@tanstack/react-router';
import { Container, Paper, Title, TextInput, PasswordInput, Button, Text, Alert } from '@mantine/core';
import { useOrgSignup } from '../../hooks/auth';

export function OrgSignupPage() {
  const [form, setForm] = useState({ companyName: '', slug: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const { mutateAsync: orgSignup, isPending } = useOrgSignup();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    try {
      await orgSignup({ companyName: form.companyName, slug: form.slug, email: form.email, password: form.password });
      navigate({ to: '/auth/signin' });
    } catch {
      setError('Signup failed');
    }
  };

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <Container size={420} my={40}>
      <Title ta="center">Create your company</Title>
      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        <form onSubmit={handleSubmit}>
          {error && <Alert color="red" mb="md">{error}</Alert>}
          <TextInput label="Company name" placeholder="Acme Inc" required value={form.companyName} onChange={update('companyName')} />
          <TextInput label="Company slug" placeholder="acme" required mt="md" value={form.slug} onChange={update('slug')} />
          <TextInput label="Email" placeholder="you@company.com" required mt="md" value={form.email} onChange={update('email')} />
          <PasswordInput label="Password" placeholder="Your password" required mt="md" value={form.password} onChange={update('password')} />
          <PasswordInput label="Confirm password" placeholder="Confirm password" required mt="md" value={form.confirmPassword} onChange={update('confirmPassword')} />
          <Button fullWidth mt="xl" type="submit" loading={isPending}>Create account</Button>
        </form>
        <Text c="dimmed" size="sm" ta="center" mt="md">
          Already have an account? <Link to="/auth/signin">Sign in</Link>
        </Text>
      </Paper>
    </Container>
  );
}
