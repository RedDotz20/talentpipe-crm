import { useState } from 'react';
import type { SubmitEvent } from 'react';
import { useNavigate, Link } from '@tanstack/react-router';
import { Container, Paper, Title, TextInput, PasswordInput, Button, Text, Alert } from '@mantine/core';
import { useSignIn } from '@/hooks/auth';
import { useAuthStore } from '@/api/useAuth';

export function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { mutateAsync: signin, isPending } = useSignIn();
  const navigate = useNavigate();
  const getAuthState = useAuthStore.getState;

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    setError('');
    try {
      await signin({ email, password });
      const currentRole = getAuthState().role;
      if (currentRole === 'Candidate') {
        await navigate({to: '/dashboard'});
      } else if (currentRole === 'SuperAdmin') {
        await navigate({ to: '/admin/tenants' });
      } else {
        await navigate({ to: '/org/dashboard' });
      }
    } catch {
      setError('Invalid email or password');
    }
  };

  return (
    <Container size={420} my={40}>
      <Title ta="center">Welcome back</Title>
      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        <form onSubmit={handleSubmit}>
          {error && <Alert color="red" mb="md">{error}</Alert>}
          <TextInput label="Email" placeholder="you@company.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <PasswordInput label="Password" placeholder="Your password" required mt="md" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button fullWidth mt="xl" type="submit" loading={isPending}>Sign in</Button>
        </form>
        <Text c="dimmed" size="sm" ta="center" mt="md">
          Don't have an account? <Link to="/auth/signup">Sign up as candidate</Link>
        </Text>
        <Text c="dimmed" size="sm" ta="center" mt="xs">
          <Link to="/auth/org/signup">Create a company account</Link>
        </Text>
      </Paper>
    </Container>
  );
}
