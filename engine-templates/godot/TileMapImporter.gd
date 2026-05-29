# Godot 4 runtime importer for POC Tile Editor "*.godot.json" exports.
#
# Usage:
#   1. Drop this script + your "<map>.godot.json" + the tileset PNG(s) into your project.
#   2. Add a Node2D to your scene, attach this script.
#   3. Set `json_path` (and `texture_dir` if PNGs live elsewhere) in the Inspector.
#   4. Run the scene — it builds a TileSet and one TileMapLayer per editor layer.
#
# Tested against Godot 4.3+ (uses TileMapLayer; for 4.2 use TileMap + layers).

extends Node2D

@export_file("*.json") var json_path: String = "res://map.godot.json"
@export_dir var texture_dir: String = ""   # leave empty to load PNGs next to the JSON

func _ready() -> void:
	var data := _load_json(json_path)
	if data.is_empty():
		push_error("TileMapImporter: could not read %s" % json_path)
		return

	var tile_size := Vector2i(int(data.tile_size[0]), int(data.tile_size[1]))
	var tileset := _build_tileset(data.tilesets, tile_size)

	for layer_data in data.layers:
		var layer := TileMapLayer.new()
		layer.name = String(layer_data.name)
		layer.tile_set = tileset
		layer.visible = bool(layer_data.get("visible", true))
		layer.modulate = Color(1, 1, 1, float(layer_data.get("modulate_alpha", 1.0)))
		add_child(layer)
		for cell in layer_data.cells:
			var coords := Vector2i(int(cell.x), int(cell.y))
			var source_id := int(cell.source)
			var atlas := Vector2i(int(cell.atlas[0]), int(cell.atlas[1]))
			layer.set_cell(coords, source_id, atlas)

func _build_tileset(tilesets: Array, tile_size: Vector2i) -> TileSet:
	var ts := TileSet.new()
	ts.tile_size = tile_size
	var base_dir := texture_dir if texture_dir != "" else json_path.get_base_dir()
	for entry in tilesets:
		var src := TileSetAtlasSource.new()
		var tex_path := base_dir.path_join(String(entry.image))
		var tex := load(tex_path)
		if tex == null:
			push_error("TileMapImporter: missing texture %s" % tex_path)
		src.texture = tex
		src.texture_region_size = Vector2i(
			int(entry.texture_region_size[0]), int(entry.texture_region_size[1]))
		src.margins = Vector2i(int(entry.get("margins", 0)), int(entry.get("margins", 0)))
		src.separation = Vector2i(int(entry.get("separation", 0)), int(entry.get("separation", 0)))
		# Register every tile coordinate that exists in the atlas.
		var cols := int(entry.columns)
		var count := int(entry.tile_count)
		for i in range(count):
			src.create_tile(Vector2i(i % cols, i / cols))
		ts.add_source(src, int(entry.source_id))
	return ts

func _load_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var text := FileAccess.get_file_as_string(path)
	var parsed = JSON.parse_string(text)
	return parsed if parsed is Dictionary else {}
