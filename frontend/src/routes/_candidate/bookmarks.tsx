import { createFileRoute } from '@tanstack/react-router';
import { BookmarksPage } from '@/features/candidate-account/bookmarks/BookmarksPage';

export const Route = createFileRoute('/_candidate/bookmarks')({
  component: BookmarksPage,
});
