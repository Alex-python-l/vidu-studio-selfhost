INSERT IGNORE INTO users (
  id, email, display_name, credit_balance, concurrency_limit, role, status,
  active_task_count, daily_credit_limit, daily_credit_spent
) VALUES (
  'k994772392@qq.com',
  'k994772392@qq.com',
  'Administrator',
  1000,
  3,
  'admin',
  'active',
  0,
  500,
  0
);
