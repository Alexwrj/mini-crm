SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles',
    'objects',
    'tasks',
    'task_status_history'
  );