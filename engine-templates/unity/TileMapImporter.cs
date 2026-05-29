// Unity runtime importer for POC Tile Editor "*.unity.json" exports.
//
// Usage:
//   1. Put this script in your project (e.g. Assets/Scripts).
//   2. Put the "<map>.unity.json" file in a Resources folder (omit the extension
//      when setting `jsonResource`), and the tileset PNG(s) in the same folder
//      that `texturePath` points at (default: Resources).
//      Set each tileset texture's Import Settings: Texture Type = Sprite,
//      Read/Write Enabled = true, Filter = Point (for pixel art).
//   3. Add this component to an empty GameObject and press Play. It creates a
//      Grid with one Tilemap per editor layer.
//
// Tested against Unity 2021+ (com.unity.2d.tilemap).

using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Tilemaps;

public class TileMapImporter : MonoBehaviour
{
    [Tooltip("Resources path of the *.unity.json file (no extension).")]
    public string jsonResource = "map.unity";

    [Tooltip("Resources path prefix where tileset PNGs live.")]
    public string texturePath = "";

    [Serializable] public class TilesetDef {
        public int index; public string name; public string texture;
        public int textureWidth, textureHeight, tileWidth, tileHeight;
        public int columns, tileCount, margin, spacing;
    }
    [Serializable] public class Cell { public int x, y, tileset, sprite; }
    [Serializable] public class LayerDef {
        public string name; public bool visible; public float opacity;
        public int sortingOrder; public Cell[] cells;
    }
    [Serializable] public class MapDef {
        public int[] cellSize; public int[] mapSize;
        public TilesetDef[] tilesets; public LayerDef[] layers;
    }

    void Start()
    {
        var asset = Resources.Load<TextAsset>(jsonResource);
        if (asset == null) { Debug.LogError($"TileMapImporter: missing Resources/{jsonResource}"); return; }
        var map = JsonUtility.FromJson<MapDef>(asset.text);

        // Build a TileBase per (tileset, sprite index).
        var tilesByKey = new Dictionary<(int, int), TileBase>();
        foreach (var ts in map.tilesets)
            BuildTiles(ts, tilesByKey);

        var grid = new GameObject("Grid").AddComponent<Grid>();
        grid.cellSize = new Vector3(1, 1, 0);
        grid.transform.SetParent(transform, false);

        foreach (var layer in map.layers)
        {
            var go = new GameObject(layer.name);
            go.transform.SetParent(grid.transform, false);
            var tm = go.AddComponent<Tilemap>();
            var rend = go.AddComponent<TilemapRenderer>();
            rend.sortingOrder = layer.sortingOrder;
            tm.color = new Color(1, 1, 1, layer.opacity);
            go.SetActive(layer.visible);

            foreach (var c in layer.cells)
                if (tilesByKey.TryGetValue((c.tileset, c.sprite), out var tile))
                    tm.SetTile(new Vector3Int(c.x, c.y, 0), tile);
        }
    }

    void BuildTiles(TilesetDef ts, Dictionary<(int, int), TileBase> outTiles)
    {
        var tex = Resources.Load<Texture2D>(Combine(texturePath, StripExt(ts.texture)));
        if (tex == null) { Debug.LogError($"TileMapImporter: missing texture {ts.texture}"); return; }
        tex.filterMode = FilterMode.Point;

        int rows = ts.tileCount / Mathf.Max(1, ts.columns);
        for (int i = 0; i < ts.tileCount; i++)
        {
            int col = i % ts.columns;
            int row = i / ts.columns;
            // Unity sprite rects are bottom-up; flip the row.
            int px = ts.margin + col * (ts.tileWidth + ts.spacing);
            int py = ts.textureHeight - ts.margin - (row + 1) * ts.tileHeight - row * ts.spacing;
            var rect = new Rect(px, py, ts.tileWidth, ts.tileHeight);
            var sprite = Sprite.Create(tex, rect, new Vector2(0.5f, 0.5f), ts.tileWidth);
            var tile = ScriptableObject.CreateInstance<Tile>();
            tile.sprite = sprite;
            outTiles[(ts.index, i)] = tile;
        }
    }

    static string StripExt(string s)
    {
        int dot = s.LastIndexOf('.');
        return dot >= 0 ? s.Substring(0, dot) : s;
    }
    static string Combine(string prefix, string name)
        => string.IsNullOrEmpty(prefix) ? name : prefix.TrimEnd('/') + "/" + name;
}
