import { Pool } from 'pg'

export function createDatabasePool(databaseUrl: string) {
  return new Pool({ connectionString: databaseUrl })
}

export async function migrateDatabase(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_types (
      public_id varchar(64) PRIMARY KEY,
      name varchar(80) NOT NULL,
      description varchar(500),
      duration_minutes integer NOT NULL CHECK (
        duration_minutes BETWEEN 15 AND 480
        AND duration_minutes % 15 = 0
      ),
      publication_state varchar(16) NOT NULL DEFAULT 'published' CHECK (
        publication_state IN ('published', 'hidden')
      ),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS calendar_settings (
      singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
      time_zone varchar(255) NOT NULL DEFAULT 'Europe/Moscow',
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    INSERT INTO calendar_settings (singleton)
    VALUES (true)
    ON CONFLICT (singleton) DO NOTHING;

    CREATE TABLE IF NOT EXISTS weekly_availability_days (
      weekday varchar(16) PRIMARY KEY,
      enabled boolean NOT NULL DEFAULT false
    );

    INSERT INTO weekly_availability_days (weekday)
    VALUES
      ('monday'), ('tuesday'), ('wednesday'), ('thursday'),
      ('friday'), ('saturday'), ('sunday')
    ON CONFLICT (weekday) DO NOTHING;

    CREATE TABLE IF NOT EXISTS weekly_availability_intervals (
      weekday varchar(16) NOT NULL REFERENCES weekly_availability_days(weekday)
        ON DELETE CASCADE,
      start_time time NOT NULL,
      end_time time NOT NULL,
      PRIMARY KEY (weekday, start_time),
      CHECK (start_time < end_time)
    );

    CREATE TABLE IF NOT EXISTS availability_exceptions (
      exception_date date PRIMARY KEY,
      mode varchar(16) NOT NULL CHECK (mode IN ('closed', 'custom')),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS availability_exception_intervals (
      exception_date date NOT NULL REFERENCES availability_exceptions(exception_date)
        ON DELETE CASCADE,
      start_time time NOT NULL,
      end_time time NOT NULL,
      PRIMARY KEY (exception_date, start_time),
      CHECK (start_time < end_time)
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id uuid PRIMARY KEY,
      event_type_public_id varchar(64) NOT NULL REFERENCES event_types(public_id)
        ON DELETE RESTRICT,
      event_public_id_snapshot varchar(64) NOT NULL,
      event_name_snapshot varchar(80) NOT NULL,
      event_duration_minutes_snapshot integer NOT NULL,
      start_at timestamptz NOT NULL,
      end_at timestamptz NOT NULL,
      guest_name varchar(100) NOT NULL,
      guest_email varchar(254) NOT NULL,
      guest_time_zone varchar(255) NOT NULL,
      idempotency_key varchar(128) NOT NULL UNIQUE,
      request_hash varchar(64) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (start_at < end_at),
      EXCLUDE USING gist (tstzrange(start_at, end_at, '[)') WITH &&)
    )
  `)
}

export async function cleanupExpiredBookings(pool: Pool, now: Date) {
  await pool.query(
    `DELETE FROM bookings WHERE end_at <= $1::timestamptz - interval '30 days'`,
    [now.toISOString()],
  )
}
