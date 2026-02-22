import { TILE_TYPES, TILE_SIZE } from '../constants';

export interface TileData {
  id: string;
  type: string;
  x: number;
  y: number;
  z: number;
  status: 'board' | 'slot' | 'matching' | 'cleared';
  addedAt?: number; // Timestamp when added to slot
}

export function checkOverlap(t1: TileData, t2: TileData): boolean {
  // Two tiles overlap if their bounding boxes intersect
  // Since tiles are TILE_SIZE x TILE_SIZE, and x, y are top-left coordinates
  return (
    t1.x < t2.x + TILE_SIZE &&
    t1.x + TILE_SIZE > t2.x &&
    t1.y < t2.y + TILE_SIZE &&
    t1.y + TILE_SIZE > t2.y
  );
}

export function isTileClickable(tile: TileData, allTiles: TileData[]): boolean {
  if (tile.status !== 'board') return false;
  
  const tileIndex = allTiles.findIndex(t => t.id === tile.id);
  
  for (let i = 0; i < allTiles.length; i++) {
    const other = allTiles[i];
    if (other.id === tile.id || other.status !== 'board') continue;
    
    // A tile is blocked if:
    // 1. There's a tile in a higher layer (z) that overlaps it
    // 2. There's a tile in the same layer (z) that overlaps it AND was added later (higher index)
    if (other.z > tile.z || (other.z === tile.z && i > tileIndex)) {
      if (checkOverlap(tile, other)) {
        return false;
      }
    }
  }
  return true;
}

// Simple seedable random number generator
class SeededRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  // LCG algorithm
  next() {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }
}

export function generateLevel(level: number): TileData[] {
  const rng = new SeededRandom(level + 1000); // Offset to avoid simple seeds
  
  // Board dimensions - increased for better playability
  const boardWidth = 320;
  const boardHeight = 480;
  const gridStep = TILE_SIZE / 2; // Half-tile grid for more organic feel
  
  // Base number of sets (3 tiles per set)
  let numSets = 4;
  if (level === 2) numSets = 15;
  if (level > 2) numSets = 15 + (level - 2) * 5;
  
  numSets = Math.min(numSets, 60); // Cap at 180 tiles total
  
  // Number of different types of tiles
  const numTypes = Math.min(3 + level * 2, TILE_TYPES.length);
  const availableTypes = TILE_TYPES.slice(0, numTypes);
  
  let typesToPlace: string[] = [];
  for (let i = 0; i < numSets; i++) {
    const type = availableTypes[Math.floor(rng.next() * availableTypes.length)];
    typesToPlace.push(type, type, type);
  }
  
  // Shuffle types using seeded RNG
  for (let i = typesToPlace.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [typesToPlace[i], typesToPlace[j]] = [typesToPlace[j], typesToPlace[i]];
  }
  
  const tiles: TileData[] = [];
  const layers = Math.min(3 + level * 2, 12);
  const tilesPerLayer = Math.ceil(typesToPlace.length / layers);
  
  let typeIndex = 0;

  for (let z = 0; z < layers; z++) {
    const layerMargin = 20 + z * 5;
    const availableWidth = boardWidth - TILE_SIZE - layerMargin * 2;
    const availableHeight = boardHeight - TILE_SIZE - layerMargin * 2;
    
    for (let i = 0; i < tilesPerLayer; i++) {
      if (typeIndex >= typesToPlace.length) break;
      
      let x = 0, y = 0;
      let attempts = 0;
      
      do {
        const gridX = Math.floor(rng.next() * (availableWidth / gridStep));
        const gridY = Math.floor(rng.next() * (availableHeight / gridStep));
        
        x = layerMargin + gridX * gridStep;
        y = layerMargin + gridY * gridStep;
        
        const samePosInCurrent = tiles.some(t => t.z === z && t.x === x && t.y === y);
        const samePosInBelow = z > 0 && tiles.some(t => t.z === z - 1 && t.x === x && t.y === y);
        
        if (!samePosInCurrent && !samePosInBelow) {
          break;
        }
        attempts++;
      } while (attempts < 30);
      
      tiles.push({
        id: `tile-${z}-${i}-${typeIndex}`,
        type: typesToPlace[typeIndex],
        x,
        y,
        z,
        status: 'board'
      });
      
      typeIndex++;
    }
  }
  
  return tiles;
}
