import { useState } from 'react';
import { useNavigate, Link } from '@tanstack/react-router';
import { Container, Paper, Title, TextInput, PasswordInput, Button, Text, Alert } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useAuthStore } from '../../../shared/api/useAuth';

export function CandidateLoginPage() {
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const form = useForm({
    initialValues: { email: '', password: '' },
  });

  const handleSubmit = async (values: { email: string; password: string }) => {
    setError('');
    try {
      const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';
      const res = await fetch(`${baseUrl}/auth/candidate/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error('Login failed');
      const data = await res.json();
      const payload = JSON.parse(atob(data.accessToken.split('.')[1]));
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('userId', payload.sub);
      localStorage.removeItem('tenantId');
      localStorage.setItem('role', payload.role);
      useAuthStore.setState({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        userId: payload.sub,
        tenantId: null,
        role: payload.role,
      });
      navigate({ to: '/candidate/dashboard' });
    } catch {
      setError('Invalid email or password');
    }
  };

  return (
    <Container size={420} my={40}>
      <Title ta="center">Candidate Sign In</Title>
      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        <form onSubmit={form.onSubmit(handleSubmit)}>
          {error && <Alert color="red" mb="md">{error}</Alert>}
          <TextInput label="Email" placeholder="you@example.com" required {...form.getInputProps('email')} />
          <PasswordInput label="Password" placeholder="Your password" required mt="md" {...form.getInputProps('password')} />
          <Button fullWidth mt="xl" type="submit">Sign in</Button>
        </form>
        <Text c="dimmed" size="sm" ta="center" mt="md">
          Don't have an account? <Link to="/candidate/signup">Sign up</Link>
        </Text>
      </Paper>
    </Container>
  );
}
