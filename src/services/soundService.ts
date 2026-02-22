class SoundService {
  private ctx: AudioContext | null = null;

  private bgmOsc: OscillatorType = 'sine';
  private bgmGain: GainNode | null = null;
  private isBgmPlaying: boolean = false;

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  async startBgm() {
    this.init();
    if (!this.ctx) return;
    
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    
    if (this.isBgmPlaying) return;
    this.isBgmPlaying = true;

    const playNote = (freq: number, startTime: number, type: OscillatorType = 'sine', vol: number = 0.02, dur: number = 0.5, decay: number = 0.5) => {
      if (!this.ctx || !this.isBgmPlaying) return;
      
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);
      
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(vol, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur * decay);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start(startTime);
      osc.stop(startTime + dur);
    };

    // "Classic" chill puzzle melody (C - G - Am - F)
    const melody = [
      523.25, 0, 523.25, 587.33, 659.25, 0, 659.25, 0,
      392.00, 0, 392.00, 440.00, 493.88, 0, 493.88, 0,
      440.00, 0, 440.00, 493.88, 523.25, 0, 523.25, 0,
      349.23, 0, 349.23, 392.00, 440.00, 0, 440.00, 0
    ];
    
    const bass = [
      261.63, 0, 261.63, 0, 196.00, 0, 196.00, 0,
      220.00, 0, 220.00, 0, 174.61, 0, 174.61, 0
    ];
    
    let nextNoteTime = this.ctx.currentTime;
    const tempo = 0.2; // Slightly slower, steady rhythm
    
    const scheduler = () => {
      if (!this.isBgmPlaying || !this.ctx) return;
      
      while (nextNoteTime < this.ctx.currentTime + 0.1) {
        const step = Math.floor(nextNoteTime / tempo) % 32;
        
        // Melody
        if (melody[step] > 0) {
          playNote(melody[step], nextNoteTime, 'triangle', 0.01, 0.25, 0.7);
        }
        
        // Bass on quarter notes
        if (step % 2 === 0) {
          const bassStep = Math.floor(step / 2) % bass.length;
          if (bass[bassStep] > 0) {
            playNote(bass[bassStep], nextNoteTime, 'sine', 0.02, 0.35, 0.4);
          }
        }

        // Soft percussion
        if (step % 4 === 0) {
          playNote(100, nextNoteTime, 'sine', 0.03, 0.1, 0.2); // Kick-ish
        }
        if (step % 4 === 2) {
          playNote(8000, nextNoteTime, 'square', 0.003, 0.05, 0.1); // Snare-ish
        }
        
        nextNoteTime += tempo;
      }
      setTimeout(scheduler, 50);
    };

    scheduler();
  }

  playWarning() {
    this.playTone(400, 'sawtooth', 0.1, 0.04);
    setTimeout(() => this.playTone(300, 'sawtooth', 0.1, 0.04), 100);
    setTimeout(() => this.playTone(400, 'sawtooth', 0.1, 0.04), 300);
    setTimeout(() => this.playTone(300, 'sawtooth', 0.1, 0.04), 400);
  }

  stopBgm() {
    this.isBgmPlaying = false;
  }

  private playTone(freq: number, type: OscillatorType, duration: number, volume: number = 0.1) {
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playClick() {
    this.playTone(600, 'sine', 0.1);
  }

  playMatch() {
    this.playTone(800, 'triangle', 0.2);
    setTimeout(() => this.playTone(1000, 'triangle', 0.2), 100);
  }

  playWin() {
    const tones = [523.25, 659.25, 783.99, 1046.50];
    tones.forEach((t, i) => {
      setTimeout(() => this.playTone(t, 'square', 0.3, 0.05), i * 150);
    });
  }

  playLose() {
    this.playTone(300, 'sawtooth', 0.5, 0.05);
    setTimeout(() => this.playTone(200, 'sawtooth', 0.5, 0.05), 200);
  }
}

export const soundService = new SoundService();
