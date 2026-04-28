-- 005_set_timezone_asia_shanghai.sql
-- 将数据库默认时区设置为 Asia/Shanghai (UTC+8)，
-- 确保 NOW()、CURRENT_TIMESTAMP 等函数返回中国标准时间。

DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone = %L', current_database(), 'Asia/Shanghai');
END
$$;
