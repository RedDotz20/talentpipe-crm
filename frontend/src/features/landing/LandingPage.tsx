import { useEffect, useState, type ReactNode } from 'react';
import {
  Anchor,
  Badge,
  Button,
  Card,
  Container,
  Group,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Transition,
} from '@mantine/core';
import {
  IconBriefcase,
  IconChartBar,
  IconClipboardList,
  IconFileText,
  IconLayoutKanban,
  IconUsers,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';

const FEATURES = [
  {
    icon: IconBriefcase,
    title: 'Job postings',
    description:
      'Create, publish, and close job postings with employment type, location, and work setup metadata.',
  },
  {
    icon: IconLayoutKanban,
    title: 'Pipeline kanban',
    description:
      'Move candidates through custom pipeline stages with drag-and-drop and collaborate in real time.',
  },
  {
    icon: IconFileText,
    title: 'Resume & skill match',
    description:
      'Parse resumes and score candidates against required skills on application.',
  },
  {
    icon: IconClipboardList,
    title: 'Interviews & feedback',
    description:
      'Schedule interviews with timezone support and capture structured 1:1 feedback.',
  },
  {
    icon: IconChartBar,
    title: 'Analytics dashboards',
    description:
      'Track applications over time, top jobs, interview outcomes, and rejection rates.',
  },
  {
    icon: IconUsers,
    title: 'Multi-company platform',
    description:
      'Isolated workspaces per company, role-based access, and CSV export for every admin table.',
  },
];

function FadeUp({ delay = 0, children }: { delay?: number; children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);
  return (
    <Transition mounted={mounted} transition="fade-up" duration={250}>
      {(styles) => <div style={styles}>{children}</div>}
    </Transition>
  );
}

export function LandingPage() {
  return (
    <Container size="lg" py="xl">
      <Stack gap={80}>
        <FadeUp>
          <Group justify="space-between" mt="sm">
          <Group gap="xs">
            <ThemeIcon size={32} radius="md" variant="light">
              <IconLayoutKanban size={18} />
            </ThemeIcon>
            <Title order={4}>TalentPipe</Title>
          </Group>
          <Group gap="lg" visibleFrom="xs">
            <Anchor component={Link} to="/jobs">
              Browse jobs
            </Anchor>
            <Anchor component={Link} to="/auth/signin">
              Sign in
            </Anchor>
            <Anchor component={Link} to="/auth/signup">
              Register
            </Anchor>
            <Anchor component={Link} to="/auth/company/signup">
              For companies
            </Anchor>
          </Group>
        </Group>
        </FadeUp>

        <FadeUp delay={80}>
          <Stack gap="lg" ta="center" maw={720} mx="auto">
          <Badge size="lg" variant="light">
            Applicant tracking system
          </Badge>
          <Title order={1} fw={900}>
            Hire better with a pipeline that works the way you do
          </Title>
          <Text size="lg" c="dimmed" maw={560} mx="auto">
            TalentPipe is a multi-company applicant tracking system with job
            postings, resume skill matching, kanban pipelines, interviews, and
            analytics — ready for your next hire.
          </Text>
          <Group justify="center" gap="md" mt="md">
            <Button
              component={Link}
              to="/jobs"
              size="lg"
              radius="md"
              leftSection={<IconBriefcase size={20} />}
            >
              Browse open positions
            </Button>
            <Button
              component={Link}
              to="/auth/signin"
              size="lg"
              radius="md"
              variant="outline"
            >
              Sign in
            </Button>
          </Group>
        </Stack>
        </FadeUp>

        <FadeUp delay={160}>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <Card key={title} withBorder padding="lg" radius="md">
              <Stack gap="sm">
                <ThemeIcon size={40} radius="md" variant="light">
                  <Icon size={22} />
                </ThemeIcon>
                <Title order={3} size="lg">
                  {title}
                </Title>
                <Text c="dimmed" size="sm">
                  {description}
                </Text>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
        </FadeUp>

        <FadeUp delay={240}>
          <Stack gap="xs" ta="center">
          <Title order={2}>Ready to find your next hire?</Title>
          <Text c="dimmed">
            Create a company account and post your first job in minutes.
          </Text>
          <Group justify="center" mt="sm">
            <Button component={Link} to="/auth/company/signup" size="md" radius="md">
              Create a company account
            </Button>
            <Button
              component={Link}
              to="/auth/signup"
              size="md"
              radius="md"
              variant="default"
            >
              Register as a candidate
            </Button>
          </Group>
        </Stack>
        </FadeUp>

        <Text ta="center" c="dimmed" size="sm" pb="md">
          © {new Date().getFullYear()} TalentPipe
        </Text>
      </Stack>
    </Container>
  );
}
