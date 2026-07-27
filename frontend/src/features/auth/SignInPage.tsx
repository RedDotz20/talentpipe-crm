import { useState } from 'react';
import { useNavigate, Link } from '@tanstack/react-router';
import { Container, Paper, Title, TextInput, PasswordInput, Button, Text, Alert } from '@mantine/core';
import { useAuthStore } from '../../shared/api/useAuth';

export function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const signin = useAuthStore((s) => s.signin);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await signin(email, password);
      const role = useAuthStore.getState().role;
      if (role === 'Candidate') {
        navigate({ to: '/dashboard' });
      } else if (role === 'SuperAdmin') {
        navigate({ to: '/admin/tenants' });
      } else {
        navigate({ to: '/org/dashboard' });
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
          <Button fullWidth mt="xl" type="submit">Sign in</Button>
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
