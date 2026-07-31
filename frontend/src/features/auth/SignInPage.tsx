import { useState } from 'react';
import type { SubmitEvent } from 'react';
import { useNavigate, Link } from '@tanstack/react-router';
import { Anchor, Button, Checkbox, PasswordInput, Text, TextInput } from '@mantine/core';
import { useSignIn } from '@/hooks/auth';
import { useAuthStore } from '@/api/useAuth';
import { AuthLayout } from './AuthLayout';

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
    <AuthLayout title="Welcome back to TalentPipe!">
      <form onSubmit={handleSubmit}>
        {error && (
          <Text c="red" size="sm" mb="md">
            {error}
          </Text>
        )}
        <TextInput
          label="Email address"
          placeholder="hello@gmail.com"
          size="md"
          radius="md"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <PasswordInput
          label="Password"
          placeholder="Your password"
          mt="md"
          size="md"
          radius="md"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Checkbox label="Keep me logged in" mt="xl" size="md" />
        <Button fullWidth mt="xl" size="md" radius="md" type="submit" loading={isPending}>
          Login
        </Button>
      </form>

      <Text ta="center" mt="md">
        Don&apos;t have an account?{' '}
        <Anchor component={Link} to="/auth/signup" fw={500}>
          Register
        </Anchor>
      </Text>
      <Text ta="center" mt="xs">
        <Anchor component={Link} to="/auth/org/signup" fw={500}>
          Create a company account
        </Anchor>
      </Text>
    </AuthLayout>
  );
}
