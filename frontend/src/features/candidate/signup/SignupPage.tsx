import { useState } from 'react';
import { useNavigate, Link } from '@tanstack/react-router';
import { Container, Paper, Title, TextInput, PasswordInput, Button, Text, Alert } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useAuthStore } from '../../../shared/api/useAuth';

export function CandidateSignupPage() {
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const form = useForm({
    initialValues: { firstName: '', lastName: '', email: '', password: '', confirmPassword: '' },
  });

  const handleSubmit = async (values: typeof form.values) => {
    setError('');
    if (values.password !== values.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    try {
      const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';
      const res = await fetch(`${baseUrl}/auth/candidate/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: values.firstName,
          lastName: values.lastName,
          email: values.email,
          password: values.password,
        }),
      });
      if (!res.ok) throw new Error('Signup failed');
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
      setError('Signup failed');
    }
  };

  return (
    <Container size={420} my={40}>
      <Title ta="center">Create your account</Title>
      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        <form onSubmit={form.onSubmit(handleSubmit)}>
          {error && <Alert color="red" mb="md">{error}</Alert>}
          <TextInput label="First name" placeholder="John" required {...form.getInputProps('firstName')} />
          <TextInput label="Last name" placeholder="Doe" required mt="md" {...form.getInputProps('lastName')} />
          <TextInput label="Email" placeholder="you@example.com" required mt="md" {...form.getInputProps('email')} />
          <PasswordInput label="Password" placeholder="Your password" required mt="md" {...form.getInputProps('password')} />
          <PasswordInput label="Confirm password" placeholder="Confirm password" required mt="md" {...form.getInputProps('confirmPassword')} />
          <Button fullWidth mt="xl" type="submit">Create account</Button>
        </form>
        <Text c="dimmed" size="sm" ta="center" mt="md">
          Already have an account? <Link to="/candidate/login">Sign in</Link>
        </Text>
      </Paper>
    </Container>
  );
}
