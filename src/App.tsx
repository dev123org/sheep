/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LucideRefreshCw, LucideTrophy, LucideAlertCircle, LucideChevronRight, LucideVolume2, LucideVolumeX } from 'lucide-react';
import { SLOT_SIZE } from './constants';
import { TileData, generateLevel, isTileClickable } from './utils/gameLogic';
import { soundService } from './services/soundService';
import { videoService } from './services/videoService';

// Extend window interface for AI Studio API
declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export default function App() {
  const [level, setLevel] = useState(1);
  const [tiles, setTiles] = useState<TileData[]>([]);
  const [gameState, setGameState] = useState<'start' | 'playing' | 'won' | 'lost' | 'loading_video'>('start');
  const [muted, setMuted] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // Derived state
  const slot = tiles
    .filter(t => t.status === 'slot' || t.status === 'matching')
    .sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return (a.addedAt || 0) - (b.addedAt || 0);
    });

  const isLastSlotWarning = useMemo(() => {
    if (gameState !== 'playing') return false;
    
    // Only count tiles that are actually sitting in the slot waiting (not matching/clearing)
    const activeInSlot = tiles.filter(t => t.status === 'slot');
    
    // Warning only when exactly 6 tiles are in slot (SLOT_SIZE - 1)
    if (activeInSlot.length !== SLOT_SIZE - 1) return false;
    
    // If any tiles are currently in 'matching' state, a match is already being processed
    // so the slot will soon have more space. Don't warn.
    if (tiles.some(t => t.status === 'matching')) return false;
    
    // Check if the current 6 tiles already contain a match that hasn't been 
    // picked up by the matching useEffect yet.
    const typeCount: Record<string, number> = {};
    activeInSlot.forEach(t => {
      typeCount[t.type] = (typeCount[t.type] || 0) + 1;
    });
    const hasPendingMatch = Object.values(typeCount).some(count => count >= 3);
    
    return !hasPendingMatch;
  }, [tiles, gameState]);

  const totalTiles = tiles.length;
  const clearedTiles = tiles.filter(t => t.status === 'cleared').length;
  const remainingTiles = tiles.filter(t => t.status === 'board').length;
  const progress = totalTiles > 0 ? (clearedTiles / totalTiles) * 100 : 0;

  useEffect(() => {
    if (isLastSlotWarning && !muted) {
      soundService.playWarning();
    }
  }, [isLastSlotWarning, muted]);

  useEffect(() => {
    if (gameState === 'playing' && !muted) {
      soundService.startBgm();
    } else {
      soundService.stopBgm();
    }
    return () => soundService.stopBgm();
  }, [gameState, muted]);

  // Initialize game
  const initGame = useCallback(async (lvl: number) => {
    setGameState('loading_video');
    try {
      // Get static video URL
      const url = await videoService.getLevelVideo(lvl);
      setVideoUrl(url);
      
      const newTiles = generateLevel(lvl);
      setTiles(newTiles);
      setGameState('playing');
    } catch (error) {
      console.error("Video loading failed:", error);
      const newTiles = generateLevel(lvl);
      setTiles(newTiles);
      setGameState('playing');
    }
  }, []);

  const startGame = () => {
    setLevel(1);
    initGame(1);
    soundService.startBgm();
  };

  // Handle tile click
  const handleTileClick = (tile: TileData) => {
    if (gameState !== 'playing') return;

    setTiles(prev => {
      // Find the tile in the latest state to prevent double-clicks
      const currentTile = prev.find(t => t.id === tile.id);
      if (!currentTile || currentTile.status !== 'board') return prev;
      
      // Check if it's actually clickable in the latest state
      if (!isTileClickable(currentTile, prev)) return prev;

      // Check slot capacity in the latest state
      const currentSlotCount = prev.filter(t => t.status === 'slot').length;
      if (currentSlotCount >= SLOT_SIZE) return prev;

      if (!muted) soundService.playClick();

      // Move tile to slot
      return prev.map(t => 
        t.id === tile.id ? { ...t, status: 'slot' as const, addedAt: Date.now() } : t
      );
    });
  };

  // Match detection logic
  useEffect(() => {
    if (gameState !== 'playing') return;

    // Only match tiles that are in 'slot' status (not already 'matching')
    const matchableInSlot = tiles.filter(t => t.status === 'slot');
    
    const typeCount = matchableInSlot.reduce((acc, t) => {
      acc[t.type] = (acc[t.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const matchedType = Object.keys(typeCount).find(type => typeCount[type] >= 3);

    if (matchedType) {
      if (!muted) soundService.playMatch();
      
      // Find the specific 3 IDs to clear (the ones that have been in the slot longest for this type)
      const tilesOfThisType = matchableInSlot
        .filter(t => t.type === matchedType)
        .sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
      
      const idsToMatch = tilesOfThisType.slice(0, 3).map(t => t.id);

      // Immediately mark as matching to prevent double-processing
      setTiles(prev => prev.map(t => 
        idsToMatch.includes(t.id) ? { ...t, status: 'matching' as const } : t
      ));

      const timer = setTimeout(() => {
        setTiles(prev => prev.map(t => 
          idsToMatch.includes(t.id) ? { ...t, status: 'cleared' as const } : t
        ));
      }, 300);
    }
  }, [tiles, gameState, muted]);

  // Check win/loss conditions
  useEffect(() => {
    if (gameState !== 'playing') return;

    const remainingOnBoard = tiles.filter(t => t.status === 'board').length;
    const slotTiles = tiles.filter(t => t.status === 'slot');
    const matchingTiles = tiles.filter(t => t.status === 'matching');
    
    // Win condition: board is empty and no tiles left in slot (including those currently matching)
    if (tiles.length > 0 && remainingOnBoard === 0 && slotTiles.length === 0 && matchingTiles.length === 0) {
      setGameState('won');
      if (!muted) soundService.playWin();
    }

    // Loss condition: slot is full of non-matching tiles
    if (slotTiles.length === SLOT_SIZE) {
      const typeCount = slotTiles.reduce((acc, t) => {
        acc[t.type] = (acc[t.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const hasMatch = Object.values(typeCount).some((count: number) => count >= 3);
      if (!hasMatch) {
        setGameState('lost');
        if (!muted) soundService.playLose();
      }
    }
  }, [tiles, gameState, muted]);

  const nextLevel = async () => {
    const nextLvl = level + 1;
    setLevel(nextLvl);
    await initGame(nextLvl);
    soundService.startBgm();
  };

  const restartLevel = async () => {
    await initGame(level);
    soundService.startBgm();
  };

  return (
    <div className="h-screen bg-[#f0f4f8] flex flex-col items-center p-2 sm:p-4 font-sans text-[#2d3748] overflow-hidden">
      {/* Header & Progress consolidated */}
      <div className="w-full max-w-md flex flex-col gap-1 mb-2">
        <div className="flex justify-between items-center">
          <div className="flex items-baseline gap-2">
            <h1 className="text-xl font-black tracking-tighter text-[#1a202c] uppercase">羊了个羊</h1>
            <span className="text-xs font-bold text-[#718096] uppercase tracking-widest">Lvl {level}</span>
          </div>
          <div className="flex gap-1">
            <button 
              onClick={() => setMuted(!muted)}
              className="p-1.5 bg-white rounded-full shadow-sm hover:shadow-md transition-shadow text-[#4a5568]"
            >
              {muted ? <LucideVolumeX size={16} /> : <LucideVolume2 size={16} />}
            </button>
            <button 
              onClick={restartLevel}
              className="p-1.5 bg-white rounded-full shadow-sm hover:shadow-md transition-shadow text-[#4a5568]"
              title="Restart Level"
            >
              <LucideRefreshCw size={16} />
            </button>
          </div>
        </div>
        
        <div className="flex justify-between items-center px-1">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-24 bg-gray-200 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-emerald-500"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[10px] font-bold text-[#718096]">
              {Math.round(progress)}%
            </span>
          </div>
          <div className="text-[10px] font-bold text-[#718096] uppercase tracking-tighter">
            Remaining: <span className="text-[#1a202c]">{remainingTiles}</span> / {totalTiles}
          </div>
        </div>
      </div>

      {/* Warning Overlay */}
      <AnimatePresence>
        {isLastSlotWarning && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.15, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5, repeat: 2, ease: "easeInOut" }}
            className="fixed inset-0 bg-red-600 pointer-events-none z-40"
          />
        )}
      </AnimatePresence>

      {/* Game Board */}
      <div className="relative w-full max-w-[360px] flex-1 min-h-0 bg-black rounded-2xl border-4 border-[#cbd5e0] shadow-[inset_0_4px_10px_rgba(0,0,0,0.1)] overflow-hidden">
        {videoUrl && (
          <>
            <video 
              src={videoUrl} 
              autoPlay 
              loop 
              muted 
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Reveal Overlay: Blurs and darkens the video, clearing up as progress increases */}
            <motion.div 
              className="absolute inset-0 bg-black/40 backdrop-blur-md z-0 pointer-events-none"
              animate={{ 
                backdropFilter: `blur(${Math.max(0, 20 - (progress / 100) * 20)}px)`,
                backgroundColor: `rgba(0,0,0,${Math.max(0, 0.4 - (progress / 100) * 0.4)})`
              }}
              transition={{ duration: 0.5 }}
            />
          </>
        )}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5 z-0">
          <span className="text-6xl font-black text-white">SHEEP</span>
        </div>
        
        <AnimatePresence>
          {tiles.filter(t => t.status === 'board').map((tile) => {
            const clickable = isTileClickable(tile, tiles);
            // Visual offset for depth
            const depthOffset = tile.z * 2;
            return (
              <motion.div
                key={tile.id}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ 
                  scale: 1, 
                  opacity: 1,
                  left: tile.x - depthOffset,
                  top: tile.y - depthOffset,
                }}
                exit={{ scale: 0, opacity: 0 }}
                onClick={() => handleTileClick(tile)}
                className={`absolute w-[48px] h-[48px] flex items-center justify-center text-2xl bg-white rounded-lg border border-[#e2e8f0] cursor-pointer select-none transition-all
                  ${clickable 
                    ? 'hover:-translate-y-1 active:translate-y-0 shadow-[0_6px_0_#cbd5e0,0_8px_15px_rgba(0,0,0,0.1)]' 
                    : 'brightness-75 cursor-not-allowed shadow-[0_2px_0_#94a3b8]'
                  }
                `}
                style={{ zIndex: tile.z + 10 }}
              >
                {tile.type}
                {!clickable && (
                  <div className="absolute inset-0 bg-black/10 rounded-lg pointer-events-none" />
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Slot */}
      <div className="w-full max-w-md flex flex-col items-center px-4 mt-2 mb-1">
        <motion.div 
          animate={isLastSlotWarning ? { borderColor: ['#1a202c', '#e53e3e', '#1a202c'] } : {}}
          transition={isLastSlotWarning ? { duration: 0.5, repeat: Infinity } : {}}
          className={`w-full h-20 bg-[#2d3748] rounded-2xl flex items-center justify-center gap-1 sm:gap-2 border-b-8 relative overflow-hidden transition-colors ${isLastSlotWarning ? 'border-red-500' : 'border-[#1a202c]'}`}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
          {isLastSlotWarning && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: [1, 1.1, 1] }}
              className="absolute top-1 text-[12px] font-black text-red-500 uppercase tracking-widest z-10 bg-white/80 px-2 py-0.5 rounded-full shadow-sm"
            >
              ⚠️ LAST SLOT! ⚠️
            </motion.div>
          )}
          <AnimatePresence mode="popLayout">
            {slot.map((tile, index) => (
              <motion.div
                key={`${tile.id}-slot-${index}`}
                initial={{ scale: 0, x: -20 }}
                animate={{ scale: 1, x: 0 }}
                exit={{ scale: 0, opacity: 0, y: 20 }}
                transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                className={`w-[11%] aspect-square max-w-[44px] flex items-center justify-center text-lg sm:text-xl bg-white rounded-lg shadow-[0_2px_0_#cbd5e0] border border-[#e2e8f0] shrink-0
                  ${tile.status === 'matching' ? 'brightness-125 scale-110' : ''}
                `}
              >
                {tile.type}
              </motion.div>
            ))}
          </AnimatePresence>
          {/* Slot placeholders */}
          {Array.from({ length: Math.max(0, SLOT_SIZE - slot.length) }).map((_, i) => (
            <div key={`empty-${i}`} className="w-[11%] aspect-square max-w-[44px] bg-black/20 rounded-lg border border-white/5 shrink-0" />
          ))}
        </motion.div>
      </div>

      {/* Overlays */}
      <AnimatePresence>
        {gameState === 'start' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-[#f0f4f8] flex items-center justify-center z-50 p-6"
          >
            <motion.div 
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="text-center"
            >
              <motion.div 
                animate={{ y: [0, -20, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="text-8xl mb-8"
              >
                🐑
              </motion.div>
              <h1 className="text-5xl font-black mb-4 text-[#1a202c]">羊了个羊</h1>
              <p className="text-[#718096] mb-12 max-w-xs mx-auto">史上最难的消除游戏，你能过第二关吗？</p>
              <button 
                onClick={startGame}
                className="px-12 py-5 bg-[#2d3748] text-white rounded-2xl font-bold text-xl shadow-xl hover:bg-[#1a202c] transition-all hover:scale-105 active:scale-95"
              >
                开始挑战
              </button>
            </motion.div>
          </motion.div>
        )}

        {gameState === 'won' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-6"
          >
            <motion.div 
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-[2rem] p-8 max-w-sm w-full text-center shadow-2xl"
            >
              <div className="w-20 h-20 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <LucideTrophy size={40} />
              </div>
              <h2 className="text-3xl font-black mb-2 text-[#1a202c]">挑战成功!</h2>
              <p className="text-[#718096] mb-8">你竟然通过了第 {level} 关！你就是万中无一的天才！</p>
              
              <button 
                onClick={nextLevel}
                className="w-full py-4 bg-[#2d3748] text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-[#1a202c] transition-colors shadow-lg"
              >
                进入下一关 <LucideChevronRight size={20} />
              </button>
            </motion.div>
          </motion.div>
        )}

        {gameState === 'loading_video' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-[#f0f4f8] flex flex-col items-center justify-center z-50 p-6 text-center"
          >
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="text-6xl mb-6"
            >
              ⏳
            </motion.div>
            <h2 className="text-2xl font-black mb-2 text-[#1a202c]">正在为你准备关卡...</h2>
            <p className="text-[#718096] max-w-xs">
              正在加载本关专属背景视频，请稍候。
            </p>
            <div className="mt-8 flex gap-2">
              <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0 }} className="w-2 h-2 bg-emerald-500 rounded-full" />
              <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-2 h-2 bg-emerald-500 rounded-full" />
              <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-2 h-2 bg-emerald-500 rounded-full" />
            </div>
          </motion.div>
        )}

        {gameState === 'lost' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-6"
          >
            <motion.div 
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-[2rem] p-8 max-w-sm w-full text-center shadow-2xl"
            >
              <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <LucideAlertCircle size={40} />
              </div>
              <h2 className="text-3xl font-black mb-2">Game Over</h2>
              <p className="text-[#718096] mb-8">The slot is full! Don't give up, try again.</p>
              <button 
                onClick={restartLevel}
                className="w-full py-4 bg-[#2d3748] text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-[#1a202c] transition-colors shadow-lg"
              >
                Try Again <LucideRefreshCw size={20} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Info */}
      <div className="py-2 text-center opacity-50">
        <p className="text-[10px] font-medium">Match 3 identical tiles to clear them</p>
      </div>
    </div>
  );
}

