CREATE TABLE IF NOT EXISTS category_size_guides (
    category_id TEXT PRIMARY KEY,
    description TEXT NOT NULL DEFAULT '',
    unit_label TEXT NOT NULL DEFAULT 'Medidas en centímetros',
    columns_json TEXT NOT NULL,
    rows_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);
