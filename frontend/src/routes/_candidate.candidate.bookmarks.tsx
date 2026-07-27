import { createFileRoute } from '@tanstack/react-router';
import { BookmarksPage } from '../features/candidate/bookmarks/BookmarksPage';

export const Route = createFileRoute('/_candidate/candidate/bookmarks')({
  component: BookmarksPage,
});
