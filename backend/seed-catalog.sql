INSERT OR IGNORE INTO categories
(id, name, slug, description, sort_order, is_active)
VALUES
('cat-ropa', 'ROPA', 'ropa', 'Prendas de la colección FerCastillo', 1, 1),
('cat-accesorios', 'ACCESORIOS', 'accesorios', 'Accesorios de la colección FerCastillo', 2, 1);

INSERT OR IGNORE INTO collections
(id, name, slug, status, sort_order)
VALUES
('col-rosa-temporada', 'ROSA DE TEMPORADA', 'rosa-de-temporada', 'draft', 1),
('col-esencia-femenina', 'ESENCIA FEMENINA', 'esencia-femenina', 'draft', 2);
