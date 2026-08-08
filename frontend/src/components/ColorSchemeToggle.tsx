import { ActionIcon, useMantineColorScheme, useComputedColorScheme, Tooltip } from '@mantine/core';
import { IconSun, IconMoon } from '@tabler/icons-react';

export function ColorSchemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme('light');

  return (
    <Tooltip label={computed === 'dark' ? 'Light mode' : 'Dark mode'}>
      <ActionIcon
        variant="subtle"
        color="gray"
        onClick={() => setColorScheme(computed === 'dark' ? 'light' : 'dark')}
        size="lg"
        aria-label="Toggle color scheme"
      >
        {computed === 'dark' ? <IconSun size="1.2rem" /> : <IconMoon size="1.2rem" />}
      </ActionIcon>
    </Tooltip>
  );
}
