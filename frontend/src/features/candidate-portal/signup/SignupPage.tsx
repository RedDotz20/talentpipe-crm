import { useState } from 'react';
import { useNavigate, Link } from '@tanstack/react-router';
import { Container, Paper, Title, TextInput, PasswordInput, Button, Text, Alert } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useCandidateSignup } from '../../../hooks/auth';

export function CandidateSignupPage() {
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { mutateAsync: candidateSignup, isPending } = useCandidateSignup();

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
      navigate({ to: '/dashboard' });
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
          <Button fullWidth mt="xl" type="submit" loading={isPending}>Create account</Button>
        </form>
        <Text c="dimmed" size="sm" ta="center" mt="md">
          Already have an account? <Link to="/auth/signin">Sign in</Link>
        </Text>
      </Paper>
    </Container>
  );
}
