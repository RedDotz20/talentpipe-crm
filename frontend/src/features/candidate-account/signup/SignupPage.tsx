import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Anchor, Button, PasswordInput, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useCandidateSignup } from '@/hooks/auth';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { getSafeCareerReturnTo } from '@/features/auth/returnTo';

interface CandidateSignupPageProps {
  returnTo?: string;
}

export function CandidateSignupPage({ returnTo }: CandidateSignupPageProps) {
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { mutateAsync: candidateSignup, isPending } = useCandidateSignup();
  const safeReturnTo = getSafeCareerReturnTo(returnTo);

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
      await candidateSignup({
        firstName: values.firstName!,
        lastName: values.lastName!,
        email: values.email!,
        password: values.password!,
      });
      if (safeReturnTo) {
        window.location.assign(safeReturnTo);
      } else {
        navigate({ to: '/dashboard' });
      }
    } catch (err) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(message ?? 'Signup failed');
    }
  };

  return (
    <AuthLayout title="Create your account">
      <form onSubmit={form.onSubmit(handleSubmit)}>
        {error && (
          <Text c="red" size="sm" mb="md">
            {error}
          </Text>
        )}
        <TextInput label="First name" placeholder="John" size="md" radius="md" required {...form.getInputProps('firstName')} />
        <TextInput label="Last name" placeholder="Doe" size="md" radius="md" required mt="md" {...form.getInputProps('lastName')} />
        <TextInput label="Email" placeholder="you@example.com" size="md" radius="md" required mt="md" {...form.getInputProps('email')} />
        <PasswordInput label="Password" placeholder="Your password" size="md" radius="md" required mt="md" {...form.getInputProps('password')} />
        <PasswordInput label="Confirm password" placeholder="Confirm password" size="md" radius="md" required mt="md" {...form.getInputProps('confirmPassword')} />
        <Button fullWidth mt="xl" size="md" radius="md" type="submit" loading={isPending}>
          Create account
        </Button>
      </form>
      <Text ta="center" mt="md">
        Already have an account?{' '}
        <Anchor
          href={
            safeReturnTo
              ? `/auth/signin?returnTo=${encodeURIComponent(safeReturnTo)}`
              : '/auth/signin'
          }
          fw={500}
        >
          Sign in
        </Anchor>
      </Text>
    </AuthLayout>
  );
}
